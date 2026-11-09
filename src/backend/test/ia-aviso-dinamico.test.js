import { describe, expect, it } from 'vitest';
import { crearProveedorDinamico } from '../src/llm/dinamico.js';
import { createTestApp } from './helpers.js';

const falso = (extra = {}) => ({ name: 'gemini', model: 'gemini-x', userMessage: (t) => t, toolResultMessages: () => [], step: async () => ({ kind: 'final', text: 'ok' }), ...extra });

// La pantalla de bienvenida envuelve al proveedor real en uno que se puede cambiar en caliente. El aviso de
// "LLM_PROVIDER no tenía llave, uso otro" lo pone crearProveedor sobre el proveedor real: el envoltorio tiene que dejarlo pasar.
describe('el proveedor dinámico deja pasar el aviso del proveedor real', () => {
  it('lo expone mientras ese proveedor está activo, y lo suelta al cambiar o al quedar sin IA', () => {
    const p = crearProveedorDinamico(falso({ aviso: 'LLM_PROVIDER=anthropic no tiene llave: uso gemini.' }), 'gemini');
    expect(p.aviso).toBe('LLM_PROVIDER=anthropic no tiene llave: uso gemini.');
    p.cambiar(falso({ name: 'openrouter' }), 'openrouter');
    expect(p.aviso).toBe('');
    p.cambiar(falso({ aviso: 'otro aviso' }));
    expect(p.aviso).toBe('otro aviso');
    p.cambiar(null);
    expect(p.aviso).toBe('');
    expect(p.activo).toBe(false);
  });

  it('sin proveedor desde el arranque tampoco hay aviso', () => {
    expect(crearProveedorDinamico(null).aviso).toBe('');
  });

  it('/health lo cuenta a través del proveedor dinámico, y no cuando no hay IA activa', async () => {
    const con = createTestApp({ provider: crearProveedorDinamico(falso({ aviso: 'LLM_PROVIDER=anthropic no tiene llave' }), 'gemini') });
    expect((await con.app.inject({ url: '/health' })).json()).toMatchObject({ ok: true, proveedor: 'gemini', aviso: 'LLM_PROVIDER=anthropic no tiene llave' });
    const sin = createTestApp({ provider: crearProveedorDinamico(null) });
    const h = (await sin.app.inject({ url: '/health' })).json();
    expect(h).not.toHaveProperty('proveedor');
    expect(h).not.toHaveProperty('aviso');
  });
});

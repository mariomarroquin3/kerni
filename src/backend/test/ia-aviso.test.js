import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { crearProveedor, elegirConAviso, elegirProveedor } from '../src/llm/proveedores.js';
import { createTestApp } from './helpers.js';

const cfg = (env) => loadConfig(env);

// El caso real que dejó a Kerni sin modelo durante días: LLM_PROVIDER=anthropic, su llave vacía y la de Gemini puesta.
describe('LLM_PROVIDER sin su llave', () => {
  const env = { LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: 'g-123', OPENROUTER_API_KEY: 'o-456' };

  it('usa el primer proveedor que sí tiene llave y explica por qué', () => {
    const { nombre, aviso } = elegirConAviso(cfg(env));
    expect(nombre).toBe('gemini');
    expect(aviso).toMatch(/LLM_PROVIDER=anthropic no tiene llave/);
    expect(aviso).toMatch(/ANTHROPIC_API_KEY está vacía/);
    expect(aviso).toMatch(/uso gemini/);
  });

  it('respeta el orden de preferencia entre los que sí tienen llave', () => {
    expect(elegirConAviso(cfg({ LLM_PROVIDER: 'gemini', OPENROUTER_API_KEY: 'o' })).nombre).toBe('openrouter');
    expect(elegirConAviso(cfg({ LLM_PROVIDER: 'openrouter', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' })).nombre).toBe('anthropic');
  });

  it('no avisa de nada cuando todo está bien (pedido con llave, o sin pedido)', () => {
    expect(elegirConAviso(cfg({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }))).toEqual({ nombre: 'gemini', aviso: '' });
    expect(elegirConAviso(cfg({ GEMINI_API_KEY: 'g' }))).toEqual({ nombre: 'gemini', aviso: '' });
    expect(elegirConAviso(cfg({}))).toEqual({ nombre: null, aviso: '' });
  });

  it('sin ninguna llave, o con un nombre inventado, sigue fallando con el mensaje claro', () => {
    expect(() => elegirConAviso(cfg({ LLM_PROVIDER: 'gemini' }))).toThrow(/GEMINI_API_KEY/);
    expect(() => elegirConAviso(cfg({ LLM_PROVIDER: 'gpt', GEMINI_API_KEY: 'g' }))).toThrow(/anthropic, gemini, openrouter/);
    // y elegirProveedor, que usan los demás, no cambió
    expect(() => elegirProveedor(cfg(env))).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('el proveedor que se arma lleva el aviso y es el que tiene llave', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'hola' } }] }), { status: 200 }));
    const r = crearProveedor(cfg(env), { fetchImpl });
    expect(r.nombre).toBe('gemini');
    expect(r.provider.name).toBe('gemini');
    expect(r.provider.aviso).toBe(r.aviso);
    await r.provider.step({ persona: 'P', contexto: 'C', tools: [], history: [r.provider.userMessage('hola')] });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer g-123'); // se usó la llave de Gemini, no la vacía
  });

  it('sin aviso, el proveedor no trae la propiedad', () => {
    const r = crearProveedor(cfg({ GEMINI_API_KEY: 'g' }), { fetchImpl: vi.fn() });
    expect(r.aviso).toBe('');
    expect('aviso' in r.provider).toBe(false);
  });
});

describe('/health cuenta por qué se usa otra IA', () => {
  const falso = (extra = {}) => ({ name: 'gemini', model: 'gemini-x', userMessage: (t) => t, toolResultMessages: () => [], step: async () => ({}), ...extra });

  it('incluye el aviso cuando hay uno y no lo incluye cuando no', async () => {
    const con = createTestApp({ provider: falso({ aviso: 'LLM_PROVIDER=anthropic no tiene llave' }) });
    const a = (await con.app.inject({ url: '/health' })).json();
    expect(a).toMatchObject({ ok: true, proveedor: 'gemini', modelo: 'gemini-x', aviso: 'LLM_PROVIDER=anthropic no tiene llave' });
    const sin = createTestApp({ provider: falso() });
    expect((await sin.app.inject({ url: '/health' })).json()).not.toHaveProperty('aviso');
  });
});

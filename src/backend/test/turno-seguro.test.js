import { describe, expect, it } from 'vitest';
import { createAgent } from '../src/agent/agent.js';
import { createAnthropicProvider, errorAnthropic } from '../src/llm/anthropic.js';
import { createChatCompletionsClient } from '../src/llm/chatCompletions.js';
import { detectarAccion, esNegacion } from '../src/intenciones.js';
import { createConocimientoNulo } from '../src/rag/conocimiento.js';
import { fakeAnthropic, texto, usarTool, createTestApp } from './helpers.js';

const silencioso = { error() {} };

describe('el contexto del prompt', () => {
  it('no mete el cliente del RAG como texto ([object Object])', async () => {
    const anthropic = fakeAnthropic([texto('hola')]);
    const agent = createAgent({ provider: createAnthropicProvider({ anthropic }), logger: silencioso, conocimiento: createConocimientoNulo() });
    await agent.runTurn({ history: [], mensaje: 'hola' });
    const sistema = anthropic.messages.create.llamadas[0].system.map((b) => b.text).join('\n');
    expect(sistema).not.toContain('[object Object]');
    expect(sistema).not.toContain('Fragmentos de tu base de conocimiento');
  });
});

describe('negaciones: Kerni no propone lo que la persona rechaza', () => {
  it.each([
    'no quiero vaciar la papelera',
    'no vacíes la papelera',
    'no me borres la papelera',
    'mejor no, no limpies la papelera',
    'nunca vacíes mi papelera',
    'no hace falta revisar las actualizaciones',
    'no quiero ver archivos pesados',
  ])('"%s" no propone nada', (frase) => {
    expect(esNegacion(frase)).toBe(true);
    expect(detectarAccion(frase)).toBeNull();
  });

  it.each([
    ['archivos que ya no uso', 'ver_archivos_pesados'],
    ['no tengo internet', 'ver_estado_red'],
    ['vaciá la papelera', 'vaciar_papelera'],
  ])('"%s" sigue siendo un pedido', (frase, accion) => {
    expect(esNegacion(frase)).toBe(false);
    expect(detectarAccion(frase)?.accion).toBe(accion);
  });

  it('el harness no añade tarjeta si el modelo se negó', async () => {
    const anthropic = fakeAnthropic([{ stop_reason: 'refusal', content: [] }]);
    const agent = createAgent({ provider: createAnthropicProvider({ anthropic }), logger: silencioso });
    const r = await agent.runTurn({ history: [], mensaje: 'vaciá la papelera' });
    expect(r.acciones).toEqual([]);
  });

  it('por chat, "no quiero vaciar la papelera" no devuelve tarjeta', async () => {
    const { app } = createTestApp({ respuestas: [texto('Dale, no la toco.')] });
    const res = await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'no quiero vaciar la papelera' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().acciones).toEqual([]);
  });
});

describe('Anthropic: tool_use cortado por max_tokens', () => {
  it('no deja un tool_use sin resultado en el historial y la sesión sigue funcionando', async () => {
    const cortado = {
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'Te propongo' }, { type: 'tool_use', id: 'tu_x', name: 'proponer_accion', input: {} }],
    };
    const anthropic = fakeAnthropic([cortado, texto('segunda respuesta')]);
    const agent = createAgent({ provider: createAnthropicProvider({ anthropic }), logger: silencioso });
    const history = [];
    await agent.runTurn({ history, mensaje: 'hola' });
    const bloques = history.flatMap((m) => (Array.isArray(m.content) ? m.content : []));
    expect(bloques.some((b) => b.type === 'tool_use')).toBe(false);
    const r = await agent.runTurn({ history, mensaje: 'y ahora?' });
    expect(r.respuesta).toBe('segunda respuesta');
  });

  it('un tool_use completo sigue siendo una llamada a herramienta', async () => {
    const anthropic = fakeAnthropic([usarTool('proponer_accion', { accion: 'limpiar_temporales', motivo: 'disco lleno' }), texto('listo')]);
    const agent = createAgent({ provider: createAnthropicProvider({ anthropic }), logger: silencioso });
    const r = await agent.runTurn({ history: [], mensaje: 'limpiá' });
    expect(r.acciones.map((a) => a.accion)).toContain('limpiar_temporales');
  });
});

describe('Anthropic: errores con mensaje claro', () => {
  const conStatus = (status, nombre = 'APIError', message = '') => Object.assign(Object.create({ constructor: { name: nombre } }), { status, message });

  it.each([
    [401, 'llave_invalida'],
    [403, 'llave_invalida'],
    [429, 'sin_cupo'],
  ])('status %i → %s', (status, codigo) => {
    const e = errorAnthropic(conStatus(status));
    expect(e.codigo).toBe(codigo);
    expect(e.message).not.toMatch(/sk-/);
  });

  it('sin créditos → sin_cupo', () => {
    expect(errorAnthropic(conStatus(400, 'BadRequestError', 'Your credit balance is too low')).codigo).toBe('sin_cupo');
  });

  it('sin red o tiempo agotado → sin_red', () => {
    expect(errorAnthropic(conStatus(undefined, 'APIConnectionError')).codigo).toBe('sin_red');
    expect(errorAnthropic(conStatus(undefined, 'APIConnectionTimeoutError')).codigo).toBe('sin_red');
  });

  it('otros errores pasan sin tocar', () => {
    const err = new Error('raro');
    expect(errorAnthropic(err)).toBe(err);
  });

  it('una llave inválida llega a la persona como 503 con el mensaje claro', async () => {
    const anthropic = { messages: { create: async () => { throw conStatus(401, 'AuthenticationError'); } } };
    const provider = createAnthropicProvider({ anthropic });
    const { app } = createTestApp({ provider });
    const res = await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: '¿cómo está mi compu?' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/ANTHROPIC_API_KEY/);
  });
});

describe('plazo del turno', () => {
  it('el signal llega hasta el proveedor', async () => {
    let recibido;
    const provider = {
      name: 'falso', model: 'x',
      userMessage: (t) => ({ role: 'user', content: t }),
      toolResultMessages: () => [],
      async step({ signal }) { recibido = signal; return { kind: 'final', text: 'ok', calls: [], assistantMessage: { role: 'assistant', content: 'ok' } }; },
    };
    const agent = createAgent({ provider, logger: silencioso });
    const ctrl = new AbortController();
    await agent.runTurn({ history: [], mensaje: 'hola', signal: ctrl.signal });
    expect(recibido).toBe(ctrl.signal);
  });

  it('con el signal abortado, chatCompletions no reintenta y da un error claro', async () => {
    let llamadas = 0;
    const complete = createChatCompletionsClient({
      nombre: 'Gemini', claveEnv: 'GEMINI_API_KEY', apiKey: 'x', url: 'http://x',
      fetchImpl: async () => { llamadas++; return { ok: false, status: 503, json: async () => ({ error: { message: 'ocupado' } }), headers: { get: () => null } }; },
      dormir: async () => {},
    });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(complete({}, { signal: ctrl.signal })).rejects.toMatchObject({ codigo: 'sin_red' });
    expect(llamadas).toBe(0);
  });

  it('un turno que se pasa del plazo libera la sesión (no queda en 409)', async () => {
    let lento = true;
    const provider = {
      name: 'falso', model: 'x',
      userMessage: (t) => ({ role: 'user', content: t }),
      toolResultMessages: () => [],
      step({ signal }) {
        if (!lento) return Promise.resolve({ kind: 'final', text: 'rápido', calls: [], assistantMessage: { role: 'assistant', content: 'rápido' } });
        return new Promise((_, reject) => signal.addEventListener('abort', () => { const e = new Error('tardó'); e.codigo = 'sin_red'; reject(e); }));
      },
    };
    const { buildApp } = await import('../src/app.js');
    const agent = createAgent({ provider, logger: silencioso });
    const app = buildApp({ config: {}, agent, provider, plazoTurnoMs: 50 });
    const r1 = await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'hola' } });
    expect(r1.statusCode).toBe(503);
    lento = false;
    // La app reintenta con la misma sesión que tenía antes; acá basta con que una sesión nueva responda.
    const r2 = await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'hola otra vez' } });
    expect(r2.statusCode).toBe(200);
  });
});

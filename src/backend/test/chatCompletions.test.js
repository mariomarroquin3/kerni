import { describe, expect, it, vi } from 'vitest';
import {
  createChatCompletionsClient, createChatCompletionsProvider, GEMINI_URL, OPENROUTER_URL, segundosDeEspera,
} from '../src/llm/chatCompletions.js';
import { createTestApp, SNAPSHOT } from './helpers.js';

const respuesta = (status, cuerpo, headers = {}) => new Response(JSON.stringify(cuerpo), { status, headers });
const ok = (texto) => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: texto } }] });
const llamaTool = (name, args, id = 'call_x') => ({
  choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }] } }],
});

const cliente = (fetchImpl, extra = {}) => createChatCompletionsClient({
  nombre: 'Gemini', claveEnv: 'GEMINI_API_KEY', apiKey: 'llave-secreta-123', url: GEMINI_URL, fetchImpl, dormir: vi.fn(async () => {}), ...extra,
});

describe('cliente de Chat Completions', () => {
  it('manda POST con Bearer y el cuerpo JSON a la URL del proveedor', async () => {
    const fetchImpl = vi.fn(async () => respuesta(200, ok('hola')));
    await cliente(fetchImpl, { url: OPENROUTER_URL, headers: { 'X-Title': 'Kerni' } })({ model: 'm', messages: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(OPENROUTER_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer llave-secreta-123');
    expect(init.headers['X-Title']).toBe('Kerni');
    expect(JSON.parse(init.body)).toEqual({ model: 'm', messages: [] });
  });

  it('reintenta un 429 respetando retry-after', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respuesta(429, { error: { message: 'rate limit' } }, { 'retry-after': '3' }))
      .mockResolvedValueOnce(respuesta(200, ok('ya')));
    const dormir = vi.fn(async () => {});
    const json = await createChatCompletionsClient({ nombre: 'G', claveEnv: 'K', apiKey: 'x', url: GEMINI_URL, fetchImpl, dormir })({});
    expect(json.choices[0].message.content).toBe('ya');
    expect(dormir).toHaveBeenCalledWith(3000);
  });

  it('con 503 repetido se rinde después de los reintentos y dice qué pasó', async () => {
    const fetchImpl = vi.fn(async () => respuesta(503, { error: { message: 'overloaded' } }));
    await expect(cliente(fetchImpl)({})).rejects.toThrow(/Gemini respondió 503: overloaded/);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // 1 intento + 3 reintentos
  });

  it('un 401 no se reintenta y el mensaje apunta a la variable, sin filtrar la llave', async () => {
    const fetchImpl = vi.fn(async () => respuesta(401, { error: { message: 'API key not valid' } }));
    const err = await cliente(fetchImpl)({}).catch((e) => e);
    expect(err.codigo).toBe('llave_invalida');
    expect(err.message).toContain('GEMINI_API_KEY');
    expect(err.message).not.toContain('llave-secreta-123');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un 402 (sin créditos) no se reintenta', async () => {
    const fetchImpl = vi.fn(async () => respuesta(402, { error: { message: 'insufficient credits' } }));
    const err = await cliente(fetchImpl, { nombre: 'OpenRouter' })({}).catch((e) => e);
    expect(err.message).toMatch(/créditos/);
    expect(err.status).toBe(402);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('OpenRouter: un 200 con el error adentro también es un error (cupo diario → sin_cupo)', async () => {
    const fetchImpl = vi.fn(async () => respuesta(200, { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day' } }));
    const err = await cliente(fetchImpl)({}).catch((e) => e);
    expect(err.codigo).toBe('sin_cupo');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('Gemini: el error llega como lista y el cupo diario no se reintenta', async () => {
    const cuerpo = [{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel' } }];
    const fetchImpl = vi.fn(async () => respuesta(429, cuerpo));
    const err = await cliente(fetchImpl)({}).catch((e) => e);
    expect(err.codigo).toBe('sin_cupo');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Cuerpo real que devolvió Gemini con una llave del plan gratuito (20 pedidos por día por modelo).
  const cupoGratisReal = () => [{
    error: {
      code: 429, status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash\nPlease retry in 9h48m13.866867325s.',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '35293s' },
      ],
    },
  }];

  it('el 429 real del plan gratuito de Gemini es cupo diario: no se reintenta y dice cuándo vuelve y por qué', async () => {
    const fetchImpl = vi.fn(async () => respuesta(429, cupoGratisReal()));
    const err = await cliente(fetchImpl)({}).catch((e) => e);
    expect(err.codigo).toBe('sin_cupo');
    expect(err.message).toMatch(/de hoy/);
    expect(err.message).toMatch(/10 h/);
    expect(err.message).toMatch(/plan gratuito/);
    expect(err.message).not.toContain('llave-secreta-123');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sin la palabra "día" en el mensaje, una espera larga sugerida también corta (no se espera horas)', async () => {
    const cuerpo = [{ error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '600s' }] } }];
    const fetchImpl = vi.fn(async () => respuesta(429, cuerpo));
    const err = await cliente(fetchImpl)({}).catch((e) => e);
    expect(err.codigo).toBe('sin_cupo');
    expect(err.message).toMatch(/10 min/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un límite por minuto con RetryInfo corto espera lo que pide Google y reintenta', async () => {
    const cuerpo = [{ error: { code: 429, message: 'Rate limit', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }] } }];
    const fetchImpl = vi.fn().mockResolvedValueOnce(respuesta(429, cuerpo)).mockResolvedValueOnce(respuesta(200, ok('ya')));
    const dormir = vi.fn(async () => {});
    const json = await createChatCompletionsClient({ nombre: 'G', claveEnv: 'K', apiKey: 'x', url: GEMINI_URL, fetchImpl, dormir })({});
    expect(json.choices[0].message.content).toBe('ya');
    expect(dormir).toHaveBeenCalledWith(7000);
  });

  it('segundosDeEspera lee RetryInfo y también el "retry in" del mensaje', () => {
    expect(segundosDeEspera({ details: [{ '@type': 'x.RetryInfo', retryDelay: '35293s' }] })).toBe(35293);
    expect(segundosDeEspera({ message: 'Please retry in 9h48m13.5s.' })).toBeCloseTo(9 * 3600 + 48 * 60 + 13.5);
    expect(segundosDeEspera({ message: 'Please retry in 34s' })).toBe(34);
    expect(segundosDeEspera({ message: 'sin pista' })).toBe(0);
    expect(segundosDeEspera(undefined)).toBe(0);
  });

  it('un 429 por minuto de Gemini (en lista) sí se reintenta', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respuesta(429, [{ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).' } }]))
      .mockResolvedValueOnce(respuesta(200, ok('listo')));
    const json = await cliente(fetchImpl)({});
    expect(json.choices[0].message.content).toBe('listo');
  });

  it('con reintentosRed=2 un pico de latencia se rescata: el segundo intento responde', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(respuesta(200, ok('ya está')));
    const json = await cliente(fetchImpl, { reintentosRed: 2 })({});
    expect(json.choices[0].message.content).toBe('ya está');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('con reintentosRed=2 se rinde al tercer tiempo agotado', async () => {
    const fetchImpl = vi.fn(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); });
    const err = await cliente(fetchImpl, { reintentosRed: 2 })({}).catch((e) => e);
    expect(err.codigo).toBe('sin_red');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('sin red o con tiempo agotado: un reintento y luego un error claro', async () => {
    const fetchImpl = vi.fn(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); });
    const err = await cliente(fetchImpl)({}).catch((e) => e);
    expect(err.codigo).toBe('sin_red');
    expect(err.message).toMatch(/tardó demasiado/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('proveedor de Chat Completions', () => {
  const proveedor = (respuestas, extra = {}) => {
    const cola = [...respuestas];
    const pedidos = [];
    const complete = vi.fn(async (body) => { pedidos.push(structuredClone(body)); return cola.shift(); });
    return { provider: createChatCompletionsProvider({ complete, model: 'm/x', name: 'gemini', ...extra }), pedidos };
  };
  const def = [{ name: 'proponer_accion', description: 'd', parameters: { type: 'object', properties: { motivo: { type: 'string' } } } }];

  it('traduce las tools a formato function; el system prompt va primero y no se guarda en el historial', async () => {
    const { provider, pedidos } = proveedor([ok('hola')], { maxTokens: 777, extraBody: { reasoning_effort: 'low' } });
    const history = [provider.userMessage('hola')];
    await provider.step({ persona: 'PERSONA', contexto: 'CTX', tools: def, history });
    const p = pedidos[0];
    expect(p.model).toBe('m/x');
    expect(p.max_tokens).toBe(777);
    expect(p.reasoning_effort).toBe('low');
    expect(p.messages[0]).toEqual({ role: 'system', content: 'PERSONA\n\nCTX' });
    expect(p.tools[0]).toEqual({ type: 'function', function: { name: 'proponer_accion', description: 'd', parameters: def[0].parameters } });
    expect(history).toHaveLength(1);
  });

  it('en el último paso prohíbe las tools (tool_choice none)', async () => {
    const { provider, pedidos } = proveedor([ok('chau')]);
    await provider.step({ persona: 'P', contexto: 'C', tools: def, history: [], sinTools: true });
    expect(pedidos[0].tool_choice).toBe('none');
  });

  it('si el proveedor devuelve tool_calls sin id (pasa con Gemini), les pone uno y el resultado lo usa', async () => {
    const sinId = { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: '', type: 'function', function: { name: 'proponer_accion', arguments: '{"motivo":"x"}' } }] } }] };
    const { provider } = proveedor([sinId]);
    const paso = await provider.step({ persona: 'P', contexto: 'C', tools: def, history: [] });
    expect(paso.kind).toBe('tool_calls');
    const id = paso.calls[0].id;
    expect(id).toMatch(/^call_\d+$/);
    expect(paso.assistantMessage.tool_calls[0].id).toBe(id);
    expect(provider.toolResultMessages([{ id, name: 'proponer_accion', content: '{}' }])).toEqual([
      { role: 'tool', tool_call_id: id, name: 'proponer_accion', content: '{}' },
    ]);
  });

  it('argumentos que no son JSON válido vuelven marcados para que el agente se lo diga al modelo', async () => {
    const { provider } = proveedor([llamaTool('proponer_accion', '{roto')]);
    const paso = await provider.step({ persona: 'P', contexto: 'C', tools: def, history: [] });
    expect(paso.calls[0].input).toEqual({ __argumentos_invalidos: '{roto' });
  });

  it('un bloqueo de contenido es un rechazo, no un error', async () => {
    const { provider } = proveedor([{ choices: [{ finish_reason: 'content_filter', message: { content: null } }] }]);
    expect((await provider.step({ persona: 'P', contexto: 'C', tools: [], history: [] })).kind).toBe('refusal');
  });

  it('sin choices lanza un error', async () => {
    const { provider } = proveedor([{ choices: [] }]);
    await expect(provider.step({ persona: 'P', contexto: 'C', tools: [], history: [] })).rejects.toThrow(/no devolvió respuesta/);
  });
});

describe('agente completo con un proveedor compatible con OpenAI', () => {
  const montar = (respuestas) => {
    const cola = [...respuestas];
    const pedidos = [];
    const complete = async (body) => { pedidos.push(structuredClone(body)); return cola.shift(); };
    const provider = createChatCompletionsProvider({ complete, model: 'm', name: 'gemini' });
    return { ...createTestApp({ provider }), pedidos };
  };
  const chat = (app, body) => app.inject({ method: 'POST', url: '/chat', payload: body });

  it('propone cerrar un proceso real y la persona decide: la acción llega a la app sin ejecutarse', async () => {
    const { app, pedidos } = montar([
      llamaTool('proponer_accion', { accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: 'Usa 30% de CPU' }),
      ok('Te propongo cerrar miner.exe.'),
    ]);
    const res = (await chat(app, { mensaje: 'está lenta', snapshot: SNAPSHOT })).json();
    expect(res.acciones).toEqual([{ tipo: 'proponer_accion', accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: 'Usa 30% de CPU' }]);
    // el historial del segundo pedido tiene el assistant con tool_calls y el mensaje tool con su id
    const msgs = pedidos[1].messages;
    expect(msgs.at(-2).tool_calls[0].function.name).toBe('proponer_accion');
    expect(msgs.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_x', name: 'proponer_accion' });
    expect(pedidos[0].messages[0].content).toContain('<sistema>');
  });

  it('el modelo no puede cerrar un proceso protegido aunque lo pida', async () => {
    const { app, pedidos } = montar([
      llamaTool('proponer_accion', { accion: 'terminar_proceso', pid: 900, nombre: 'svchost.exe', motivo: 'Consume CPU' }),
      ok('Ese es de Windows, no lo toco.'),
    ]);
    const res = (await chat(app, { mensaje: 'cerrá todo', snapshot: SNAPSHOT })).json();
    expect(res.acciones).toEqual([]);
    expect(pedidos[1].messages.at(-1).content).toMatch(/protegido/);
  });

  it('una llave inválida llega a la persona como un 503 con el mensaje claro', async () => {
    const complete = async () => { throw Object.assign(new Error('La llave de Gemini no es válida. Revisá GEMINI_API_KEY en src/backend/.env.'), { codigo: 'llave_invalida' }); };
    const { app } = createTestApp({ provider: createChatCompletionsProvider({ complete, model: 'm', name: 'gemini' }) });
    const res = await chat(app, { mensaje: 'hola' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/GEMINI_API_KEY/);
  });

  it('un error cualquiera no expone detalles internos', async () => {
    const complete = async () => { throw new Error('stack interno con detalles'); };
    const { app } = createTestApp({ provider: createChatCompletionsProvider({ complete, model: 'm', name: 'gemini' }) });
    const res = await chat(app, { mensaje: 'hola' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).not.toMatch(/stack interno/);
  });

  it('/health dice con qué cerebro está hablando', async () => {
    const { app } = montar([]);
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ ok: true, proveedor: 'gemini', modelo: 'm' });
  });
});

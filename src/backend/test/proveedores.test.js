import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { crearProveedor, elegirProveedor } from '../src/llm/proveedores.js';
import { GEMINI_MODEL, GEMINI_URL, OPENROUTER_MODEL, OPENROUTER_URL } from '../src/llm/chatCompletions.js';

const cfg = (env) => loadConfig(env);
const completa = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'hola' } }] };
const fetchOk = () => vi.fn(async () => new Response(JSON.stringify(completa), { status: 200 }));
const paso = (provider) => provider.step({ persona: 'P', contexto: 'C', tools: [], history: [provider.userMessage('hola')] });

describe('config', () => {
  it('lee las tres llaves y acepta GOOGLE_API_KEY como alternativa para Gemini', () => {
    const c = cfg({ ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'o', GOOGLE_API_KEY: 'g', GEMINI_MODEL: 'gemini-x' });
    expect(c.anthropicApiKey).toBe('a');
    expect(c.openrouter.apiKey).toBe('o');
    expect(c.gemini).toMatchObject({ apiKey: 'g', model: 'gemini-x' });
    expect(cfg({ GEMINI_API_KEY: 'g1', GOOGLE_API_KEY: 'g2' }).gemini.apiKey).toBe('g1');
  });

  it('sin variables no hay llaves ni proveedor elegido', () => {
    const c = cfg({});
    expect(c.llmProvider).toBe('');
    expect(elegirProveedor(c)).toBeNull();
    expect(crearProveedor(c)).toBeNull();
  });
});

describe('elegirProveedor', () => {
  it('toma el primero que tenga llave: anthropic, gemini, openrouter', () => {
    expect(elegirProveedor(cfg({ OPENROUTER_API_KEY: 'o' }))).toBe('openrouter');
    expect(elegirProveedor(cfg({ OPENROUTER_API_KEY: 'o', GEMINI_API_KEY: 'g' }))).toBe('gemini');
    expect(elegirProveedor(cfg({ OPENROUTER_API_KEY: 'o', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }))).toBe('anthropic');
  });

  it('LLM_PROVIDER manda sobre el orden', () => {
    const env = { ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o' };
    expect(elegirProveedor(cfg({ ...env, LLM_PROVIDER: 'openrouter' }))).toBe('openrouter');
    expect(elegirProveedor(cfg({ ...env, LLM_PROVIDER: ' Gemini ' }))).toBe('gemini');
  });

  it('pedir un proveedor sin su llave falla diciendo qué variable falta', () => {
    expect(() => elegirProveedor(cfg({ LLM_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a' }))).toThrow(/GEMINI_API_KEY/);
    expect(() => elegirProveedor(cfg({ LLM_PROVIDER: 'openrouter' }))).toThrow(/OPENROUTER_API_KEY/);
  });

  it('un proveedor que no existe falla con las opciones', () => {
    expect(() => elegirProveedor(cfg({ LLM_PROVIDER: 'gpt', ANTHROPIC_API_KEY: 'a' }))).toThrow(/anthropic, gemini, openrouter/);
  });
});

describe('crearProveedor', () => {
  it('Gemini: usa su endpoint, el modelo por defecto y la llave como Bearer', async () => {
    const fetchImpl = fetchOk();
    const { provider, nombre } = crearProveedor(cfg({ GEMINI_API_KEY: 'g-123' }), { fetchImpl });
    expect(nombre).toBe('gemini');
    expect(provider).toMatchObject({ name: 'gemini', model: GEMINI_MODEL });
    await paso(provider);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(GEMINI_URL);
    expect(init.headers.Authorization).toBe('Bearer g-123');
    const cuerpo = JSON.parse(init.body);
    expect(cuerpo.model).toBe(GEMINI_MODEL);
    expect(cuerpo.max_tokens).toBeGreaterThanOrEqual(2048); // los modelos con razonamiento gastan parte pensando
    expect(cuerpo.reasoning_effort).toBeUndefined();
  });

  it('Gemini: respeta el modelo, el tope y el esfuerzo de razonamiento configurados', async () => {
    const fetchImpl = fetchOk();
    const { provider } = crearProveedor(cfg({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-3.5-flash-lite', GEMINI_MAX_TOKENS: '900', GEMINI_REASONING_EFFORT: 'low' }), { fetchImpl });
    await paso(provider);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ model: 'gemini-3.5-flash-lite', max_tokens: 900, reasoning_effort: 'low' });
  });

  it('OpenRouter: usa su endpoint, el título de la app y el modelo por defecto', async () => {
    const fetchImpl = fetchOk();
    const { provider, nombre } = crearProveedor(cfg({ OPENROUTER_API_KEY: 'or-1' }), { fetchImpl });
    expect(nombre).toBe('openrouter');
    expect(provider.model).toBe(OPENROUTER_MODEL);
    await paso(provider);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(OPENROUTER_URL);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer or-1', 'X-Title': 'Kerni' });
  });

  it('OpenRouter: el modelo se puede cambiar', () => {
    const { provider } = crearProveedor(cfg({ OPENROUTER_API_KEY: 'o', OPENROUTER_MODEL: 'google/gemini-3.5-flash-lite' }), { fetchImpl: fetchOk() });
    expect(provider.model).toBe('google/gemini-3.5-flash-lite');
  });

  it('Anthropic: usa la fábrica de cliente con su llave', () => {
    const anthropicFactory = vi.fn(() => ({ messages: { create: vi.fn() } }));
    const { provider, nombre } = crearProveedor(cfg({ ANTHROPIC_API_KEY: 'a-1', KERNI_MODEL: 'claude-sonnet-5-5' }), { anthropicFactory });
    expect(nombre).toBe('anthropic');
    expect(anthropicFactory).toHaveBeenCalledWith('a-1');
    expect(provider).toMatchObject({ name: 'anthropic', model: 'claude-sonnet-5-5' });
  });

  it('las llaves de otros proveedores no se usan ni se mandan', async () => {
    const fetchImpl = fetchOk();
    const { provider } = crearProveedor(cfg({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a-secreta', OPENROUTER_API_KEY: 'o-secreta' }), { fetchImpl });
    await paso(provider);
    const enviado = JSON.stringify(fetchImpl.mock.calls[0]);
    expect(enviado).not.toContain('a-secreta');
    expect(enviado).not.toContain('o-secreta');
  });
});

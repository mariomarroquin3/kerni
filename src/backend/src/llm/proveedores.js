import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicProvider, ANTHROPIC_MODEL } from './anthropic.js';
import {
  createChatCompletionsClient, createChatCompletionsProvider,
  GEMINI_MODEL, GEMINI_URL, OPENROUTER_MODEL, OPENROUTER_URL,
} from './chatCompletions.js';

/** Orden de preferencia cuando no se indica LLM_PROVIDER: el primero que tenga llave. */
export const PROVEEDORES = ['anthropic', 'gemini', 'openrouter'];

const llaveDe = (config, nombre) => ({
  anthropic: config.anthropicApiKey,
  gemini: config.gemini?.apiKey,
  openrouter: config.openrouter?.apiKey,
})[nombre];

export const CLAVE_ENV = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY' };

/** Qué proveedor toca: el pedido con LLM_PROVIDER, o el primero con llave. null si no hay ninguno. */
export function elegirProveedor(config) {
  const pedido = (config.llmProvider ?? '').trim().toLowerCase();
  if (pedido) {
    if (!PROVEEDORES.includes(pedido)) throw new Error(`LLM_PROVIDER="${pedido}" no existe. Opciones: ${PROVEEDORES.join(', ')}.`);
    if (!llaveDe(config, pedido)) throw new Error(`LLM_PROVIDER=${pedido} necesita ${CLAVE_ENV[pedido]}.`);
    return pedido;
  }
  return PROVEEDORES.find((p) => llaveDe(config, p)) ?? null;
}

/**
 * Arma el proveedor del agente. Las dependencias de red se inyectan para poder probarlo
 * sin llamar a nadie.
 * @returns {{ provider: object, nombre: string } | null}
 */
export function crearProveedor(config, { anthropicFactory = (apiKey) => new Anthropic({ apiKey }), fetchImpl = fetch } = {}) {
  const nombre = elegirProveedor(config);
  if (!nombre) return null;
  const maxTokens = config.maxTokensRespuesta;

  if (nombre === 'anthropic') {
    const provider = createAnthropicProvider({
      anthropic: anthropicFactory(config.anthropicApiKey),
      model: config.agentModel || ANTHROPIC_MODEL,
      maxTokens,
    });
    return { provider, nombre };
  }

  if (nombre === 'gemini') {
    const complete = createChatCompletionsClient({
      nombre: 'Gemini', claveEnv: CLAVE_ENV.gemini, apiKey: config.gemini.apiKey, url: config.gemini.baseUrl || GEMINI_URL, fetchImpl,
      // (Probado: acortar el tiempo límite a 12 s y reintentar NO ayudó con los picos de latencia de
      // Gemini —duran varios pedidos seguidos— y gasta cuota. Queda el valor por defecto, ajustable.)
      ...(config.gemini.timeoutMs ? { timeoutMs: config.gemini.timeoutMs } : {}),
    });
    const provider = createChatCompletionsProvider({
      complete,
      name: 'gemini',
      model: config.gemini.model || GEMINI_MODEL,
      // Los modelos con razonamiento gastan parte del tope pensando: se les da más espacio.
      maxTokens: config.gemini.maxTokens || Math.max(maxTokens * 3, 2048),
      extraBody: config.gemini.reasoningEffort ? { reasoning_effort: config.gemini.reasoningEffort } : {},
    });
    return { provider, nombre };
  }

  const complete = createChatCompletionsClient({
    nombre: 'OpenRouter', claveEnv: CLAVE_ENV.openrouter, apiKey: config.openrouter.apiKey, url: config.openrouter.baseUrl || OPENROUTER_URL, fetchImpl,
    headers: { 'X-Title': 'Kerni' },
  });
  const provider = createChatCompletionsProvider({
    complete, name: 'openrouter', model: config.openrouter.model || OPENROUTER_MODEL, maxTokens,
  });
  return { provider, nombre };
}

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
 * Como `elegirProveedor`, pero si LLM_PROVIDER pide un proveedor SIN llave y otro sí la tiene, usa ese y avisa. Antes el backend
 * arrancaba sin modelo y respondía solo con reglas locales, sin que la persona supiera por qué (LLM_PROVIDER=anthropic con la
 * llave vacía y la de Gemini puesta). Sin ninguna llave, o con un nombre que no existe, sigue fallando con el mensaje claro.
 * @returns {{ nombre: string|null, aviso: string }}
 */
export function elegirConAviso(config) {
  const pedido = (config.llmProvider ?? '').trim().toLowerCase();
  if (pedido && PROVEEDORES.includes(pedido) && !llaveDe(config, pedido)) {
    const otro = PROVEEDORES.find((p) => llaveDe(config, p));
    if (otro) {
      return {
        nombre: otro,
        aviso: `LLM_PROVIDER=${pedido} no tiene llave (${CLAVE_ENV[pedido]} está vacía): uso ${otro}, que sí tiene. Corregí LLM_PROVIDER en .env o poné la llave.`,
      };
    }
  }
  return { nombre: elegirProveedor(config), aviso: '' };
}

/**
 * Arma el proveedor del agente. Las dependencias de red se inyectan para poder probarlo
 * sin llamar a nadie.
 * @returns {{ provider: object, nombre: string, aviso: string } | null} `aviso` dice por qué se usó otro proveedor que el pedido ('' si no hubo nada raro)
 */
export function crearProveedor(config, { anthropicFactory = (apiKey) => new Anthropic({ apiKey, timeout: 40_000, maxRetries: 1 }), fetchImpl = fetch } = {}) {
  const { nombre, aviso } = elegirConAviso(config);
  if (!nombre) return null;
  const maxTokens = config.maxTokensRespuesta;
  const conAviso = (provider) => {
    if (aviso) provider.aviso = aviso;
    return { provider, nombre, aviso };
  };

  if (nombre === 'anthropic') {
    const provider = createAnthropicProvider({
      anthropic: anthropicFactory(config.anthropicApiKey),
      model: config.agentModel || ANTHROPIC_MODEL,
      maxTokens,
    });
    return conAviso(provider);
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
    return conAviso(provider);
  }

  const complete = createChatCompletionsClient({
    nombre: 'OpenRouter', claveEnv: CLAVE_ENV.openrouter, apiKey: config.openrouter.apiKey, url: config.openrouter.baseUrl || OPENROUTER_URL, fetchImpl,
    headers: { 'X-Title': 'Kerni' },
  });
  const provider = createChatCompletionsProvider({
    complete, name: 'openrouter', model: config.openrouter.model || OPENROUTER_MODEL, maxTokens,
  });
  return conAviso(provider);
}

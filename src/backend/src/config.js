/**
 * Lee la configuración desde variables de entorno.
 * Las llaves solo viven en el servidor; la app de escritorio nunca las ve.
 */
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8788),
    host: env.HOST || '127.0.0.1',
    turnosPorMinuto: Number(env.TURNOS_POR_MINUTO ?? 20),
    turnosPorDia: Number(env.TURNOS_POR_DIA ?? 300),
    maxTokensRespuesta: Number(env.MAX_TOKENS_RESPUESTA ?? 600),
    corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()) : undefined,

    // Qué cerebro usar: anthropic | gemini | openrouter. Vacío = el primero que tenga llave.
    llmProvider: env.LLM_PROVIDER ?? '',
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    agentModel: env.KERNI_MODEL || '',
    gemini: {
      apiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '',
      model: env.GEMINI_MODEL || '',
      maxTokens: Number(env.GEMINI_MAX_TOKENS) || 0,
      reasoningEffort: env.GEMINI_REASONING_EFFORT || '',
      baseUrl: env.GEMINI_BASE_URL || '',
      timeoutMs: Number(env.GEMINI_TIMEOUT_MS) || 0,
    },
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY ?? '',
      model: env.OPENROUTER_MODEL || '',
      baseUrl: env.OPENROUTER_BASE_URL || '',
    },

    // Embeddings para el RAG: gemini | openrouter. Vacío = el de la primera llave que haya.
    // La dimensión debe coincidir con la columna vector(768) de la migración.
    embeddings: {
      provider: env.EMBEDDINGS_PROVIDER || '',
      model: env.EMBEDDINGS_MODEL || '',
      dimensions: Number(env.EMBEDDINGS_DIMENSIONS) || 0,
      baseUrl: env.EMBEDDINGS_BASE_URL || '',
    },

    // Memoria en Supabase (opcional). Sin estas dos variables Kerni funciona igual, pero no recuerda nada.
    supabase: {
      url: env.SUPABASE_URL || '',
      key: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
  };
}

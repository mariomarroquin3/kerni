import Fastify from 'fastify';
import { chatRoutes } from './routes/chat.js';
import { memoriaRoutes } from './routes/memoria.js';
import { createMemoriaNula } from './memoria/memoria.js';
import { createConocimientoNulo } from './rag/conocimiento.js';
import { createLimitador, combinarLimitadores } from './guardrails/limitador.js';

export const DEFAULT_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1421', // Vite en desarrollo
];

/**
 * Construye la app con dependencias inyectadas, para poder probarla
 * con un proveedor de LLM falso.
 */
export function buildApp({ config, agent, provider, memoria = createMemoriaNula(), conocimiento = createConocimientoNulo(), now, logger = false }) {
  const app = Fastify({ logger });

  // CORS para la app de escritorio: el WebView de Tauri tiene su propio origen.
  const origenes = new Set(config.corsOrigins ?? DEFAULT_ORIGINS);
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !origenes.has(origin)) return;
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'origin');
    if (req.method === 'OPTIONS') {
      reply.header('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
      reply.header('access-control-allow-headers', 'content-type');
      reply.header('access-control-max-age', '600');
      return reply.code(204).send();
    }
  });

  const limitador = combinarLimitadores(
    createLimitador({ max: config.turnosPorMinuto ?? 20, ...(now ? { now } : {}) }),
    createLimitador({ max: config.turnosPorDia ?? 300, ventanaMs: 24 * 60 * 60_000, ...(now ? { now } : {}) }),
  );

  app.get('/health', async () => ({
    ok: true,
    memoria: memoria.habilitada,
    conocimiento: conocimiento.habilitado,
    ...(provider ? { proveedor: provider.name, modelo: provider.model } : {}),
  }));
  app.register(chatRoutes, { agent, limitador, memoria, conocimiento, provider, ...(now ? { now } : {}) });
  app.register(memoriaRoutes, { memoria, limitador });
  return app;
}

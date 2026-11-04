import Fastify from 'fastify';
import { chatRoutes } from './routes/chat.js';
import { memoriaRoutes } from './routes/memoria.js';
import { createMemoriaNula } from './memoria/memoria.js';
import { createConocimientoNulo } from './rag/conocimiento.js';
import { enlacesRoutes } from './routes/enlaces.js';
import { progresoRoutes } from './routes/progreso.js';
import { guiasRoutes } from './routes/guias.js';
import { crearMotorGuias } from './guias/motor.js';
import { createRevisorEnlaces } from './enlaces.js';
import { createLimitador, combinarLimitadores } from './guardrails/limitador.js';

export const DEFAULT_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1421', // Vite en desarrollo
];

/**
 * ¿El header Host es de loopback? Con puerto conocido (el de producción) debe ser
 * exactamente 127.0.0.1:<puerto> o localhost:<puerto>. Sin puerto conocido (pruebas
 * con inject) basta con el nombre de host.
 */
export function hostPermitido(host, puerto) {
  const m = /^(127\.0\.0\.1|localhost)(?::(\d+))?$/i.exec(String(host ?? ''));
  if (!m) return false;
  if (!puerto) return true;
  return m[2] === String(puerto);
}

/**
 * Construye la app con dependencias inyectadas, para poder probarla
 * con un proveedor de LLM falso.
 */
export function buildApp({ config, agent, provider, memoria = createMemoriaNula(), conocimiento = createConocimientoNulo(), revisorEnlaces = createRevisorEnlaces(), motorGuias = crearMotorGuias({ memoria }), limitadorGuias, now, logger = false, plazoTurnoMs, reflexion }) {
  const app = Fastify({ logger });

  // Host: el servidor solo escucha en loopback. Rechazar cualquier otro Host evita
  // el "DNS rebinding" (una página web que apunta su dominio a 127.0.0.1 para leer la API).
  app.addHook('onRequest', async (req, reply) => {
    if (hostPermitido(req.headers.host, config.port)) return;
    return reply.code(403).send({ error: 'host no permitido' });
  });

  // CORS para la app de escritorio: el WebView de Tauri tiene su propio origen.
  const origenes = new Set(config.corsOrigins ?? DEFAULT_ORIGINS);
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !origenes.has(origin)) return;
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'origin');
    if (req.method === 'OPTIONS') {
      reply.header('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
  app.register(chatRoutes, { agent, limitador, memoria, provider, conocimiento, motorGuias, ...(now ? { now } : {}), ...(plazoTurnoMs ? { plazoTurnoMs } : {}), ...(reflexion !== undefined ? { reflexion } : {}) });
  app.register(memoriaRoutes, { memoria, limitador });
  app.register(enlacesRoutes, { revisorEnlaces });
  app.register(progresoRoutes, { memoria });
  app.register(guiasRoutes, { memoria, motor: motorGuias, ...(limitadorGuias ? { limitador: limitadorGuias } : {}) });
  return app;
}

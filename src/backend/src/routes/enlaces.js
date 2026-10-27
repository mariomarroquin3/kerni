import { createLimitador } from '../guardrails/limitador.js';
import { MAX_ENLACE } from '../enlaces.js';

/**
 * Revisión de un enlace sin pasar por el modelo (así no gasta cupo y responde al instante).
 *   POST /enlaces/revisar  { url } → { nivel, motivos, dominio, listas, nota }
 * Mira la dirección y, si hay llave, la lista de Google. Nunca abre el sitio.
 */
export async function enlacesRoutes(app, { revisorEnlaces }) {
  const limitador = createLimitador({ max: 30, ventanaMs: 60_000 });

  app.post('/enlaces/revisar', async (req, reply) => {
    const url = req.body?.url;
    if (typeof url !== 'string' || !url.trim()) return reply.code(400).send({ error: 'falta el enlace' });
    if (url.length > MAX_ENLACE) return reply.code(400).send({ error: `el enlace es muy largo (máximo ${MAX_ENLACE} caracteres)` });
    if (!limitador.permitir('enlaces')) return reply.code(429).send({ error: 'Muchas revisiones seguidas; esperá un momento.' });
    return revisorEnlaces.revisar(url);
  });
}

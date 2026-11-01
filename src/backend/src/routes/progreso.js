import { esUuid } from '../memoria/memoria.js';
import { EVENTOS_PROGRESO } from '../progreso.js';
import { createLimitador } from '../guardrails/limitador.js';

/**
 * Progreso de aprendizaje (XP, nivel y tope diario), guardado en la base local.
 *   GET  /progreso?device_id=…                      → { habilitado, xp, xpHoy, leccionHoy, topeDiario }
 *   POST /progreso/evento { device_id, evento }     → { aplicado, puntos, motivo?, xp, xpHoy, leccionHoy, topeDiario }
 * `evento` es una lista cerrada (ver progreso.js). Si la memoria está apagada responde 503 y el front muestra la función apagada.
 */
export async function progresoRoutes(app, { memoria, limitador }) {
  const limProgreso = limitador || createLimitador({ max: 120, ventanaMs: 60_000 });
  const sinMemoria = { error: 'El progreso no está disponible: la memoria local está apagada.' };

  app.get('/progreso', async (req, reply) => {
    const id = req.query?.device_id;
    if (!esUuid(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    if (!memoria.habilitada || typeof memoria.progreso !== 'function') return reply.code(503).send(sinMemoria);
    const p = await memoria.progreso(id);
    return p ? { habilitado: true, ...p } : reply.code(503).send(sinMemoria);
  });

  app.post('/progreso/evento', async (req, reply) => {
    if (!limProgreso.permitir('progreso')) return reply.code(429).send({ error: 'Muchos pedidos; esperá un momento.' });
    const { device_id: id, evento } = req.body ?? {};
    if (!esUuid(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    if (!EVENTOS_PROGRESO.includes(evento)) {
      return reply.code(400).send({ error: `evento desconocido; los válidos son: ${EVENTOS_PROGRESO.join(', ')}` });
    }
    if (!memoria.habilitada || typeof memoria.sumarEvento !== 'function') return reply.code(503).send(sinMemoria);
    const r = await memoria.sumarEvento(id, evento);
    return r ? { ok: true, ...r } : reply.code(503).send(sinMemoria);
  });
}

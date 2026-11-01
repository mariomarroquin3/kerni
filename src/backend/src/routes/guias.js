import { esUuid } from '../memoria/memoria.js';
import { createLimitador } from '../guardrails/limitador.js';
import { GUIA_IDS } from '../guias/guias.js';
import { RESPUESTAS_GUIA } from '../guias/motor.js';

/**
 * Guías paso a paso. El avance vive en la base local (una fila por PC).
 *   POST /guias/iniciar  { device_id, guia_id }     → { guia, texto, tipo, intro, respuesta, propuesta? }
 *   POST /guias/responder { device_id, respuesta }  → { guia, texto, tipo, respuesta, propuesta?, terminada?, cerrada? }
 * `guia_id` y `respuesta` son listas cerradas. Sin memoria responde 503 y la guía no arranca (ver chat.js).
 * Las propuestas son las mismas tarjetas de siempre: la persona aprueba en pantalla.
 */
export async function guiasRoutes(app, { memoria, motor, limitador }) {
  const limGuias = limitador || createLimitador({ max: 60, ventanaMs: 60_000 });
  const sinMemoria = { error: 'Las guías guardan dónde vas en la memoria local, y está apagada.', codigo: 'sin_memoria' };

  app.post('/guias/iniciar', async (req, reply) => {
    if (!limGuias.permitir('guias')) return reply.code(429).send({ error: 'Muchos pedidos; esperá un momento.' });
    const { device_id: id, guia_id: guiaId } = req.body ?? {};
    if (!esUuid(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    if (!GUIA_IDS.includes(guiaId)) return reply.code(400).send({ error: `guía desconocida; las válidas son: ${GUIA_IDS.join(', ')}` });
    if (!memoria.habilitada) return reply.code(503).send(sinMemoria);
    const r = await motor.iniciar(id, guiaId);
    if (!r.ok) return reply.code(503).send({ error: 'No pude guardar la guía ahora mismo.', codigo: r.codigo });
    return sinInternos(r);
  });

  app.post('/guias/responder', async (req, reply) => {
    if (!limGuias.permitir('guias')) return reply.code(429).send({ error: 'Muchos pedidos; esperá un momento.' });
    const { device_id: id, respuesta } = req.body ?? {};
    if (!esUuid(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    if (!RESPUESTAS_GUIA.includes(respuesta)) return reply.code(400).send({ error: `respuesta desconocida; las válidas son: ${RESPUESTAS_GUIA.join(', ')}` });
    if (!memoria.habilitada) return reply.code(503).send(sinMemoria);
    const r = await motor.siguiente(id, respuesta);
    if (!r.ok) {
      if (r.codigo === 'sin_guia') return reply.code(409).send({ error: 'No hay una guía en curso. Empezala de nuevo desde el chat.', codigo: r.codigo });
      return reply.code(503).send({ error: 'No pude guardar el avance ahora mismo.', codigo: r.codigo });
    }
    return sinInternos(r);
  });
}

/** Lo que vuelve a la app: el texto del paso, su número, el total y la propuesta. Nada más del motor. */
function sinInternos(r) {
  const { ok, guia, texto, tipo, intro, respuesta, propuesta, terminada, cerrada } = r;
  return {
    ok,
    guia: guia ?? null,
    texto: texto ?? null,
    tipo: tipo ?? null,
    respuesta,
    ...(intro ? { intro } : {}),
    ...(propuesta ? { propuesta } : {}),
    ...(terminada ? { terminada: true } : {}),
    ...(cerrada ? { cerrada: true } : {}),
  };
}

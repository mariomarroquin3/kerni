import { SnapshotSchema } from '../telemetria.js';
import { esUuid } from '../memoria/memoria.js';
import { validarRecuerdo } from '../memoria/recuerdos.js';
import { createLimitador } from '../guardrails/limitador.js';

/**
 * Memoria que la persona controla. Todo va por `device_id` (UUID que genera la app).
 *   GET    /memoria?device_id=…                 → { habilitada, hechos }
 *   POST   /memoria/hechos { device_id, clave, valor }   guarda un recuerdo ya aprobado en pantalla
 *   POST   /recuerdos { device_id, clave, valor }        alias para guardar recuerdo aprobado
 *   DELETE /memoria/hechos/:clave?device_id=…   borra uno
 *   DELETE /memoria?device_id=…                 olvida todo (recuerdos, conversación y salud)
 *   POST   /memoria/salud { device_id, snapshot }  guarda una lectura resumida (máx. una cada 5 min)
 */
export async function memoriaRoutes(app, { memoria, limitador }) {
  const idValido = (id) => esUuid(id);
  const limMemoria = limitador || createLimitador({ max: 60, ventanaMs: 60_000 });

  app.get('/memoria', async (req, reply) => {
    const id = req.query?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    return { habilitada: memoria.habilitada, hechos: await memoria.hechos(id) };
  });

  app.post('/memoria/hechos', async (req, reply) => {
    if (!memoria.habilitada) return reply.code(503).send({ error: 'La memoria no está conectada (falta configurar Supabase).' });
    const { device_id: id, clave, valor } = req.body ?? {};
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const v = validarRecuerdo({ clave, valor });
    if (!v.ok) return reply.code(400).send({ error: v.error });
    const r = await memoria.guardarHecho(id, v.clave, v.valor, 'kerni');
    return r.ok ? reply.code(201).send({ ok: true, clave: v.clave, valor: v.valor }) : reply.code(503).send({ error: r.error });
  });

  app.post('/recuerdos', async (req, reply) => {
    if (!limMemoria.permitir('recuerdos')) return reply.code(429).send({ error: 'Muchos pedidos; esperá un momento.' });
    if (!memoria.habilitada) return reply.code(503).send({ error: 'La memoria no está conectada (falta configurar Supabase).' });
    const { device_id: id, clave, valor } = req.body ?? {};
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const v = validarRecuerdo({ clave, valor });
    if (!v.ok) return reply.code(400).send({ error: v.error });
    const r = await memoria.aprobarRecuerdo(id, v.clave, v.valor);
    return r.ok ? reply.code(201).send({ ok: true, clave: v.clave, valor: v.valor }) : reply.code(503).send({ error: r.error });
  });

  app.delete('/memoria/hechos/:clave', async (req, reply) => {
    const id = req.query?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    if (!/^[a-z0-9_]{2,40}$/.test(req.params.clave)) return reply.code(400).send({ error: 'clave inválida' });
    return (await memoria.borrarHecho(id, req.params.clave)) ? { ok: true } : reply.code(503).send({ error: 'No pude borrarlo ahora mismo.' });
  });

  app.delete('/memoria', async (req, reply) => {
    if (!limMemoria.permitir('olvidar')) return reply.code(429).send({ error: 'Muchos pedidos; esperá un momento.' });
    const id = req.query?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    return (await memoria.olvidarTodo(id)) ? { ok: true } : reply.code(503).send({ error: 'No pude borrar la memoria ahora mismo.' });
  });

  app.post('/memoria/salud', async (req, reply) => {
    const id = req.body?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const parsed = SnapshotSchema.safeParse(req.body?.snapshot);
    if (!parsed.success) return reply.code(400).send({ error: 'la lectura del sistema no es válida' });
    return { guardada: await memoria.registrarSalud(id, parsed.data) };
  });

  app.get('/memoria/reflexiones', async (req, reply) => {
    const id = req.query?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const limite = Math.min(100, Math.max(1, Number(req.query?.limite) || 50));
    const categoria = req.query?.categoria ? String(req.query.categoria).trim() : null;
    const reflexiones = typeof memoria.obtenerReflexiones === 'function'
      ? await memoria.obtenerReflexiones(id, { limite, categoria })
      : [];
    return { reflexiones };
  });

  app.delete('/memoria/reflexiones/:id', async (req, reply) => {
    const id = req.query?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const rid = Number(req.params?.id);
    if (!Number.isInteger(rid) || rid <= 0) return reply.code(400).send({ error: 'id de reflexión inválido' });
    const borrado = typeof memoria.borrarReflexion === 'function'
      ? await memoria.borrarReflexion(id, rid)
      : false;
    return borrado ? { ok: true } : reply.code(404).send({ error: 'no encontré esa reflexión' });
  });

  app.delete('/memoria/reflexiones', async (req, reply) => {
    const id = req.query?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const vaciado = typeof memoria.vaciarReflexiones === 'function'
      ? await memoria.vaciarReflexiones(id)
      : typeof memoria.borrarReflexion === 'function';
    return { ok: true };
  });

  app.get('/memoria/reflexiones/ajustes', async (req, reply) => {
    const id = req.query?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const ajustes = typeof memoria.obtenerAjustes === 'function'
      ? await memoria.obtenerAjustes(id)
      : { aprendizaje_auto: true };
    return ajustes;
  });

  app.put('/memoria/reflexiones/ajustes', async (req, reply) => {
    const id = req.body?.device_id;
    if (!idValido(id)) return reply.code(400).send({ error: 'falta un device_id válido' });
    const aprendizaje_auto = Boolean(req.body?.aprendizaje_auto);
    const r = typeof memoria.guardarAjustes === 'function'
      ? await memoria.guardarAjustes(id, { aprendizaje_auto })
      : { ok: true, aprendizaje_auto };
    return r.ok ? { ok: true, aprendizaje_auto } : reply.code(500).send({ error: r.error });
  });
}

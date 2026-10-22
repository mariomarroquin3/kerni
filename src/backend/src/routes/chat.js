import { randomUUID } from 'node:crypto';
import { SnapshotSchema } from '../telemetria.js';
import { esUuid } from '../memoria/memoria.js';
import { crearMotorReflexion } from '../memoria/reflexion.js';

/**
 * Chat por texto con la foto del sistema.
 *   POST /chat  { mensaje, snapshot?, session_id?, device_id? } → { session_id, respuesta, acciones, traza }
 * Con `device_id` y memoria conectada, Kerni retoma la charla anterior y recuerda lo guardado.
 */
export const MAX_MENSAJE = 1000;
export const SESION_INACTIVA_MS = 2 * 60 * 60 * 1000;

export async function chatRoutes(app, { agent, limitador, memoria, provider, now = () => Date.now() }) {
  /** La memoria es un extra: si falla (disco, base bloqueada), el chat sigue sin ella. */
  const seguro = async (etiqueta, fn, vacio) => {
    try { return await fn(); } catch (err) { app.log.error({ err: err.message }, `memoria: falló ${etiqueta}`); return vacio; }
  };

  // Historial por sesión en memoria del proceso; las inactivas se descartan.
  const sesiones = new Map();

  const motorReflexion = crearMotorReflexion({
    memoria,
    provider,
    logger: app.log,
    now,
  });

  function limpiarInactivas() {
    for (const [id, s] of sesiones) {
      if (!s.ocupada && now() - s.ultimoUso > SESION_INACTIVA_MS) sesiones.delete(id);
    }
  }

  app.post('/chat', async (req, reply) => {
    const mensaje = String(req.body?.mensaje ?? '').trim();
    if (!mensaje) return reply.code(400).send({ error: 'falta el mensaje' });
    if (mensaje.length > MAX_MENSAJE) return reply.code(400).send({ error: `el mensaje es muy largo (máximo ${MAX_MENSAJE} caracteres)` });

    let snapshot;
    if (req.body?.snapshot !== undefined) {
      const parsed = SnapshotSchema.safeParse(req.body.snapshot);
      if (!parsed.success) return reply.code(400).send({ error: 'la lectura del sistema no es válida' });
      snapshot = parsed.data;
    }

    // Una sola persona usa la app: la clave del límite es la sesión local.
    if (limitador && !limitador.permitir('local')) return reply.code(429).send({ error: 'Muchos mensajes seguidos; esperá un momento.' });

    const deviceId = esUuid(req.body?.device_id) && memoria?.habilitada ? req.body.device_id : null;

    limpiarInactivas();
    let sessionId = req.body?.session_id;
    if (!sessionId || !sesiones.has(sessionId)) {
      sessionId = randomUUID();
      const history = [];
      // Sesión nueva (la app se reinició o el backend se reinició): retoma los últimos turnos como texto plano,
      // que sirve para cualquier proveedor (el historial con herramientas no es intercambiable entre ellos).
      if (deviceId) {
        const userMessage = provider?.userMessage ?? ((t) => ({ role: 'user', content: t }));
        for (const m of await seguro('retomar la charla', () => memoria.ultimosMensajes(deviceId), [])) {
          history.push(m.rol === 'user' ? userMessage(m.contenido) : { role: 'assistant', content: m.contenido });
        }
      }
      sesiones.set(sessionId, { history, ocupada: false, ultimoUso: now() });
    }
    const sesion = sesiones.get(sessionId);
    if (sesion.ocupada) return reply.code(409).send({ error: 'Kerni todavía está respondiendo el mensaje anterior' });

    sesion.ocupada = true;
    try {
      // La base de conocimiento ya no se busca aquí: el modelo la consulta con la herramienta buscar_conocimiento solo cuando hace falta.
      const recuerdos = deviceId ? await seguro('leer el contexto', () => memoria.contexto(deviceId), '') : '';
      const { respuesta, acciones, traza } = await agent.runTurn({ sessionId, history: sesion.history, mensaje, snapshot, memoria: recuerdos, puedeRecordar: Boolean(deviceId) });
      // Sin esperar: guardar el turno y encolar reflexión en segundo plano no demoran la respuesta.
      if (deviceId) {
        seguro('guardar el turno', () => memoria.guardarTurno(deviceId, sessionId, mensaje, respuesta), undefined);
        seguro('encolar la reflexión', () => motorReflexion.encolarReflexion({ deviceId, mensaje }), undefined);
      }
      return { session_id: sessionId, respuesta, acciones, traza };
    } catch (err) {
      req.log.error({ err: err.message, codigo: err.codigo }, 'falló el turno');
      // Los errores de la API traen un mensaje pensado para la persona (llave inválida, cupo agotado, sin red).
      const claro = ['llave_invalida', 'sin_cupo', 'sin_red'].includes(err.codigo) || err.status === 402;
      return reply.code(claro ? 503 : 502).send({ error: claro ? err.message : 'Kerni no pudo pensar ahora mismo. Probá de nuevo en un momento.' });
    } finally {
      sesion.ocupada = false;
      sesion.ultimoUso = now();
    }
  });
}

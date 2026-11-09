import { randomUUID } from 'node:crypto';
import { SnapshotSchema } from '../telemetria.js';
import { esUuid } from '../memoria/memoria.js';
import { crearMotorReflexion } from '../memoria/reflexion.js';
import { detectarAccion, detectarGuia } from '../intenciones.js';
import { textoEquipo } from '../agent/agent.js';
import { textoDeRespaldo } from '../rag/respaldo.js';
import { crearMotorGuias, comandoDeGuia, lineaDePaso } from '../guias/motor.js';

/** La respuesta del modelo termina con el paso actual de la guía, diga lo que diga el modelo. */
export function cerrarConPaso(respuesta, guia) {
  const linea = lineaDePaso(guia);
  return respuesta.endsWith(linea) ? respuesta : `${respuesta}\n\n${linea}`;
}

/** Sin memoria no hay dónde guardar el paso: la guía se rechaza con un mensaje claro (decisión en AGENTS.md). */
export const MENSAJE_SIN_MEMORIA_GUIA ='Las guías guardan dónde vas en la memoria local, y ahora no está disponible. Podemos ir por partes en la conversación: decime qué necesitás.';

/**
 * Chat por texto con la foto del sistema.
 *   POST /chat  { mensaje, snapshot?, equipo?, session_id?, device_id? } → { session_id, respuesta, acciones, traza }
 *   Errores 503/502: { error, codigo, fallbackLocal? }. `codigo` es estable para el front:
 *   sin_llave | llave_invalida | sin_cupo | sin_red | fallo.
 * Con `device_id` y memoria conectada, Kerni retoma la charla anterior y recuerda lo guardado.
 */
export const MAX_MENSAJE = 1000;
export const SESION_INACTIVA_MS = 2 * 60 * 60 * 1000;
/** Plazo de un turno con el modelo. La app corta a los 60 s (desktop/web/main.js): el backend tiene que terminar antes. */
export const PLAZO_TURNO_MS = 50_000;

/** Respuesta completa (sin deltas) para un cliente que pidió streaming: un único evento "done" y se cierra. */
function iniciarSse(reply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    ...reply.getHeaders(),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
}

function enviarSoloDone(reply, cuerpo) {
  iniciarSse(reply);
  reply.raw.write(`event: done\ndata: ${JSON.stringify(cuerpo)}\n\n`);
  return reply.raw.end();
}

export async function chatRoutes(app, { agent, limitador, memoria, provider, conocimiento, motorGuias = crearMotorGuias({ memoria }), now = () => Date.now(), plazoTurnoMs = PLAZO_TURNO_MS, reflexion = process.env.KERNI_REFLEXION !== '0' }) {
  /** La memoria es un extra: si falla (disco, base bloqueada), el chat sigue sin ella. */
  const seguro = async (etiqueta, fn, vacio) => {
    try { return await fn(); } catch (err) { app.log.error({ err: err.message }, `memoria: falló ${etiqueta}`); return vacio; }
  };

  /** Respuesta de una guía con la forma de /chat: el paso como texto, su tarjeta si es de acción, y `guia` (null al cerrar). */
  function respuestaDeGuia(r, sessionId) {
    if (!r.ok) return { code: 503, body: { error: 'No pude guardar tu avance ahora mismo. Probá de nuevo en un momento.', codigo: 'fallo' } };
    return {
      body: {
        session_id: sessionId,
        respuesta: r.respuesta,
        acciones: r.propuesta ? [r.propuesta] : [],
        traza: [{ tipo: 'guia', paso: r.guia?.paso ?? null, guia: r.guia?.id ?? null }],
        guia: r.guia ?? null,
      },
    };
  }

  /**
   * Guías sin modelo: un comando (listo, no pude, salir) mientras hay una guía en curso, o el pedido de empezar una.
   * Devuelve { code?, body } o null si el turno sigue al modelo.
   */
  async function turnoDeGuia({ mensaje, deviceId, sessionId }) {
    const comando = comandoDeGuia(mensaje);
    const inicio = detectarGuia(mensaje);
    if (!comando && !inicio) return null;
    const sid = typeof sessionId === 'string' && sessionId ? sessionId : randomUUID();
    if (!deviceId) {
      if (!inicio) return null;
      return { body: { session_id: sid, respuesta: MENSAJE_SIN_MEMORIA_GUIA, acciones: [], traza: [{ tipo: 'guia', motivo: 'sin_memoria' }], guia: null } };
    }
    if (comando && await seguro('leer la guía', () => motorGuias.activa(deviceId), null)) {
      return respuestaDeGuia(await motorGuias.siguiente(deviceId, comando), sid);
    }
    if (inicio) return respuestaDeGuia(await motorGuias.iniciar(deviceId, inicio), sid);
    return null;
  }

  /** Con un proveedor cambiable (pantalla de bienvenida), "sin IA" es activo === false. */
  const hayModelo = () => Boolean(provider) && provider.activo !== false;

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

  /** Respuesta sin el modelo: lo más parecido de las guías (con su fuente) y, si el pedido es claro, la tarjeta de siempre. */
  async function responderSinModelo({ mensaje, equipo, motivo }) {
    const accion = detectarAccion(mensaje);
    let fragmentos = [];
    try {
      fragmentos = conocimiento?.habilitado ? await conocimiento.buscarHibrido(mensaje, { k: 3, equipo: textoEquipo(equipo) }) : [];
    } catch (err) {
      app.log.error({ err: err.message }, 'respaldo: falló la búsqueda');
    }
    const respuesta = textoDeRespaldo(fragmentos, motivo, Boolean(accion));
    if (!respuesta) return null;
    return {
      respuesta,
      acciones: accion ? [{ ...accion }] : [],
      traza: [{ tipo: 'respaldo', motivo, fragmentos: fragmentos.length, accion: accion?.accion ?? null }],
    };
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

    // Datos del equipo (modelo, sistema): opcionales, solo texto corto. agent.js los limpia antes de usarlos.
    const e = req.body?.equipo;
    const equipo = e && typeof e === 'object'
      ? { fabricante: String(e.fabricante ?? '').slice(0, 80), modelo: String(e.modelo ?? '').slice(0, 80), so: String(e.so ?? '').slice(0, 80) }
      : undefined;

    // Una sola persona usa la app: la clave del límite es la sesión local.
    if (limitador && !limitador.permitir('local')) return reply.code(429).send({ error: 'Muchos mensajes seguidos; esperá un momento.' });

    const quiereStream = req.headers.accept?.includes('text/event-stream') || req.query?.stream === 'true';
    const deviceId = esUuid(req.body?.device_id) && memoria?.habilitada ? req.body.device_id : null;

    // Guías: el comando de un paso o el pedido de empezar una se resuelve aquí, sin gastar el modelo.
    // Si la app pidió streaming, la respuesta viaja como un solo evento "done" para que el cliente la lea igual.
    const porGuia = await turnoDeGuia({ mensaje, deviceId, sessionId: req.body?.session_id });
    if (porGuia) {
      if (porGuia.code) return reply.code(porGuia.code).send(porGuia.body);
      if (quiereStream) return enviarSoloDone(reply, porGuia.body);
      return porGuia.body;
    }

    if (!hayModelo()) {
      const respaldo = await responderSinModelo({ mensaje, equipo, motivo: 'sin_llave' });
      if (respaldo) {
        if (quiereStream) {
          iniciarSse(reply);
          reply.raw.write(`event: done\ndata: ${JSON.stringify({ session_id: randomUUID(), ...respaldo })}\n\n`);
          return reply.raw.end();
        }
        return { session_id: randomUUID(), ...respaldo };
      }
      return reply.code(503).send({
        error: 'No hay una llave de modelo configurada. Kerni probará las respuestas automáticas locales.',
        codigo: 'sin_llave',
        fallbackLocal: true,
      });
    }

    limpiarInactivas();
    let sessionId = req.body?.session_id;
    // Otra IA = otro formato de historial: una sesión de la IA anterior no se reutiliza.
    const version = provider.version ?? 0;
    if (!sessionId || !sesiones.has(sessionId) || sesiones.get(sessionId).version !== version) {
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
      sesiones.set(sessionId, { history, ocupada: false, ultimoUso: now(), version });
    }
    const sesion = sesiones.get(sessionId);
    if (sesion.ocupada) return reply.code(409).send({ error: 'Kerni todavía está respondiendo el mensaje anterior' });

    sesion.ocupada = true;
    // El turno entero tiene un plazo menor que los 60 s que espera la app: si se pasa, o si la app cortó, se aborta
    // (sin seguir gastando cupo) y la sesión queda libre para el siguiente mensaje en vez de responder 409.
    // Vale también con streaming: si la app cierra la conexión a mitad del stream, el turno se corta.
    const corte = new AbortController();
    const alCerrar = () => { if (!reply.raw.writableEnded) corte.abort(); };
    reply.raw.once('close', alCerrar);
    const signal = AbortSignal.any([corte.signal, AbortSignal.timeout(plazoTurnoMs)]);
    let sseIniciado = false;
    try {
      // La base de conocimiento ya no se busca aquí: el modelo la consulta con la herramienta buscar_conocimiento solo cuando hace falta.
      const recuerdos = deviceId ? await seguro('leer el contexto', () => memoria.contexto(deviceId), '') : '';
      // Con una guía en curso, el modelo ve el paso actual y la respuesta termina repitiéndolo (el paso lo guarda la base, no el modelo).
      const guia = deviceId ? await seguro('leer la guía', () => motorGuias.activa(deviceId), null) : null;

      if (quiereStream) {
        iniciarSse(reply);
        sseIniciado = true;
      }

      const { respuesta: respuestaModelo, acciones, traza } = await agent.runTurn({
        sessionId,
        history: sesion.history,
        mensaje,
        snapshot,
        equipo,
        memoria: recuerdos,
        puedeRecordar: Boolean(deviceId),
        signal,
        guia,
        onDelta: (chunk) => {
          if (sseIniciado) reply.raw.write(`event: delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        },
        onStatus: (st) => {
          if (sseIniciado) reply.raw.write(`event: status\ndata: ${JSON.stringify(st)}\n\n`);
        },
      });
      const respuesta = guia ? cerrarConPaso(respuestaModelo, guia) : respuestaModelo;
      // Sin esperar: guardar el turno y encolar reflexión en segundo plano no demoran la respuesta.
      if (deviceId) {
        seguro('guardar el turno', () => memoria.guardarTurno(deviceId, sessionId, mensaje, respuesta), undefined);
        // KERNI_REFLEXION=0 la apaga: cada reflexión es una llamada extra al modelo por mensaje (cuenta contra el cupo).
        if (reflexion) seguro('encolar la reflexión', () => motorReflexion.encolarReflexion({ deviceId, mensaje }), undefined);
      }
      const cuerpo = { session_id: sessionId, respuesta, acciones, traza, ...(guia ? { guia: { id: guia.id, titulo: guia.titulo, paso: guia.paso, total: guia.total } } : {}) };

      if (sseIniciado) {
        reply.raw.write(`event: done\ndata: ${JSON.stringify(cuerpo)}\n\n`);
        return reply.raw.end();
      }

      return cuerpo;
    } catch (err) {
      req.log.error({ err: err.message, codigo: err.codigo, red: err.red }, 'falló el turno');
      // Sin cupo o con el servicio caído, lo que se pueda sin el modelo se hace igual: las guías y las tarjetas de siempre.
      const motivo = err.codigo === 'sin_cupo' || err.status === 402
        ? 'sin_cupo'
        : ['llave_invalida', 'sin_red'].includes(err.codigo) ? null : 'fallo';
      if (motivo) {
        const respaldo = await responderSinModelo({ mensaje, equipo, motivo });
        if (respaldo) {
          if (sseIniciado) {
            reply.raw.write(`event: done\ndata: ${JSON.stringify({ session_id: sessionId, ...respaldo })}\n\n`);
            return reply.raw.end();
          }
          return { session_id: sessionId, ...respaldo };
        }
      }
      // Los errores de la API traen un mensaje pensado para la persona (llave inválida, cupo agotado, sin red).
      const claro = ['llave_invalida', 'sin_cupo', 'sin_red'].includes(err.codigo) || err.status === 402;
      const errorMsg = claro ? err.message : 'Kerni no pudo pensar ahora mismo. Probá de nuevo en un momento.';
      const codigo = claro ? (err.status === 402 ? 'sin_cupo' : err.codigo) : 'fallo';

      if (sseIniciado) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: errorMsg, codigo, ...(motivo === 'sin_cupo' ? { fallbackLocal: true } : {}) })}\n\n`);
        return reply.raw.end();
      }

      return reply.code(claro ? 503 : 502).send({
        error: errorMsg,
        codigo,
        ...(motivo === 'sin_cupo' ? { fallbackLocal: true } : {}),
      });
    } finally {
      reply.raw.off('close', alCerrar);
      sesion.ocupada = false;
      sesion.ultimoUso = now();
    }
  });
}

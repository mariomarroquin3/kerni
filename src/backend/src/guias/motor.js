// Motor de las guías paso a paso. Lógica sin HTTP ni chat: el estado vive en `memoria` (guia_progreso) y las
// propuestas pasan por `validarPropuesta`, igual que las del modelo. Una sola llamada devuelve un solo paso.
//
// Reglas:
//   - "listo" avanza; en el último paso termina la guía.
//   - "no_pude" se queda en el mismo paso y ofrece una salida.
//   - "salir" cierra la guía (se puede volver a empezar desde el principio).
//   - Un paso de acción devuelve una propuesta; nunca ejecuta nada. La persona aprueba la tarjeta (regla 1).
//   - El texto de un paso sale de guias.js. Nunca viene del modelo ni de datos del sistema.

import { GUIAS } from './guias.js';
import { validarPropuesta } from '../acciones.js';

export const RESPUESTAS_GUIA = Object.freeze(['listo', 'no_pude', 'salir']);
export const AYUDA_NO_PUDE = 'Sin apuro. Si no lo encontrás, decime qué ves en la pantalla y te digo el siguiente paso. O escribí "salir" y lo dejamos por ahora.';
export const TEXTO_SALIDA = 'Dejamos la guía por ahora. Cuando quieras, la retomamos desde el principio.';
export const TEXTO_TERMINADA = 'Guía terminada. Si algo no cuadra, pedime la guía de nuevo o preguntame lo que necesités.';

const paso = (i, total) => `Paso ${i + 1} de ${total}`;

/** La línea con el paso actual, tal como la ve la persona. El chat la usa para cerrar cada respuesta del modelo. */
export function lineaDePaso({ paso: n, total, texto }) {
  return `Paso ${n} de ${total}: ${texto}`;
}

/** Un mensaje corto de la persona como comando de guía, o null si no es uno. Sin tildes ni signos. */
export function comandoDeGuia(mensaje) {
  const t = String(mensaje ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.!?¡¿,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t === 'listo') return 'listo';
  if (t === 'no pude') return 'no_pude';
  if (t === 'salir') return 'salir';
  return null;
}

/**
 * @param {object} deps
 * @param {object} deps.memoria  debe tener guiaActual, iniciarGuia, avanzarGuia y borrarGuia (ver memoria/sqlite.js)
 * @param {Array} [deps.guias]   por defecto las cuatro de guias.js (los tests pueden pasar otras)
 * @param {(input: object) => { ok: boolean, accion?: object, error?: string }} [deps.validarAccion]
 *        por defecto validarPropuesta sin foto del sistema (las acciones de guía no llevan pid)
 * @param {{ error?: Function }} [deps.logger]
 */
export function crearMotorGuias({ memoria, guias = GUIAS, validarAccion = (input) => validarPropuesta(input, null), logger }) {
  const buscar = (id) => guias.find((g) => g.id === id) ?? null;

  /** Datos del paso para la respuesta: texto fijo, índice y total. La propuesta solo si pasó la validación. */
  function vista(guia, i) {
    const p = guia.pasos[i];
    const base = {
      guia: { id: guia.id, titulo: guia.titulo, paso: i + 1, total: guia.pasos.length },
      texto: p.texto,
      tipo: p.tipo,
      terminada: false,
    };
    if (p.tipo !== 'accion') return base;
    const r = validarAccion({ accion: p.propuesta.accion, ...(p.propuesta.destino ? { destino: p.propuesta.destino } : {}), motivo: p.motivo });
    if (!r.ok) {
      logger?.error?.({ guia: guia.id, paso: i + 1, error: r.error }, 'guía: la propuesta del paso no pasó la validación');
      return base;
    }
    return { ...base, propuesta: r.accion };
  }

  /** Estado guardado → { guia, i } si es coherente con las guías fijas; si no, se borra y se trata como sin guía. */
  async function leerEstado(deviceId) {
    const fila = await memoria.guiaActual(deviceId);
    if (!fila) return null;
    const guia = buscar(fila.guia_id);
    if (!guia || !Number.isInteger(fila.paso) || fila.paso < 0 || fila.paso >= guia.pasos.length) {
      await memoria.borrarGuia(deviceId);
      return null;
    }
    return { guia, i: fila.paso };
  }

  const fallo = (codigo) => ({ ok: false, codigo });

  /** Empieza una guía desde el paso 1. Devuelve la introducción y ese paso. */
  async function iniciar(deviceId, guiaId) {
    const guia = buscar(guiaId);
    if (!guia) return fallo('guia_desconocida');
    try {
      await memoria.iniciarGuia(deviceId, guia.id);
    } catch (err) {
      logger?.error?.({ err: err.message }, 'guía: no pude guardar el inicio');
      return fallo('fallo_almacen');
    }
    const v = vista(guia, 0);
    return { ok: true, ...v, intro: guia.intro, respuesta: `${guia.intro}\n\n${paso(0, guia.pasos.length)}: ${v.texto}` };
  }

  /**
   * Una respuesta de la persona sobre el paso actual. Solo devuelve un paso (o el cierre).
   * @param {'listo'|'no_pude'|'salir'} respuesta
   */
  async function siguiente(deviceId, respuesta) {
    if (!RESPUESTAS_GUIA.includes(respuesta)) return fallo('respuesta_desconocida');
    let estado;
    try {
      estado = await leerEstado(deviceId);
    } catch (err) {
      logger?.error?.({ err: err.message }, 'guía: no pude leer el avance');
      return fallo('fallo_almacen');
    }
    if (!estado) return fallo('sin_guia');
    const { guia, i } = estado;
    const total = guia.pasos.length;

    try {
      if (respuesta === 'salir') {
        await memoria.borrarGuia(deviceId);
        return { ok: true, cerrada: true, guia: null, texto: null, respuesta: TEXTO_SALIDA, terminada: false };
      }
      if (respuesta === 'no_pude') {
        const v = vista(guia, i);
        return { ok: true, ...v, respuesta: `${AYUDA_NO_PUDE}\n\n${paso(i, total)}: ${v.texto}` };
      }
      // listo
      if (i + 1 >= total) {
        await memoria.borrarGuia(deviceId);
        return { ok: true, cerrada: false, guia: null, texto: null, respuesta: TEXTO_TERMINADA, terminada: true };
      }
      await memoria.avanzarGuia(deviceId, i + 1);
      const v = vista(guia, i + 1);
      return { ok: true, ...v, respuesta: `${paso(i + 1, total)}: ${v.texto}` };
    } catch (err) {
      logger?.error?.({ err: err.message }, 'guía: no pude guardar el avance');
      return fallo('fallo_almacen');
    }
  }

  /**
   * La guía en curso y su paso actual, para armar el contexto del modelo. Null si no hay guía.
   * No incluye la propuesta: el modelo no la ve, la tarjeta ya se mostró (o se muestra con "no pude").
   */
  async function activa(deviceId) {
    const estado = await leerEstado(deviceId);
    if (!estado) return null;
    const { guia, i } = estado;
    return { id: guia.id, titulo: guia.titulo, paso: i + 1, total: guia.pasos.length, texto: guia.pasos[i].texto };
  }

  return { iniciar, siguiente, activa };
}

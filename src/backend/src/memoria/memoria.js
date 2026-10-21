import { limpiarNombre } from '../telemetria.js';
import { limpiarTexto, MAX_HECHOS } from './recuerdos.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const esUuid = (v) => typeof v === 'string' && UUID.test(v);

export const MENSAJES_A_RETOMAR = 6;
export const DIAS_DE_SALUD = 30;
const HORAS_RESUMEN = 24;
const MIN_ENTRE_LECTURAS_MS = 5 * 60_000;

/**
 * Memoria de Kerni sobre Supabase: hechos de la persona, turnos del chat y salud resumida.
 *
 * Reglas:
 *  - Si Supabase falla, el chat NO se rompe: la lectura devuelve vacío y se registra el error.
 *  - Lo guardado vuelve al modelo como DATO entre <memoria>, nunca como instrucción.
 *  - Todo va por `device_id` (UUID que genera la app).
 */
export function createMemoria({ db, logger = console, now = () => Date.now() }) {
  const ultimaSalud = new Map(); // device_id -> ms de la última lectura guardada

  async function seguro(etiqueta, fn, vacio) {
    try {
      return await fn();
    } catch (err) {
      logger.error?.({ err: err.message, codigo: err.codigo }, `memoria: falló ${etiqueta}`);
      return vacio;
    }
  }

  const hechos = (deviceId) => seguro('leer hechos', () =>
    db.select('kerni_hechos', { columnas: 'clave,valor,origen,actualizado', filtros: { device_id: `eq.${deviceId}` }, orden: 'actualizado.desc', limite: MAX_HECHOS }), []);

  async function resumenSalud(deviceId) {
    const desde = new Date(now() - HORAS_RESUMEN * 3_600_000).toISOString();
    const filas = await seguro('leer salud', () =>
      db.select('kerni_salud', { columnas: 'cpu,ram_pct,disco_pct,proceso_top,proceso_mb', filtros: { device_id: `eq.${deviceId}`, creado: `gte.${desde}` }, orden: 'creado.desc', limite: 300 }), []);
    if (filas.length < 3) return '';
    const prom = (k) => filas.reduce((s, f) => s + f[k], 0) / filas.length;
    const pico = (k) => Math.max(...filas.map((f) => f[k]));
    const conteo = new Map();
    for (const f of filas) if (f.proceso_top) conteo.set(f.proceso_top, (conteo.get(f.proceso_top) ?? 0) + 1);
    const [top, veces] = [...conteo].sort((a, b) => b[1] - a[1])[0] ?? [];
    return `Últimas ${HORAS_RESUMEN} h (${filas.length} lecturas): CPU promedio ${Math.round(prom('cpu'))}% (pico ${Math.round(pico('cpu'))}%), `
      + `RAM promedio ${Math.round(prom('ram_pct'))}% (pico ${Math.round(pico('ram_pct'))}%), disco ${Math.round(pico('disco_pct'))}% usado.`
      + (top ? ` El proceso que más veces fue el más pesado: ${limpiarNombre(top)} (${veces} de ${filas.length} lecturas).` : '');
  }

  return {
    habilitada: true,

    hechos,
    resumenSalud,

    /** Bloque <memoria> para el prompt, o '' si no hay nada. */
    async contexto(deviceId) {
      if (!esUuid(deviceId)) return '';
      const [lista, salud] = await Promise.all([hechos(deviceId), resumenSalud(deviceId)]);
      if (!lista.length && !salud) return '';
      const lineas = [
        ...lista.map((h) => `- ${limpiarNombre(h.clave)}: ${limpiarTexto(h.valor)}`),
        ...(salud ? [`Historial de salud: ${salud}`] : []),
      ];
      return `<memoria>\n${lineas.join('\n')}\n</memoria>`;
    },

    /** @returns {Promise<{ok: true} | {ok: false, error: string}>} */
    async guardarHecho(deviceId, clave, valor, origen = 'persona') {
      try {
        const existentes = await db.select('kerni_hechos', { columnas: 'clave', filtros: { device_id: `eq.${deviceId}` }, limite: MAX_HECHOS + 1 });
        if (existentes.length >= MAX_HECHOS && !existentes.some((h) => h.clave === clave)) {
          return { ok: false, error: `ya hay ${MAX_HECHOS} recuerdos; borrá alguno antes de guardar otro` };
        }
        await db.upsert('kerni_hechos', [{ device_id: deviceId, clave, valor, origen, actualizado: new Date(now()).toISOString() }], 'device_id,clave');
        return { ok: true };
      } catch (err) {
        logger.error?.({ err: err.message, codigo: err.codigo }, 'memoria: falló guardar hecho');
        return { ok: false, error: 'No pude guardarlo en la memoria ahora mismo.' };
      }
    },

    borrarHecho: (deviceId, clave) =>
      seguro('borrar hecho', async () => { await db.delete('kerni_hechos', { device_id: `eq.${deviceId}`, clave: `eq.${clave}` }); return true; }, false),

    /** Borra TODO lo de esta PC (hechos, conversación y salud). */
    olvidarTodo: (deviceId) => seguro('olvidar todo', async () => {
      for (const tabla of ['kerni_hechos', 'kerni_mensajes', 'kerni_salud']) await db.delete(tabla, { device_id: `eq.${deviceId}` });
      return true;
    }, false),

    guardarTurno: (deviceId, sessionId, mensaje, respuesta) => seguro('guardar turno', () =>
      db.insert('kerni_mensajes', [
        { device_id: deviceId, session_id: sessionId, rol: 'user', contenido: mensaje.slice(0, 4000) },
        { device_id: deviceId, session_id: sessionId, rol: 'assistant', contenido: respuesta.slice(0, 4000) },
      ]), undefined),

    /** Últimos turnos como texto plano, del más viejo al más nuevo, siempre en pares user→assistant. */
    async ultimosMensajes(deviceId, max = MENSAJES_A_RETOMAR) {
      const filas = await seguro('leer mensajes', () =>
        db.select('kerni_mensajes', { columnas: 'rol,contenido', filtros: { device_id: `eq.${deviceId}` }, orden: 'id.desc', limite: max }), []);
      const ordenadas = filas.reverse();
      while (ordenadas.length && ordenadas[0].rol !== 'user') ordenadas.shift();
      if (ordenadas.length && ordenadas.at(-1).rol !== 'assistant') ordenadas.pop();
      return ordenadas;
    },

    /** Guarda una lectura resumida; ignora las que llegan más seguido que cada 5 min. */
    async registrarSalud(deviceId, snapshot) {
      const t = now();
      if (t - (ultimaSalud.get(deviceId) ?? 0) < MIN_ENTRE_LECTURAS_MS) return false;
      ultimaSalud.set(deviceId, t);
      const top = [...snapshot.procesos].sort((a, b) => b.memoriaMb - a.memoriaMb)[0];
      return seguro('guardar salud', async () => {
        await db.insert('kerni_salud', [{
          device_id: deviceId,
          cpu: snapshot.cpu,
          ram_pct: (snapshot.ram.usadaMb / snapshot.ram.totalMb) * 100,
          disco_pct: ((snapshot.disco.totalGb - snapshot.disco.libreGb) / snapshot.disco.totalGb) * 100,
          proceso_top: top ? limpiarNombre(top.nombre) : null,
          proceso_mb: top?.memoriaMb ?? null,
        }]);
        return true;
      }, false);
    },

    /** Mantenimiento al arrancar: tira la salud de más de 30 días. */
    mantenimiento: () => seguro('limpiar salud vieja', () =>
      db.delete('kerni_salud', { creado: `lt.${new Date(now() - DIAS_DE_SALUD * 86_400_000).toISOString()}` }), undefined),
  };
}

/** Sin Supabase: la misma interfaz, sin guardar nada. Kerni funciona igual, solo que sin recordar. */
export function createMemoriaNula() {
  const no = { ok: false, error: 'La memoria no está conectada (falta configurar Supabase).' };
  return {
    habilitada: false,
    hechos: async () => [],
    resumenSalud: async () => '',
    contexto: async () => '',
    guardarHecho: async () => no,
    borrarHecho: async () => false,
    olvidarTodo: async () => false,
    guardarTurno: async () => undefined,
    ultimosMensajes: async () => [],
    registrarSalud: async () => false,
    mantenimiento: async () => undefined,
  };
}

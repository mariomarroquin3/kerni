/**
 * Piezas comunes de la memoria. La memoria real vive en SQLite (`sqlite.js`); Supabase solo guarda
 * la salud (`kerni_salud`) y la base de conocimiento del RAG.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const esUuid = (v) => typeof v === 'string' && UUID.test(v);

/** Sin memoria: la misma interfaz, sin guardar nada. Kerni funciona igual, solo que sin recordar. */
export function createMemoriaNula() {
  const no = { ok: false, error: 'La memoria no está disponible.' };
  return {
    habilitada: false,
    hechos: async () => [],
    resumenSalud: async () => '',
    contexto: async () => '',
    guardarHecho: async () => no,
    aprobarRecuerdo: async () => no,
    borrarHecho: async () => false,
    olvidarTodo: async () => false,
    guardarTurno: async () => undefined,
    ultimosMensajes: async () => [],
    registrarSalud: async () => false,
    mantenimiento: async () => undefined,
  };
}

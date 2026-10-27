/**
 * Verificación de un proyecto de Supabase (en la nube o el local de Docker) para Kerni.
 * Cada paso dice qué falló y QUÉ HACER, porque los errores crudos de PostgREST no se entienden.
 * No escribe nada: solo lee y llama a las funciones de búsqueda con un vector vacío.
 */

/** Qué tipo de llave es, sin llamar a nadie: `secret`, `service_role`, `publishable`, `anon` o `desconocido`. */
export function tipoDeLlave(llave) {
  const k = String(llave ?? '').trim();
  if (k.startsWith('sb_secret_')) return 'secret';
  if (k.startsWith('sb_publishable_')) return 'publishable';
  const partes = k.split('.');
  if (partes.length === 3) {
    try {
      const rol = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role;
      if (rol === 'service_role' || rol === 'anon') return rol;
    } catch { /* no es un JWT legible */ }
  }
  return 'desconocido';
}

const vectorVacio = (dimension) => `[${Array(dimension).fill(0).join(',')}]`;

/** Traduce el error de Supabase a algo accionable. */
function ayudaPara(err, { migracion, que }) {
  const texto = `${err.message ?? ''}`;
  if (err.codigo === 'memoria_llave_invalida') return 'La llave fue rechazada. Usá la llave SECRETA del proyecto (Project Settings > API Keys: "secret" o la legacy "service_role"), no la publishable/anon, y copiala completa.';
  if (err.codigo === 'memoria_sin_red') return 'No llegué al proyecto. Revisá SUPABASE_URL (tiene que ser https://<ref>.supabase.co, sin /rest/v1), tu internet y que el proyecto no esté pausado (los proyectos gratis se pausan por inactividad: Restore en el dashboard).';
  if (/dimensions/i.test(texto)) return 'La dimensión de los vectores no coincide con la tabla (768). Revisá EMBEDDINGS_DIMENSIONS y que la migración sea la de vector(768).';
  if (err.status === 404 || /PGRST20[25]|schema cache|Could not find/i.test(texto)) {
    return `${que} no existe todavía: corré ${migracion} en el SQL Editor del proyecto (ver docs/supabase-cloud-setup.md).`;
  }
  return `Respuesta inesperada de Supabase: ${texto.slice(0, 180)}`;
}

/**
 * @param {{ url: string, key: string, db: object, dimension?: number }} args
 * @returns {Promise<{ nombre: string, ok: boolean, detalle: string, ayuda: string }[]>}
 */
export async function verificarSupabase({ url, key, db, dimension = 768 }) {
  const pasos = [];
  const paso = (nombre, ok, detalle = '', ayuda = '') => pasos.push({ nombre, ok, detalle, ayuda });

  // 1) La dirección del proyecto.
  const direccion = String(url ?? '').trim();
  if (!direccion) {
    paso('Dirección del proyecto (SUPABASE_URL)', false, 'vacía', 'Pegá la Project URL en src/backend/.env: SUPABASE_URL=https://<ref>.supabase.co');
    return pasos;
  }
  const nube = /^https:\/\/[a-z0-9]{10,}\.supabase\.co\/?$/i.test(direccion);
  const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(direccion);
  const sobra = /\/rest\/v1\/?$/.test(direccion);
  paso('Dirección del proyecto (SUPABASE_URL)', nube || local || sobra,
    nube ? 'proyecto en la nube' : local ? 'Supabase local (Docker)' : direccion,
    nube || local ? '' : sobra ? 'Sobra "/rest/v1": lo agrego yo, pero conviene dejar solo https://<ref>.supabase.co.' : 'No parece la Project URL. Tiene que ser https://<ref>.supabase.co (Project Settings > API).');

  // 2) El tipo de llave, sin llamar a nadie.
  const tipo = tipoDeLlave(key);
  const llaveBien = tipo === 'secret' || tipo === 'service_role' || tipo === 'desconocido';
  paso('Llave (SUPABASE_SECRET_KEY)', llaveBien && Boolean(key), key ? `tipo: ${tipo}` : 'vacía',
    !key ? 'Pegá la llave secreta en src/backend/.env: SUPABASE_SECRET_KEY=...'
      : tipo === 'publishable' || tipo === 'anon' ? 'Esa es la llave PÚBLICA y no puede leer nada (a propósito: las tablas no tienen permisos para ella). Necesitás la secreta.'
        : tipo === 'desconocido' ? 'No reconozco el formato; si falla la conexión, probablemente esté mal copiada.' : '');
  if (!key || !llaveBien) return pasos;

  // 3) Conexión y migración de salud.
  try {
    await db.select('kerni_salud', { limite: 1 });
    paso('Conexión y tabla kerni_salud', true, 'responde');
  } catch (err) {
    paso('Conexión y tabla kerni_salud', false, err.message, ayudaPara(err, { migracion: 'supabase/migrations/20261021000000_memory.sql', que: 'La tabla kerni_salud' }));
    if (err.codigo === 'memoria_llave_invalida' || err.codigo === 'memoria_sin_red') return pasos;
  }

  // 4) Conocimiento (RAG).
  try {
    const filas = await db.select('kerni_conocimiento', { columnas: 'fuente', limite: 1000 });
    const fuentes = new Set(filas.map((f) => f.fuente));
    paso('Tabla kerni_conocimiento', true, filas.length ? `${filas.length}${filas.length === 1000 ? '+' : ''} fragmentos de ${fuentes.size} documentos` : 'vacía: falta indexar (npm run indexar)');
  } catch (err) {
    paso('Tabla kerni_conocimiento', false, err.message, ayudaPara(err, { migracion: 'supabase/migrations/20261021000100_rag.sql', que: 'La tabla kerni_conocimiento' }));
  }

  // 5) Las dos funciones de búsqueda, con un vector vacío (minimo 2 no devuelve nada, solo prueba que existen).
  try {
    await db.rpc('kerni_buscar_conocimiento', { consulta: vectorVacio(dimension), k: 1, minimo: 2 });
    paso('Función de búsqueda vectorial', true, `acepta vectores de ${dimension} dimensiones`);
  } catch (err) {
    paso('Función de búsqueda vectorial', false, err.message, ayudaPara(err, { migracion: 'supabase/migrations/20261021000100_rag.sql', que: 'La función kerni_buscar_conocimiento' }));
  }
  try {
    await db.rpc('kerni_buscar_conocimiento_hibrido', { consulta_vector: vectorVacio(dimension), consulta_texto: 'prueba', k: 1, minimo: 2 });
    paso('Función de búsqueda híbrida (vector + texto)', true, 'disponible');
  } catch (err) {
    paso('Función de búsqueda híbrida (vector + texto)', false, err.message, `${ayudaPara(err, { migracion: 'supabase/migrations/20261021000200_rag_hibrido.sql', que: 'La función kerni_buscar_conocimiento_hibrido' })} Es opcional: sin ella Kerni usa solo la búsqueda vectorial.`);
  }
  return pasos;
}

/** El proyecto sirve para Kerni si pasan todos los pasos obligatorios (la búsqueda híbrida es opcional). */
export const esObligatorio = (paso) => !/híbrida/.test(paso.nombre);

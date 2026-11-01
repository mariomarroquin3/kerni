/**
 * Búsqueda de documentación oficial de Microsoft por el servidor MCP público de Microsoft Learn.
 *
 * Solo lectura: la única herramienta que se llama es microsoft_docs_search (verificada en
 * https://learn.microsoft.com/en-us/training/support/mcp-developer-reference, el 2026-11-01).
 * Sus argumentos: { query: string } (https://learn.microsoft.com/api/mcp, tools/list).
 *
 * Privacidad: lo único que sale de la PC es el texto de la pregunta. Nada de la foto del sistema,
 * del device_id, del equipo, de la memoria ni de nombres de archivos.
 * Términos de uso: https://learn.microsoft.com/en-us/legal/termsofuse (uso personal y no comercial,
 * salvo que se indique otra cosa; el servidor MCP se describe como público y sin costo en
 * https://learn.microsoft.com/en-us/training/support/mcp).
 */
import { createClienteMcp, ErrorMcp } from './cliente.js';

export const TOOL_BUSQUEDA = 'microsoft_docs_search';
export const MIN_PREGUNTA = 4;
export const MAX_PREGUNTA = 200;
export const CACHE_MAX = 20;
export const CACHE_MS = 10 * 60_000;
export const MAX_RESULTADOS = 5;

/** Valida la pregunta: texto, sin espacios sobrantes, entre 4 y 200 caracteres. */
export function validarPregunta(pregunta) {
  if (typeof pregunta !== 'string') return { ok: false };
  const consulta = pregunta.trim();
  if (consulta.length < MIN_PREGUNTA || consulta.length > MAX_PREGUNTA) return { ok: false };
  return { ok: true, consulta };
}

/**
 * Convierte el resultado de tools/call a una lista de documentos. El texto de cada uno es DATO NO CONFIABLE:
 * aquí solo se separa; el saneado y el límite de tamaño están en el harness del agente.
 */
export function leerResultadoDocs(resultado) {
  if (resultado?.isError) throw new ErrorMcp('RPC');
  const texto = (resultado?.content ?? []).find((c) => c?.type === 'text')?.text;
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorMcp('PROTOCOLO');
  }
  if (!Array.isArray(datos?.results)) throw new ErrorMcp('PROTOCOLO');
  return datos.results.slice(0, MAX_RESULTADOS).map((r) => ({
    titulo: typeof r?.title === 'string' ? r.title : '',
    extracto: typeof r?.content === 'string' ? r.content : '',
    url: typeof r?.contentUrl === 'string' ? r.contentUrl : (typeof r?.url === 'string' ? r.url : ''),
  }));
}

/**
 * @param {object} opciones
 * @param {{ llamarHerramienta: Function }} opciones.cliente  Cliente MCP (en tests, uno falso).
 * @param {() => number} [opciones.clock]  Reloj en milisegundos (inyectable para la caché).
 */
export function createMicrosoftLearn({ cliente, clock = Date.now, cacheMax = CACHE_MAX, cacheMs = CACHE_MS }) {
  // Mapa en orden de uso: la primera clave es la menos reciente.
  const cache = new Map();

  /**
   * @returns {Promise<{ titulo: string, extracto: string, url: string }[]>}
   * Lanza ErrorMcp (con mensaje en español) si la pregunta no sirve o si Microsoft Learn falla.
   */
  async function buscarDocsMicrosoft(pregunta) {
    const v = validarPregunta(pregunta);
    if (!v.ok) throw new ErrorMcp('PREGUNTA', `La pregunta tiene que tener entre ${MIN_PREGUNTA} y ${MAX_PREGUNTA} caracteres.`);
    const { consulta } = v;

    const guardado = cache.get(consulta);
    if (guardado && clock() - guardado.at < cacheMs) {
      cache.delete(consulta);
      cache.set(consulta, guardado);
      return guardado.resultados;
    }
    cache.delete(consulta);

    // Solo la pregunta viaja en los argumentos.
    const resultado = await cliente.llamarHerramienta(TOOL_BUSQUEDA, { query: consulta });
    const resultados = leerResultadoDocs(resultado);

    cache.set(consulta, { at: clock(), resultados });
    while (cache.size > cacheMax) cache.delete(cache.keys().next().value);
    return resultados;
  }

  return { buscarDocsMicrosoft };
}

/** Lo que el backend arma al arrancar: nada si la bandera está apagada (la herramienta ni se ofrece). */
export function crearDocsMicrosoft({ activo, deps, clock } = {}) {
  if (!activo) return null;
  return createMicrosoftLearn({ cliente: createClienteMcp({ deps }), clock });
}

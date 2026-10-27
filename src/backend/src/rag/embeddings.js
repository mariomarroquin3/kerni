/**
 * Cliente de embeddings para APIs compatibles con OpenAI (Gemini y OpenRouter).
 * Convierte textos en vectores del tamaño que espera la tabla (`EMBEDDINGS_DIMENSIONS`).
 */
export const EMBEDDINGS_POR_DEFECTO = {
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/embeddings', model: 'gemini-embedding-001' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1/embeddings', model: 'openai/text-embedding-3-small' },
};
export const DIMENSIONES = 768;
const TIMEOUT_MS = 20_000;
const REINTENTOS = 3;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function createEmbeddings({ apiKey, baseUrl, model, dimensions = DIMENSIONES, fetch: fetchFn = globalThis.fetch, sleep = dormir, nombre = 'embeddings' }) {
  /** `reintentos` y `timeoutMs` se acortan en el chat, donde esperar los embeddings demora la respuesta.
   * @param {string[]} textos @returns {Promise<number[][]>} un vector por texto, en el mismo orden */
  async function embed(textos, { reintentos = REINTENTOS, timeoutMs = TIMEOUT_MS } = {}) {
    if (!textos.length) return [];
    for (let intento = 0; ; intento++) {
      let res;
      try {
        res = await fetchFn(baseUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, input: textos, dimensions }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        if (intento < reintentos - 1) { await sleep(1000 * 2 ** intento); continue; }
        throw Object.assign(new Error('No pude calcular los embeddings (sin red o tardó demasiado).'), { codigo: 'sin_red' });
      }
      if (res.status === 429 || res.status >= 500) {
        if (intento < reintentos - 1) { await sleep(2000 * 2 ** intento); continue; }
        throw Object.assign(new Error(res.status === 429 ? 'Se agotó el cupo de embeddings; probá más tarde.' : 'El servicio de embeddings no responde.'), { codigo: res.status === 429 ? 'sin_cupo' : 'sin_red' });
      }
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error('La llave de embeddings no es válida.'), { codigo: 'llave_invalida' });
      if (res.status === 400 || res.status === 404) {
        let detalle = '';
        try { detalle = String((await res.json())?.message ?? '').slice(0, 200); } catch { /* sin cuerpo */ }
        throw Object.assign(new Error(`Embeddings: error ${res.status}${detalle ? ` - ${detalle}` : ''}`), { codigo: 'embeddings_error', status: res.status });
      }
      if (!res.ok) throw Object.assign(new Error(`Los embeddings respondieron ${res.status}`), { codigo: 'embeddings_error', status: res.status });

      const json = await res.json();
      const filas = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding);
      if (filas.length !== textos.length) throw Object.assign(new Error('La respuesta de embeddings vino incompleta.'), { codigo: 'embeddings_error' });
      for (const v of filas) {
        if (!Array.isArray(v) || v.length !== dimensions) {
          throw Object.assign(new Error(`El modelo ${model} devolvió vectores de ${v?.length} dimensiones y la tabla espera ${dimensions}. Revisá EMBEDDINGS_DIMENSIONS y la migración.`), { codigo: 'dimension_incorrecta' });
        }
      }
      return filas;
    }
  }

  return { nombre, model, dimensions, embed };
}

/** Elige proveedor de embeddings según el entorno, o devuelve null si no hay llave. */
export function crearEmbeddings(config, deps = {}) {
  const e = config.embeddings;
  const gemini = config.gemini?.apiKey;
  const openrouter = config.openrouter?.apiKey;
  const nombre = e.provider || (gemini ? 'gemini' : openrouter ? 'openrouter' : '');
  if (!nombre) return null;
  const base = EMBEDDINGS_POR_DEFECTO[nombre];
  if (!base) throw new Error(`EMBEDDINGS_PROVIDER "${nombre}" no existe. Usá gemini u openrouter.`);
  const apiKey = nombre === 'gemini' ? gemini : openrouter;
  if (!apiKey) throw new Error(`EMBEDDINGS_PROVIDER=${nombre} pero falta su llave en .env.`);
  return createEmbeddings({
    apiKey, nombre,
    baseUrl: e.baseUrl || base.baseUrl,
    model: e.model || base.model,
    dimensions: e.dimensions || DIMENSIONES,
    ...deps,
  });
}

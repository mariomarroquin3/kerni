/**
 * Cliente mínimo de Supabase (PostgREST) con fetch. Sin SDK: el backend solo necesita
 * leer, insertar, upsertar y borrar filas, y así se prueba con un servidor falso.
 *
 * La llave (service/secret) vive solo en el backend. Nunca va en mensajes de error.
 */
export const TIMEOUT_SUPABASE_MS = 5000;

export function createSupabase({ url, key, fetch: fetchFn = globalThis.fetch, timeoutMs = TIMEOUT_SUPABASE_MS }) {
  const base = String(url).replace(/\/+$/, '');
  // Las llaves nuevas (sb_secret_…) no son JWT: van solo en `apikey`. Las legacy (eyJ…) también en Authorization.
  const headers = { apikey: key, ...(String(key).startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) };

  async function pedir(tabla, { metodo = 'GET', query = {}, cuerpo, prefer } = {}) {
    const qs = new URLSearchParams(query).toString();
    let res;
    try {
      res = await fetchFn(`${base}/rest/v1/${tabla}${qs ? `?${qs}` : ''}`, {
        method: metodo,
        headers: {
          ...headers,
          ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(prefer ? { prefer } : {}),
        },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw Object.assign(new Error('No pude hablar con Supabase (sin red o tardó demasiado)'), { codigo: 'memoria_sin_red', causa: err.name });
    }
    if (!res.ok) {
      let detalle = '';
      try { detalle = String((await res.json())?.message ?? '').slice(0, 200); } catch { /* sin cuerpo */ }
      const codigo = res.status === 401 || res.status === 403 ? 'memoria_llave_invalida' : 'memoria_error';
      throw Object.assign(new Error(`Supabase respondió ${res.status}${detalle ? `: ${detalle}` : ''}`), { codigo, status: res.status });
    }
    if (res.status === 204) return [];
    const texto = await res.text();
    return texto ? JSON.parse(texto) : [];
  }

  return {
    /** filtros: { columna: 'eq.valor' | 'gte.valor' | … } (sintaxis de PostgREST) */
    select: (tabla, { columnas = '*', filtros = {}, orden, limite } = {}) =>
      pedir(tabla, { query: { select: columnas, ...filtros, ...(orden ? { order: orden } : {}), ...(limite ? { limit: String(limite) } : {}) } }),
    insert: (tabla, filas) => pedir(tabla, { metodo: 'POST', cuerpo: filas, prefer: 'return=minimal' }),
    upsert: (tabla, filas, conflicto) =>
      pedir(tabla, { metodo: 'POST', query: { on_conflict: conflicto }, cuerpo: filas, prefer: 'resolution=merge-duplicates,return=minimal' }),
    /** Llama a una función SQL (RPC) con argumentos con nombre. */
    rpc: (funcion, args) => pedir(`rpc/${funcion}`, { metodo: 'POST', cuerpo: args }),
    delete: (tabla, filtros) => pedir(tabla, { metodo: 'DELETE', query: filtros, prefer: 'return=minimal' }),
  };
}

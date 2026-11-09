// Estado de la IA que se muestra junto al chat. Lógica pura (sin DOM, testable).
// Fuentes: /health (¿hay un proveedor de IA configurado?) y la última respuesta de /chat (¿se agotó el cupo?).

export const REFRESCO_NORMAL_MS = 60_000;
export const REFRESCO_RAPIDO_MS = 3_000;
/** Con el instalador, el backend se enciende unos segundos DESPUÉS de la ventana: se reintenta rápido durante ~1 minuto. */
export const REINTENTOS_RAPIDOS = 20;

/**
 * Cuánto esperar hasta volver a preguntar `/health`. Sin respuesta (el backend todavía arranca) se reintenta cada pocos segundos;
 * con respuesta, o pasado ese minuto, una vez por minuto. Antes la etiqueta decía "Sin conexión con Kerni" hasta un minuto entero.
 * @param {object|null|undefined} health lo último que se leyó (`null` = no hubo respuesta)
 * @param {number} intentosFallidos cuántas veces seguidas no hubo respuesta
 */
export function proximoRefresco(health, intentosFallidos = 0) {
  return health === null && intentosFallidos < REINTENTOS_RAPIDOS ? REFRESCO_RAPIDO_MS : REFRESCO_NORMAL_MS;
}

export const TEXTO_IA = {
  comprobando: 'IA: comprobando…',
  sin_conexion: 'Sin conexión con Kerni',
  con: 'Con IA',
  sin: 'Sin IA: respuestas locales',
  cupo: 'Cupo agotado, probá más tarde',
  llave_invalida: 'Llave no válida',
};

/**
 * @param {object|null|undefined} health cuerpo de /health; `undefined` = todavía no se preguntó; `null` = no hubo respuesta
 * @param {'ok'|'sin_cupo'|'llave_invalida'|null} ultima qué dijo la última respuesta de /chat (null = ninguna todavía)
 * @returns {{ clave: string, texto: string, detalle: string }}
 */
export function estadoIA(health, ultima = null) {
  if (health === undefined) return { clave: 'comprobando', texto: TEXTO_IA.comprobando, detalle: '' };
  if (health === null) return { clave: 'sin_conexion', texto: TEXTO_IA.sin_conexion, detalle: 'No pude hablar con Kerni en este momento.' };
  if (!health.proveedor) return { clave: 'sin', texto: TEXTO_IA.sin, detalle: health.aviso || 'No hay llave de IA configurada; Kerni responde con sus reglas y sus guías.' };
  if (ultima === 'llave_invalida') return { clave: 'llave_invalida', texto: TEXTO_IA.llave_invalida, detalle: `La llave de ${health.modelo ?? health.proveedor} no es válida. Revisá la llave en la configuración de Kerni.` };
  if (ultima === 'sin_cupo') return { clave: 'cupo', texto: TEXTO_IA.cupo, detalle: `Se agotó el cupo de ${health.modelo ?? health.proveedor} por hoy.` };
  // Si la IA que se usa no es la pedida (LLM_PROVIDER sin llave), se dice: antes quedaba todo en silencio.
  const detalle = `Modelo: ${health.modelo ?? health.proveedor}${health.aviso ? `. Aviso: ${health.aviso}` : ''}`;
  return { clave: 'con', texto: TEXTO_IA.con, detalle };
}

/**
 * Lo que dice una respuesta de /chat sobre la IA. `null` = no se sabe (no cambia el estado anterior).
 * Usa `codigo` (estable) cuando viene; si no, cae a lo que había antes (fallbackLocal = sin cupo).
 * `sin_llave` no cambia la etiqueta: /health ya dice que no hay proveedor.
 * @param {boolean} ok si la respuesta HTTP fue exitosa
 * @param {object|null} data cuerpo ya leído
 */
export function motivoDeRespuesta(ok, data) {
  if (ok) {
    const respaldo = (data?.traza ?? []).some((t) => t?.tipo === 'respaldo' && t?.motivo === 'sin_cupo');
    return respaldo ? 'sin_cupo' : 'ok';
  }
  if (data?.codigo === 'llave_invalida') return 'llave_invalida';
  if (data?.codigo === 'sin_cupo') return 'sin_cupo';
  if (data?.codigo === 'sin_llave') return null;
  return data?.fallbackLocal ? 'sin_cupo' : null;
}

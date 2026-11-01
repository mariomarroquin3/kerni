// Estado de la IA que se muestra junto al chat. Lógica pura (sin DOM, testable).
// Fuentes: /health (¿hay un proveedor de IA configurado?) y la última respuesta de /chat (¿se agotó el cupo?).

export const TEXTO_IA = {
  comprobando: 'IA: comprobando…',
  sin_conexion: 'Sin conexión con Kerni',
  con: 'Con IA',
  sin: 'Sin IA: respuestas locales',
  cupo: 'Cupo agotado, probá más tarde',
};

/**
 * @param {object|null|undefined} health cuerpo de /health; `undefined` = todavía no se preguntó; `null` = no hubo respuesta
 * @param {'ok'|'sin_cupo'|null} ultima qué dijo la última respuesta de /chat (null = ninguna todavía)
 * @returns {{ clave: string, texto: string, detalle: string }}
 */
export function estadoIA(health, ultima = null) {
  if (health === undefined) return { clave: 'comprobando', texto: TEXTO_IA.comprobando, detalle: '' };
  if (health === null) return { clave: 'sin_conexion', texto: TEXTO_IA.sin_conexion, detalle: 'No pude hablar con Kerni en este momento.' };
  if (!health.proveedor) return { clave: 'sin', texto: TEXTO_IA.sin, detalle: 'No hay llave de IA configurada; Kerni responde con sus reglas y sus guías.' };
  if (ultima === 'sin_cupo') return { clave: 'cupo', texto: TEXTO_IA.cupo, detalle: `Se agotó el cupo de ${health.modelo ?? health.proveedor} por hoy.` };
  return { clave: 'con', texto: TEXTO_IA.con, detalle: `Modelo: ${health.modelo ?? health.proveedor}` };
}

/**
 * Lo que dice una respuesta de /chat sobre el cupo. `null` = no se sabe (no cambia el estado anterior).
 * @param {boolean} ok si la respuesta HTTP fue exitosa
 * @param {object|null} data cuerpo ya leído
 */
export function motivoDeRespuesta(ok, data) {
  if (ok) {
    const respaldo = (data?.traza ?? []).some((t) => t?.tipo === 'respaldo' && t?.motivo === 'sin_cupo');
    return respaldo ? 'sin_cupo' : 'ok';
  }
  return data?.fallbackLocal ? 'sin_cupo' : null;
}

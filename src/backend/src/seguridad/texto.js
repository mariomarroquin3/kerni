/**
 * Texto no confiable: nombres de procesos y archivos, memoria, conocimiento, enlaces y lo que escribe el modelo.
 * Es dato, no instrucción (AGENTS.md, regla 4). Hay UNA sola copia de la limpieza: todo el backend la usa desde aquí.
 */

/** Caracteres invisibles de sentido: bidireccionales, ancho cero, aislados y BOM. */
const INVISIBLES = /[\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;
/** Control (incluido C1), y las etiquetas: `<` y `>` pasan a espacio para que nada parezca un bloque (`</sistema>`). */
const CONTROL_Y_ETIQUETAS = /[\u0000-\u001f\u007f-\u009f<>]/g;
/** Una URL o una dirección web, para quitarla de textos que no deben llevar enlaces. */
const URL_RE = /\b(?:https?|ftp|hxxps?):\/\/\S*|\bwww\.\S*|(?<![\w.-])(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|gob|edu|info|xyz|top|site|online|app|dev|link|click|ru|cn|tk|ml|ga|cf|gq|me|ly|sv|es|mx|pw|cc|biz|ws|gl)(?:\/\S*)?/gi;
const TIENE_INVISIBLES = /[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/;

/** Quita solo los invisibles. Para comparar nombres (la misma regla en Rust: `es_protegido`). */
export function quitarInvisibles(texto) {
  return String(texto ?? '').replace(INVISIBLES, '');
}

/** True si el texto trae caracteres invisibles o de control (no se muestran tal cual). */
export function tieneInvisibles(texto) {
  return TIENE_INVISIBLES.test(String(texto ?? ''));
}

/** Quita direcciones web de un texto. Lo que queda no lleva enlaces. */
export function quitarUrls(texto) {
  return String(texto ?? '').replace(URL_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Texto libre -> una línea limpia y acotada. Orden: NFKC (para que la versión de ancho completo de `<` también caiga),
 * quitar invisibles, control y `<>` a espacio, `|` a `/` (para que no simule columnas), espacios colapsados y tope.
 * Sin `max` no se corta.
 */
export function limpiarTextoNoConfiable(texto, { max = Infinity } = {}) {
  const limpio = String(texto ?? '')
    .normalize('NFKC')
    .replace(INVISIBLES, '')
    .replace(CONTROL_Y_ETIQUETAS, ' ')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
  return Number.isFinite(max) ? limpio.slice(0, max).trim() : limpio;
}

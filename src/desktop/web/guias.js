// Guías paso a paso en la app: la línea "Guía: … (paso N de M)" y los botones. Lógica pura (sin DOM).
// El texto de cada paso llega del backend ya armado; aquí solo se arma la etiqueta y se decide qué mostrar.

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** La persona pide una guía por su nombre. Mientras hay una en curso, el chat no decide nada por su cuenta. */
export function pideGuia(texto) {
  return /\b(guiam\w*|paso a paso)\b/.test(norm(texto));
}

/** "Guía: PC lenta (paso 2 de 4)". Se pinta con textContent: el título nunca se interpreta como HTML. */
export function etiquetaGuia(guia) {
  if (!guia?.titulo) return '';
  return `Guía: ${guia.titulo} (paso ${guia.paso} de ${guia.total})`;
}

/** Hay guía para mostrar: el backend manda `guia: null` cuando se cierra o termina. */
export function guiaVisible(guia) {
  return Boolean(guia && guia.titulo && Number.isInteger(guia.paso) && Number.isInteger(guia.total));
}

/** Botones de la línea de guía: id del elemento, respuesta que se manda a /guias/responder y texto visible. */
export const BOTONES_GUIA = Object.freeze([
  Object.freeze({ id: 'guia-listo', respuesta: 'listo', texto: 'Listo' }),
  Object.freeze({ id: 'guia-no-pude', respuesta: 'no_pude', texto: 'No pude' }),
  Object.freeze({ id: 'guia-salir', respuesta: 'salir', texto: 'Salir' }),
]);

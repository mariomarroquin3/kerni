// Respuestas fijas del chat, sin modelo ni API key. Lógica pura (sin DOM).
//
// Es deliberadamente conservadora, como el FAQ de Bitoo: solo contesta
// pedidos cortos y claros de "ver" un dato. Todo lo que pida explicación,
// causa o consejo ("¿por qué se llena mi disco?") sigue yendo al modelo.

export const MAX_PALABRAS = 8;
export const DISCO_APRETADO_PCT = 85;

const TEMA_DISCO = /\b(disco|almacenamiento|espacio|c:|gb libres?|memoria del disco)\b/i;
// Si aparece cualquiera de estas, la persona quiere algo más que ver el número.
const PIDE_MAS = /\b(por ?qu[eé]|como|cómo|que hago|qué hago|limpi\w*|liber\w*|borr\w*|ocup\w*|llen\w*|aument\w*|recomiend\w*|conviene|consejo)\b/i;

// "archivos pesados", "carpetas grandes", "qué ocupa más espacio", "archivos que ya no uso": quiere VER lo que pesa y no se usa.
const TEMA_PESADOS = /\b((archivos?|carpetas?|cosas)\s+(pesad\w*|grandes?|enormes?)|(pesad\w*|grandes?)\s+(archivos?|carpetas?)|qu[eé]\s+(archivos?|cosas)?\s*ocupa(n)?\s+(m[aá]s\s+)?(espacio|lugar)|(archivos?|cosas)\s+(que\s+)?(ya\s+)?no\s+uso|sin\s+usar)\b/i;

const palabras = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const gb = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));

/** Porcentaje usado del disco principal, redondeado. */
export function porcentajeDisco(m) {
  return Math.round(((m.disco.totalGb - m.disco.libreGb) / m.disco.totalGb) * 100);
}

/**
 * @param {string} texto lo que escribió la persona
 * @param {object|null} m última lectura de `metricas`
 * @returns {null | { texto: string, proponer?: object }} null = que conteste el modelo
 */
export function responderLocal(texto, m) {
  if (!texto) return null;
  if (palabras(texto) <= MAX_PALABRAS && TEMA_PESADOS.test(texto)) {
    // No hace falta la lectura del sistema: la búsqueda la hace la app, y solo después de que la persona apruebe.
    return {
      texto: 'Puedo buscar los archivos y carpetas más pesados que no usás hace rato. Solo te los muestro: yo no borro nada de ahí, lo decidís vos.',
      proponer: { accion: 'ver_archivos_pesados', motivo: 'Ver qué ocupa espacio sin usarse.' },
    };
  }
  if (!m) return null;
  if (palabras(texto) > MAX_PALABRAS) return null;
  if (!TEMA_DISCO.test(texto) || PIDE_MAS.test(texto)) return null;

  const usado = m.disco.totalGb - m.disco.libreGb;
  const pct = porcentajeDisco(m);
  const base = `Tu disco principal va al ${pct}%: usás ${gb(usado)} GB de ${gb(m.disco.totalGb)} GB y te quedan ${gb(m.disco.libreGb)} GB libres.`;

  if (pct >= DISCO_APRETADO_PCT) {
    return {
      texto: `${base} Se está llenando; si querés, limpio los temporales.`,
      proponer: { accion: 'limpiar_temporales', motivo: `El disco está al ${pct}%.` },
    };
  }
  return { texto: pct >= 70 ? `${base} Todavía hay margen, pero vale la pena vigilarlo.` : `${base} Vas bien.` };
}

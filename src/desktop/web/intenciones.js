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

// "archivos pesados", "carpetas grandes", "qué ocupa más espacio", "archivos que ya no uso", "archivos viejos", "qué puedo borrar": quiere VER lo que pesa y no se usa.
const TEMA_PESADOS = /\b((archivos?|carpetas?|cosas)\s+(pesad\w*|grandes?|enormes?)|(pesad\w*|grandes?)\s+(archivos?|carpetas?)|qu[eé]\s+(archivos?|cosas)?\s*ocupa(n)?\s+(m[aá]s\s+)?(espacio|lugar)|(archivos?|cosas)\s+(que\s+)?(ya\s+)?no\s+uso|sin\s+usar|(archivos?|carpetas?|cosas)\s+(\w+\s+)?(viej\w*|antigu\w*|obsolet\w*)|(qu[eé]|cu[aá]les?)\s+(\w+\s+){0,4}(puedo|podr[ií]a|debo|conviene)\s+(borrar|eliminar))\b/i;

// Pedido claro de saber qué archivos viejos se pueden borrar: se acepta más largo que el resto porque el modelo
// no siempre propone la búsqueda, y si lo hace no ve los nombres. Sin "por qué/cómo": eso es explicación y va al modelo.
const MAX_PALABRAS_BORRAR = 20;
const QUIERE_BORRAR_VIEJOS = /(archivos?|carpetas?|cosas)\s+(\w+\s+)?(viej\w*|antigu\w*|obsolet\w*)|(qu[eé]|cu[aá]les?)\s+(\w+\s+){0,4}(puedo|podr[ií]a|debo|conviene)\s+(borrar|eliminar)/i;
const PIDE_EXPLICAR = /\b(por ?qu[eé]|c[oó]mo|explic\w*)\b/i;

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
  const pideVer = palabras(texto) <= MAX_PALABRAS && TEMA_PESADOS.test(texto);
  const pideBorrarViejos = palabras(texto) <= MAX_PALABRAS_BORRAR && QUIERE_BORRAR_VIEJOS.test(texto) && !PIDE_EXPLICAR.test(texto);
  if (pideVer || pideBorrarViejos) {
    // No hace falta la lectura del sistema: la búsqueda la hace la app, y solo después de que la persona apruebe.
    return {
      texto: '¡Puedo buscarlos! Miro los archivos y carpetas más pesados que no usás hace rato, y te marco cuáles suelen sobrar y cuáles conviene respaldar. Yo no borro nada: lo decidís vos.',
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
      texto: `${base} ¡Ay, se está llenando! Si querés, limpio los temporales.`,
      proponer: { accion: 'limpiar_temporales', motivo: `El disco está al ${pct}%.` },
    };
  }
  return { texto: pct >= 70 ? `${base} Todavía queda lugar, pero vale la pena vigilarlo.` : `${base} ¡Vas muy bien!` };
}

// ---------- Revisar un enlace: "¿es seguro paypa1-login.com/verify?" ----------
// Si la persona pregunta por la seguridad de UN enlace, lo revisa el backend (sin modelo, al instante). Lo demás va al modelo.
const PIDE_SEGURIDAD = /\b(segur[oa]s?|peligros[oa]s?|confiable|estafa|fraude|phishing|virus|malicios[oa]|leg[ií]tim[oa]|de fiar|trampa|falso|truco)\b/i;
const ALGO_COMO_ENLACE = /(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/i;
export const MAX_PALABRAS_ENLACE = 25;

/** @returns {string|null} el enlace a revisar, o null si el mensaje no pide eso */
export function enlaceParaRevisar(texto) {
  if (!texto || palabras(texto) > MAX_PALABRAS_ENLACE || !PIDE_SEGURIDAD.test(texto)) return null;
  const coincidencias = texto.match(new RegExp(ALGO_COMO_ENLACE.source, 'gi')) ?? [];
  // Si hay más de uno, que decida el modelo: no se adivina cuál quiso decir.
  if (coincidencias.length !== 1) return null;
  return coincidencias[0].replace(/[.,;:!?)\]"']+$/, '');
}

/** Texto para la burbuja a partir del resultado de `/enlaces/revisar`. Nunca dice "seguro": solo "no veo señales de peligro". */
export function resumenEnlace(r) {
  const motivos = (r.motivos ?? []).slice(0, 2).join(' ');
  const listas = r.listas?.estado;
  if (r.nivel === 'peligroso') {
    return `Cuidado, no entres a ese enlace. ${motivos} No pongas contraseñas ni datos ahí; y si ya lo hiciste, cambiá la contraseña cuanto antes.`;
  }
  if (r.nivel === 'dudoso') {
    const nota = listas === 'no_consultada' ? ' Solo miré la dirección, no la lista de sitios peligrosos de Google.' : '';
    return `Mmm, ese enlace me da desconfianza. ${motivos} Mejor no pongas datos ahí y entrá escribiendo vos la dirección oficial.${nota}`;
  }
  if (r.nivel === 'sin_senales') {
    const lista = listas === 'no_aparece' ? ' Google tampoco lo tiene en su lista de sitios peligrosos.' : listas === 'no_consultada' ? ' Solo miré la dirección, no la lista de sitios peligrosos de Google.' : '';
    return `No veo señales de peligro en la dirección de ${r.dominio}, pero ojo: no es una garantía.${lista} Antes de poner contraseñas, fijate que sea el sitio oficial.`;
  }
  return r.motivos?.[0] ?? 'No pude entender ese enlace. ¿Lo copiaste completo?';
}

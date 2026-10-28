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

// ---------- Las otras herramientas: pedidos cortos y claros que no necesitan al modelo ----------
// Es la misma idea que `src/backend/src/intenciones.js` (que cubre las frases largas de la conversación), pero acá solo
// mensajes cortos, para que funcionen al instante y sin llave. Se prueban sobre texto sin tildes ni mayúsculas.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const AJUSTES_NOMBRE = { almacenamiento: 'Almacenamiento', aplicaciones: 'Aplicaciones instaladas', inicio: 'Aplicaciones de inicio', actualizaciones: 'Windows Update', red: 'Red e internet', energia: 'Energía y batería' };
const DESTINOS = [
  ['almacenamiento', /\b(almacenamiento|storage|espacio\s+en\s+disco)\b/],
  ['aplicaciones', /\b(aplicaciones|programas)\s+instalad\w+|\bdesinstalar\b/],
  ['inicio', /\b(apps?|programas?|aplicaciones?)\s+de\s+inicio\b/],
  ['actualizaciones', /\bwindows\s+update\b|\bactualizaciones\b/],
  ['red', /\b(wifi|wi-fi|red|internet)\b/],
  ['energia', /\b(energia|bateria|suspension)\b/],
];
const PIDE_ABRIR = /\b(abr\w+|llev\w+|mostr\w+|ir\s+a|and\w+\s+a)\b.{0,30}\b(configuracion|ajustes?|settings)\b/;
const REGLAS_NUEVAS = [
  { accion: 'vaciar_papelera', patron: /\b(vaci\w+|limpi\w+|borr\w+|elimin\w+)\s+(la\s+|mi\s+)?(papelera|reciclaje)\b/, texto: 'Puedo vaciar la papelera, pero no se puede deshacer. Mirá la tarjeta y decidí vos.', motivo: 'Liberar el espacio que ocupa la papelera.' },
  { accion: 'ver_programas_inicio', patron: /\b(programas?|apps?|aplicaciones?)\s+de\s+(inicio|arranque)\b|\b(abre\w*|inicia\w*|arranca\w*|carga\w*)\s+(solos?\s+)?(al|cuando|con)\s+(inicia\w*|prende\w*|encender\w*|arranca\w*|windows)|\b(compu\w*|pc)\s+(tarda|demora)\s+(en\s+)?(prender|arrancar|iniciar|encender)/, texto: 'Dale, miro qué programas se abren solos al prender la compu.', motivo: 'Ver qué programas se abren solos al iniciar.' },
  { accion: 'ver_actualizaciones', patron: /\b(hay|tengo|faltan?|pendientes?|revis\w+|busc\w+)\b.{0,30}\bactualizaci\w+/, texto: 'Busco si Windows tiene actualizaciones pendientes. Solo miro, no instalo nada.', motivo: 'Ver si hay actualizaciones de Windows pendientes.' },
  { accion: 'ver_estado_red', patron: /\b(tengo|hay|funciona|anda|revis\w+|estado\s+de|como\s+esta)\b.{0,25}\b(internet|wifi|wi-fi|red|conexion)\b|\b(internet|wifi|wi-fi|conexion)\b.{0,20}\b(lent\w+|caid\w+|no\s+(funciona|anda|carga)|mal)\b/, texto: 'Reviso tu conexión con una prueba corta.', motivo: 'Revisar si hay internet y cómo está la conexión.' },
  { accion: 'ver_info_equipo', patron: /\b(que|cual(es)?)\s+(pc|compu\w*|computadora|laptop|equipo|modelo|procesador)\s+(es|tengo|uso)\b|\b(modelo|caracteristicas|especificaciones|datos|informacion)\s+(de\s+)?(mi|la|del)\s+(pc|compu\w*|computadora|laptop|equipo)\b|\bque\s+procesador\b/, texto: 'Dale, miro qué equipo tenés.', motivo: 'Ver el modelo y las características del equipo.' },
  { accion: 'ver_espacio_carpetas', patron: /\b(que|cual(es)?)\s+carpetas?\s+(ocupa\w*|pesa\w*)\b|\bespacio\s+(por|de\s+cada)\s+carpeta/, texto: 'Miro qué carpetas ocupan más espacio.', motivo: 'Ver qué carpetas ocupan más espacio.' },
];

// Contra los falsos positivos ("inicio de sesión", "actualizaciones de Office", "equipo de ventas", "red social"):
// si el texto coincide con la regla pero también con esto, que conteste el modelo. Igual que en el backend.
const EXCEPCIONES = {
  ver_programas_inicio: /\b(inicio|iniciar|inicia|arranque)\s+(de\s+)?sesion\b|\bsesion\b/,
  ver_actualizaciones: /\b(office|word|excel|powerpoint|chrome|firefox|android|iphone|ios|apps?|juegos?|antivirus|drivers?|controlador(es)?)\b/,
  ver_info_equipo: /\bequipo\s+de\b/,
  ver_estado_red: /\bred\s+(del|de\s+la|de\s+los|de\s+las|social|sociales|neuronal|electrica)\b/,
};

/** @returns {null | { texto: string, proponer: object }} */
export function accionLocalNueva(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS) return null;
  if (PIDE_ABRIR.test(t)) {
    const destino = DESTINOS.find(([, patron]) => patron.test(t))?.[0];
    if (destino) {
      return { texto: `Te abro "${AJUSTES_NOMBRE[destino]}" en los ajustes de Windows.`, proponer: { accion: 'abrir_ajuste', destino, motivo: `Abrir ${AJUSTES_NOMBRE[destino]} en Windows.` } };
    }
  }
  const regla = REGLAS_NUEVAS.find((r) => r.patron.test(t) && !EXCEPCIONES[r.accion]?.test(t));
  return regla ? { texto: regla.texto, proponer: { accion: regla.accion, motivo: regla.motivo } } : null;
}
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
  const nueva = accionLocalNueva(texto);
  if (nueva) return nueva;
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

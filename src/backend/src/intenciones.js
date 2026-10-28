// Pedidos que el harness reconoce por su cuenta, para no depender de que el modelo llame a la herramienta.
//
// Un modelo pequeño a veces contesta "te propongo revisar los archivos" sin llamar a `proponer_accion`. Para los pedidos
// claros eso deja a la persona sin tarjeta. Esto NO ejecuta nada: solo añade la misma propuesta que haría el modelo, y la
// persona sigue decidiendo en pantalla (regla 1). Es conservador: ante la duda, no propone nada y conversa el modelo.

const ARCHIVOS = String.raw`(archivos?|carpetas?|cosas|descargas|documentos)`;
const BS = String.fromCharCode(92);
const re = (partes) => new RegExp(partes.map((p) => `(?:${p})`).join('|'), 'i');

const PIDE_ARCHIVOS = re([
  String.raw`${ARCHIVOS}\s+(\w+\s+){0,2}(pesad\w*|grandes?|enormes?|viej\w*|antigu\w*|obsolet\w*)`,
  String.raw`(pesad\w*|grandes?|viej\w*)\s+(archivos?|carpetas?|cosas)`,
  String.raw`qu[eé]\s+(archivos?|cosas)?\s*ocupa(n)?\s+(m[aá]s\s+)?(espacio|lugar)`,
  String.raw`${ARCHIVOS}\s+(que\s+)?(ya\s+)?no\s+(uso|usa|utilizo)`,
  String.raw`sin\s+usar`,
  String.raw`(qu[eé]|cu[aá]les?)\s+(\w+\s+){0,4}(puedo|podr[ií]a|debo|conviene)\s+(borrar|eliminar)`,
]);
// "¿por qué mis archivos pesados crecen?" pide una explicación, no la lista; salvo que también pregunte qué puede borrar.
const PIDE_EXPLICAR = new RegExp(`${BS}b(por ?qu[eé]|c[oó]mo|explic${BS}w*)${BS}b`, 'i');
const PIDE_BORRAR = new RegExp(`${BS}b(borrar|eliminar|puedo|sobra${BS}w*)${BS}b`, 'i');

export const MAX_PALABRAS_INTENCION = 30;

/** Minúsculas y sin tildes: el \w de JavaScript no reconoce "á", y así "vaciá" o "batería" también coinciden. */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const palabras = (s) => s.split(/\s+/).filter(Boolean).length;

const PROPUESTAS = {
  ver_archivos_pesados: 'Ver qué archivos y carpetas pesados llevan tiempo sin usarse.',
  ver_info_equipo: 'Ver el modelo, el sistema y las características de tu equipo.',
  ver_programas_inicio: 'Ver qué programas se abren solos cuando prendés la compu.',
  ver_espacio_carpetas: 'Ver qué carpetas ocupan más espacio.',
  ver_estado_red: 'Revisar si tenés internet y cómo está la conexión.',
  ver_actualizaciones: 'Ver si hay actualizaciones de Windows pendientes (no las instala).',
  vaciar_papelera: 'Vaciar la papelera de reciclaje (no se puede deshacer).',
};

// Cada pedido, de lo más específico a lo más general. Se prueban sobre el texto ya normalizado (sin tildes).
const REGLAS = [
  { accion: 'vaciar_papelera', patron: /\b(vaci\w+|limpi\w+|borr\w+|elimin\w+)\s+(la\s+|mi\s+)?(papelera|reciclaje)\b/ },
  {
    accion: 'ver_programas_inicio',
    patron: /\b(programas?|apps?|aplicaciones?)\s+de\s+(inicio|arranque)\b|\b(abre\w*|inicia\w*|arranca\w*|carga\w*)\s+(solos?\s+)?(al|cuando|con)\s+(inicia\w*|prende\w*|encender\w*|arranca\w*|windows|la\s+(compu\w*|pc))|\b(compu\w*|pc)\s+(tarda|demora)\s+(en\s+)?(prender|arrancar|iniciar|encender)/,
  },
  { accion: 'ver_actualizaciones', patron: /\b(hay|tengo|faltan?|pendientes?|revis\w+|busc\w+)\b.{0,30}\bactualizaci\w+/ },
  {
    accion: 'ver_estado_red',
    patron: /\b(tengo|hay|funciona|anda|revis\w+|estado\s+de|como\s+esta)\b.{0,25}\b(internet|wifi|wi-fi|red|conexion)\b|\b(internet|wifi|wi-fi|conexion)\b.{0,20}\b(lent\w+|caid\w+|no\s+(funciona|anda|carga)|mal)\b/,
  },
  {
    accion: 'ver_info_equipo',
    patron: /\b(que|cual(es)?)\s+(pc|compu\w*|computadora|laptop|equipo|modelo|procesador)\s+(es|tengo|uso)\b|\b(modelo|caracteristicas|especificaciones|datos|informacion)\s+(de\s+)?(mi|la|del)\s+(pc|compu\w*|computadora|laptop|equipo)\b|\bque\s+procesador\b/,
  },
  { accion: 'ver_espacio_carpetas', patron: /\b(que|cual(es)?)\s+carpetas?\s+(ocupa\w*|pesa\w*)\b|\bespacio\s+(por|de\s+cada)\s+carpeta/ },
];

/** @returns {boolean} la persona quiere ver qué archivos o carpetas pesados/viejos hay (y quizá cuáles borrar) */
export function pideArchivosPesados(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS_INTENCION) return false;
  if (!PIDE_ARCHIVOS.test(t)) return false;
  return !PIDE_EXPLICAR.test(t) || PIDE_BORRAR.test(t);
}

/** Para "abrime almacenamiento", "llevame a las actualizaciones": un destino de la lista cerrada o null. */
const DESTINOS = [
  ['almacenamiento', /\b(almacenamiento|storage|espacio\s+en\s+disco)\b/],
  ['aplicaciones', /\b(aplicaciones|programas)\s+instalad\w+|\bdesinstalar\b/],
  ['inicio', /\b(apps?|programas?|aplicaciones?)\s+de\s+inicio\b/],
  ['actualizaciones', /\bwindows\s+update\b|\bactualizaciones\b/],
  ['red', /\b(wifi|wi-fi|red|internet)\b/],
  ['energia', /\b(energia|bateria|suspension)\b/],
];
const PIDE_ABRIR = /\b(abr\w+|llev\w+|mostr\w+|ir\s+a|and\w+\s+a)\b.{0,30}\b(configuracion|ajustes?|settings)\b/;

export function destinoDeAjuste(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS_INTENCION || !PIDE_ABRIR.test(t)) return null;
  return DESTINOS.find(([, patron]) => patron.test(t))?.[0] ?? null;
}

/**
 * La acción que pide el mensaje, o null si no es un pedido claro. Misma forma que devuelve `validarPropuesta`.
 * @returns {null | { tipo: 'proponer_accion', accion: string, motivo: string, destino?: string }}
 */
export function detectarAccion(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS_INTENCION) return null;
  const destino = destinoDeAjuste(t);
  if (destino) return { tipo: 'proponer_accion', accion: 'abrir_ajuste', destino, motivo: `Abrir la configuración de ${destino} en Windows.` };
  if (pideArchivosPesados(t)) return { tipo: 'proponer_accion', accion: 'ver_archivos_pesados', motivo: PROPUESTAS.ver_archivos_pesados };
  const regla = REGLAS.find((r) => r.patron.test(t));
  return regla ? { tipo: 'proponer_accion', accion: regla.accion, motivo: PROPUESTAS[regla.accion] } : null;
}

export const PROPUESTA_ARCHIVOS = Object.freeze({ tipo: 'proponer_accion', accion: 'ver_archivos_pesados', motivo: PROPUESTAS.ver_archivos_pesados });

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
const HABLA_PROGRAMAS = /\b(programas?|aplicaciones?|apps?)\b/;
const HABLA_ARCHIVOS = /\b(archivos?|carpetas?|cosas|fotos?|videos?|descargas|documentos?)\b/;

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
  ver_reporte_soporte: 'Armar un resumen de tu equipo para mandárselo al soporte técnico.',
  ver_dispositivos_red: 'Ver los dispositivos conectados en tu red local.',
  ver_arranque: 'Ver por qué tarda en prender: el último arranque de Windows y los programas que se abren solos.',
  ver_salud_disco: 'Revisar la salud de tus discos (solo lectura, sin probarlos ni repararlos).',
  ver_puntos_restauracion: 'Ver si hay puntos de restauración a los que volver (solo lectura; no crea ni borra ninguno).',
  ver_duplicados_posibles: 'Buscar archivos que parecen repetidos (mismo nombre y tamaño), sin borrar nada.',
  ver_programas_sin_uso: 'Listar los programas instalados y cuándo se instalaron (no desinstala nada).',
  ver_consumo_bateria: 'Ver qué programas gastan más CPU (aproximado) y cómo está la batería.',
  vaciar_papelera: 'Vaciar la papelera de reciclaje (no se puede deshacer).',
};

// Cada pedido, de lo más específico a lo más general. Se prueban sobre el texto ya normalizado (sin tildes).
const REGLAS = [
  { accion: 'vaciar_papelera', patron: /\b(vaci\w+|limpi\w+|borr\w+|elimin\w+)\s+((el|la|mi|los|las)\s+)?(papelera|reciclaje)\b/ },
  {
    accion: 'ver_programas_inicio',
    patron: /\b(programas?|apps?|aplicaciones?)\s+de\s+(inicio|arranque)\b|\b(abre\w*|inicia\w*|arranca\w*|carga\w*)\s+(solos?\s+)?(al|cuando|con)\s+(inicia\w*|prende\w*|encender\w*|arranca\w*|windows|la\s+(compu\w*|pc))|\b(compu\w*|pc)\s+(tarda|demora)\s+(en\s+)?(prender|arrancar|iniciar|encender)/,
  },
  { accion: 'ver_arranque', patron: /\bpor\s+que\b.{0,25}\b(tarda|demora)\w*\b.{0,15}\b(prender|arrancar|encender)\b|\b(cuanto|tarda|demora)\w*\s+(en\s+)?(prender|arrancar|encender)\b/ },
  { accion: 'ver_actualizaciones', patron: /\b(hay|tengo|faltan?|pendientes?|revis\w+|busc\w+)\b.{0,30}\bactualizaci\w+/ },
  {
    accion: 'ver_dispositivos_red',
    patron: /\b(dispositivos?|aparatos?|equipos?)\b.{0,30}\b(conectad\w*|estan)\b.{0,15}\b(red|wifi|wi-fi)\b|\b(quien|quienes)\b.{0,25}\b(conectad\w*|esta|estan)\b.{0,15}\b(red|wifi|wi-fi)\b|\bescan\w+\s+(la\s+)?(red|wifi|wi-fi)\b|\b(hay|que|cuales)\b.{0,20}\b(dispositivos?|aparatos?|equipos?)\b.{0,20}\b(red|wifi|wi-fi)\b|\b(dispositivos?|aparatos?|equipos?)\s+(conectados?\s+)?(en\s+)?(la\s+)?red\b|\b(alguien|gente|personas?|algun\w*)\b.{0,20}\b(conectad\w*|usando|usan)\b.{0,15}\b(red|wifi|wi-fi)\b/,
  },
  {
    accion: 'ver_estado_red',
    patron: /\b(tengo|hay|funciona|anda|revis\w+|estado\s+de|como\s+esta)\b.{0,25}\b(internet|wifi|wi-fi|red|conexion)\b|\b(internet|wifi|wi-fi|conexion)\b.{0,20}\b(lent\w+|caid\w+|no\s+(funciona|anda|carga)|mal)\b/,
  },
  {
    accion: 'ver_dispositivos_red',
    patron: /\b(cual(es)?\s+)?(es\s+)?(mi|la)\s+ip\b|\bmi\s+direccion\s+ip\b|\bip\s+(local|publica|privada)?\b/,
  },
  {
    accion: 'ver_info_equipo',
    patron: /\b(que|cual(es)?)\s+(pc|compu\w*|computadora|laptop|equipo|modelo|procesador)\s+(es|tengo|uso)\b|\b(que|cual(es)?)\s+(modelo|marca)\s+de\s+(mi\s+|la\s+)?(pc|compu\w*|computadora|laptop|equipo)\s+(teng\w*|tenia|es|uso)\b|\b(que|cual(es)?)\s+(tipo|clase)\s+de\s+(mi\s+|la\s+)?(pc|compu\w*|computadora|laptop|equipo)\s+(teng\w*|tenia|es|uso)\b|\b(modelo|caracteristicas|especificaciones|datos|informacion)\s+(de\s+)?(mi|la|del)\s+(pc|compu\w*|computadora|laptop|equipo)\b|\bque\s+procesador\b/,
  },
  { accion: 'ver_reporte_soporte', patron: /\b(reporte|informe|resumen|ficha)\b.{0,30}\b(soporte|tecnico|ti|informatica|sistemas|help\s*desk)\b|\b(soporte|tecnico)\b.{0,30}\b(reporte|informe|resumen)\b|\bpara\s+(el\s+)?(soporte|tecnico)\b.{0,20}\b(datos|informacion|reporte|resumen)/ },
  { accion: 'ver_salud_disco', patron: /\bcomo\s+esta\s+(el\s+|mi\s+|tu\s+)?(disco|ssd|hdd)\b(?!\s+(lleno|llena|casi))|\b(salud|estado)\s+(del\s+|de\s+(mi|el|tu|los)\s+)?(disco|discos|ssd|hdd)\b|\b(disco|ssd|hdd)\s+(esta\s+)?(fallando|muriendo|bien|mal)\b/ },
  { accion: 'ver_puntos_restauracion', patron: /\b(volver|regresar|retroceder)\s+(atras|para\s+atras)\b|\bpuntos?\s+de\s+restauracion\b|\brestaur\w*\s+(el\s+|mi\s+)?(sistema|windows|pc|compu\w*|computadora)\b/ },
  { accion: 'ver_duplicados_posibles', patron: /\b(archivos?|fotos?|documentos?|videos?|copias?|cosas)\s+(duplicad\w*|repetid\w*)\b|\b(duplicad\w*|repetid\w*)\s+(archivos?|fotos?|documentos?|videos?|copias?)\b|\bbusc\w*\s+(duplicad\w*|repetid\w*)\b/ },
  { accion: 'ver_programas_sin_uso', patron: /\b(programas?|aplicaciones?|apps?)\s+(que\s+)?(no\s+uso|sin\s+usar|ya\s+no\s+uso|viejos?|que\s+nunca\s+uso)\b|\b(que|cuales)\s+(programas?|aplicaciones?|apps?)\s+((\w+\s+){0,2})?(no\s+uso|sin\s+usar|puedo\s+(borrar|desinstalar|eliminar|quitar)|tengo\s+instalad\w*|hay\s+instalad\w*)\b/ },
  { accion: 'ver_consumo_bateria', patron: /\b(que|cual(es)?|quien(es)?)\s+(\w+\s+){0,2}(consum\w*|gast\w*|come[ns]?)\s+(mucha\s+|la\s+|tanta\s+)?bateria\b|\b(acaba|agota|gasta)\w*\s+(muy\s+|tan\s+|rapido\s+|mucha\s+)?(la\s+)?bateria\b|\bbateria\s+(me\s+)?dura\s+poco\b|\bme\s+dura\s+poco\b/ },
  { accion: 'ver_espacio_carpetas', patron: /\b(que|cual(es)?)\s+carpetas?\s+(ocupa\w*|pesa\w*)\b|\bespacio\s+(por|de\s+cada)\s+carpeta/ },
];

// Contra los falsos positivos: si el texto coincide con la regla pero también con esto, no se propone nada.
const EXCEPCIONES = {
  ver_programas_inicio: /\b(inicio|iniciar|inicia|arranque)\s+(de\s+)?sesion\b|\bsesion\b/,
  ver_actualizaciones: /\b(office|word|excel|powerpoint|chrome|firefox|android|iphone|ios|apps?|juegos?|antivirus|drivers?|controlador(es)?)\b/,
  ver_info_equipo: /\bequipo\s+de\b/,
  ver_reporte_soporte: /\b(como|por que|explic\w*|que contiene|debe llevar)\b/,
  ver_puntos_restauracion: /\b(como|por que|explic\w*|que es)\b/,
  ver_programas_sin_uso: /\b(como|por que|explic\w*|que es)\b/,
  ver_consumo_bateria: /\b(como|por que|explic\w*|que es)\b/,
  ver_programas_sin_uso: /\b(como|por que|explic\w*|que es)\b/,
  ver_duplicados_posibles: /\b(como|por que|explic\w*|que es)\b/,
  ver_estado_red: /\bred\s+(del|de\s+la|de\s+los|de\s+las|social|sociales|neuronal|electrica)\b/,
  ver_dispositivos_red: /\bred\s+(del|de\s+la|de\s+los|de\s+las|social|sociales|neuronal|electrica)\b/,
};

/** @returns {boolean} la persona quiere ver qué archivos o carpetas pesados/viejos hay (y quizá cuáles borrar) */
export function pideArchivosPesados(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS_INTENCION) return false;
  // "programas sin usar" habla de programas: eso lo atiende ver_programas_sin_uso, no la lista de archivos.
  if (HABLA_PROGRAMAS.test(t) && !HABLA_ARCHIVOS.test(t)) return false;
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

// Como en la app: "abre el almacenamiento" sin decir "configuración". Red y wifi quedan fuera a propósito.
const PIDE_ABRIR_CORTO = /^(?:abr\w+|llev\w+|mostr\w+)\s+(?:me\s+|te\s+)?(?:a\s+)?(?:el\s+|la\s+|los\s+|las\s+)?(almacenamiento|actualizaciones|windows update|aplicaciones instaladas|energia|bateria)\b/;
const DESTINO_CORTO = { almacenamiento: 'almacenamiento', actualizaciones: 'actualizaciones', 'windows update': 'actualizaciones', 'aplicaciones instaladas': 'aplicaciones', energia: 'energia', bateria: 'energia' };

export function destinoDeAjuste(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS_INTENCION) return null;
  const corto = t.match(PIDE_ABRIR_CORTO);
  if (corto) return DESTINO_CORTO[corto[1]];
  if (!PIDE_ABRIR.test(t)) return null;
  return DESTINOS.find(([, patron]) => patron.test(t))?.[0] ?? null;
}

// "no quiero vaciar la papelera", "no vacíes nada", "mejor no": la persona dice que NO. Nunca se propone nada.
// Ojo: "archivos que ya no uso" o "no tengo internet" sí son pedidos, por eso solo cuentan los "no" delante de un verbo de pedido.
export const NEGACION = /\b(no|nunca|jamas|ni)\s+(me\s+|la\s+|lo\s+|los\s+|las\s+)?(quier\w*|quisier\w*|necesit\w*|hace\s+falta|es\s+necesario|vaci\w*|borr\w*|elimin\w*|limpi\w*|abr\w*|toqu\w*|cierr\w*|cerr\w*|mostr\w*|muestr\w*|busqu\w*|busc\w*|revis\w*)\b|\bmejor\s+no\b/;

/** @returns {boolean} el mensaje rechaza o prohíbe una acción ("no quiero vaciar la papelera") */
export function esNegacion(texto) {
  return NEGACION.test(norm(texto));
}

/**
 * La acción que pide el mensaje, o null si no es un pedido claro. Misma forma que devuelve `validarPropuesta`.
 * @returns {null | { tipo: 'proponer_accion', accion: string, motivo: string, destino?: string }}
 */
export function detectarAccion(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS_INTENCION) return null;
  if (NEGACION.test(t)) return null;
  const destino = destinoDeAjuste(t);
  if (destino) return { tipo: 'proponer_accion', accion: 'abrir_ajuste', destino, motivo: `Abrir la configuración de ${destino} en Windows.` };
  if (pideArchivosPesados(t)) return { tipo: 'proponer_accion', accion: 'ver_archivos_pesados', motivo: PROPUESTAS.ver_archivos_pesados };
  const regla = REGLAS.find((r) => r.patron.test(t) && !EXCEPCIONES[r.accion]?.test(t));
  return regla ? { tipo: 'proponer_accion', accion: regla.accion, motivo: PROPUESTAS[regla.accion] } : null;
}

export const PROPUESTA_ARCHIVOS = Object.freeze({ tipo: 'proponer_accion', accion: 'ver_archivos_pesados', motivo: PROPUESTAS.ver_archivos_pesados });

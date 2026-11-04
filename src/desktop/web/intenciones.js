// Enrutamiento y respuestas locales conservadoras. Lógica pura (sin DOM).
//
// Los datos medidos y pedidos breves, explícitos y deterministas se resuelven
// aquí. Las preguntas abiertas, explicaciones y consejos siguen yendo al modelo.

export const MAX_PALABRAS = 8;

// ---------- Errores que se muestran a la persona ----------
export const MENSAJE_TARDO = 'Kerni tardó demasiado en responder. Probá de nuevo con algo más corto.';

/** Un plazo vencido (AbortController o AbortSignal.timeout) llega como AbortError o TimeoutError. */
export function esTiempoAgotado(err) {
  return err?.name === 'AbortError' || err?.name === 'TimeoutError';
}

/** Texto para la burbuja: el plazo en español, y cualquier otro error con su mensaje (nunca el texto crudo del navegador). */
export function textoDeError(err) {
  return esTiempoAgotado(err) ? MENSAJE_TARDO : String(err?.message ?? err);
}
const MAX_PALABRAS_ACCION_LOCAL = 12;
const MAX_PALABRAS_DATOS = 6;
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
// Igual que el backend: "por qué ... pesados" es explicación, salvo que también pregunte qué puede borrar.
const PIDE_BORRAR = /\b(borrar|eliminar|puedo|sobra\w*)\b/i;

const HABLA_PROGRAMAS = /\b(programas?|aplicaciones?|apps?)\b/;
const HABLA_ARCHIVOS = /\b(archivos?|carpetas?|cosas|fotos?|videos?|descargas|documentos?)\b/;
const palabras = (t) => t.trim().split(/\s+/).filter(Boolean).length;

// ---------- Las otras herramientas: pedidos cortos y claros que no necesitan al modelo ----------
// Es la misma idea que `src/backend/src/intenciones.js` (que cubre las frases largas de la conversación), pero acá solo
// mensajes cortos, para que funcionen al instante y sin llave. Se prueban sobre texto sin tildes ni mayúsculas.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const AJUSTES_NOMBRE = { almacenamiento: 'Almacenamiento', aplicaciones: 'Aplicaciones instaladas', inicio: 'Aplicaciones de inicio', actualizaciones: 'Windows Update', red: 'Red e internet', energia: 'Energía y batería', recuperacion: 'Recuperación de Windows' };
const DESTINOS = [
  ['almacenamiento', /\b(almacenamiento|storage|espacio\s+en\s+disco)\b/],
  ['aplicaciones', /\b(aplicaciones|programas)\s+instalad\w+|\bdesinstalar\b/],
  ['inicio', /\b(apps?|programas?|aplicaciones?)\s+de\s+inicio\b/],
  ['actualizaciones', /\bwindows\s+update\b|\bactualizaciones\b/],
  ['red', /\b(wifi|wi-fi|red|internet)\b/],
  ['energia', /\b(energia|bateria|suspension)\b/],
  ['recuperacion', /\b(recuperacion|restaurar\s+sistema|restauracion)\b/],
];
const PIDE_ABRIR = /\b(abr\w+|llev\w+|mostr\w+|ir\s+a|and\w+\s+a)\b.{0,30}\b(configuracion|ajustes?|settings)\b/;
// "abre el almacenamiento", "abrime actualizaciones": verbo de abrir + destino concreto, sin decir "configuración".
// Va antes que el disco (TEMA_DISCO también atrapa "almacenamiento"). Red y wifi quedan fuera: "red social" es otra cosa.
const PIDE_ABRIR_CORTO = /^(?:abr\w+|llev\w+|mostr\w+)\s+(?:me\s+|te\s+)?(?:a\s+)?(?:el\s+|la\s+|los\s+|las\s+)?(almacenamiento|actualizaciones|windows update|aplicaciones instaladas|energia|bateria|recuperacion|restaurar sistema)\b/;
const DESTINO_CORTO = { almacenamiento: 'almacenamiento', actualizaciones: 'actualizaciones', 'windows update': 'actualizaciones', 'aplicaciones instaladas': 'aplicaciones', energia: 'energia', bateria: 'energia', recuperacion: 'recuperacion', 'restaurar sistema': 'recuperacion' };
const REGLAS_NUEVAS = [
  { accion: 'vaciar_papelera', patron: /\b(vaci\w+|limpi\w+|borr\w+|elimin\w+)\s+((el|la|mi|los|las)\s+)?(papelera|reciclaje)\b/, texto: 'Puedo vaciar la papelera, pero no se puede deshacer. Mirá la tarjeta y decidí vos.', motivo: 'Liberar el espacio que ocupa la papelera.' },
  { accion: 'ver_programas_inicio', patron: /\b(programas?|apps?|aplicaciones?)\s+de\s+(inicio|arranque)\b|\b(abre\w*|inicia\w*|arranca\w*|carga\w*)\s+(solos?\s+)?(al|cuando|con)\s+(inicia\w*|prende\w*|encender\w*|arranca\w*|windows)|\b(compu\w*|pc)\s+(tarda|demora)\s+(en\s+)?(prender|arrancar|iniciar|encender)/, texto: 'Dale, miro qué programas se abren solos al prender la compu.', motivo: 'Ver qué programas se abren solos al iniciar.' },
  { accion: 'ver_arranque', patron: /\bpor\s+que\b.{0,25}\b(tarda|demora)\w*\b.{0,15}\b(prender|arrancar|encender)\b|\b(cuanto|tarda|demora)\w*\s+(en\s+)?(prender|arrancar|encender)\b/, texto: 'Miro el último arranque de tu PC y cuántos programas se abren solos.', motivo: 'Ver por qué tarda en prender.' },
  { accion: 'ver_actualizaciones', patron: /\b(hay|tengo|faltan?|pendientes?|revis\w+|busc\w+)\b.{0,30}\bactualizaci\w+/, texto: 'Busco si Windows tiene actualizaciones pendientes. Solo miro, no instalo nada.', motivo: 'Ver si hay actualizaciones de Windows pendientes.' },
  { accion: 'ver_dispositivos_red', patron: /\b(dispositivos?|aparatos?|equipos?)\b.{0,20}\b(conectad\w*|estan\s+conectad\w*)\b.{0,10}\b(red|wifi|wi-fi)\b|\b(quien|quienes)\b.{0,15}\b(conectad\w*|esta|estan)\b.{0,10}\b(red|wifi|wi-fi)\b|\b(escan\w+)\s+(la\s+)?(red|wifi|wi-fi)\b|\b(hay|que|cuales)\b.{0,15}\b(dispositivos?|aparatos?|equipos?)\b.{0,15}\b(red|wifi|wi-fi)\b|\b(dispositivos?|aparatos?|equipos?)\s+(conectados?\s+)?(en\s+)?(la\s+)?red\b|\b(alguien|gente|personas?|algun\w*)\b.{0,20}\b(conectad\w*|usando|usan)\b.{0,15}\b(red|wifi|wi-fi)\b/, texto: 'Busco los dispositivos conectados en tu red local.', motivo: 'Ver los dispositivos conectados en la red local.' },
  { accion: 'ver_estado_red', patron: /\b(tengo|hay|funciona|anda|revis\w+|estado\s+de|como\s+esta)\b.{0,25}\b(internet|wifi|wi-fi|red|conexion)\b|\b(internet|wifi|wi-fi|conexion)\b.{0,20}\b(lent\w+|caid\w+|no\s+(funciona|anda|carga)|mal)\b/, texto: 'Reviso tu conexión con una prueba corta.', motivo: 'Revisar si hay internet y cómo está la conexión.' },
  { accion: 'ver_dispositivos_red', patron: /\b(cual(es)?\s+)?(es\s+)?(mi|la)\s+ip\b|\bmi\s+direccion\s+ip\b|\bip\s+(local|publica|privada)?\b/, texto: 'Busco tu IP en la red local.', motivo: 'Ver tu IP local en la red.' },
  { accion: 'ver_info_equipo', patron: /\b(que|cual(es)?)\s+(pc|compu\w*|computadora|laptop|equipo|modelo|procesador)\s+(es|tengo|uso)\b|\b(que|cual(es)?)\s+(modelo|marca)\s+de\s+(mi\s+|la\s+)?(pc|compu\w*|computadora|laptop|equipo)\s+(teng\w*|tenia|es|uso)\b|\b(que|cual(es)?)\s+(tipo|clase)\s+de\s+(mi\s+|la\s+)?(pc|compu\w*|computadora|laptop|equipo)\s+(teng\w*|tenia|es|uso)\b|\b(modelo|caracteristicas|especificaciones|datos|informacion)\s+(de\s+)?(mi|la|del)\s+(pc|compu\w*|computadora|laptop|equipo)\b|\bque\s+procesador\b/, texto: 'Dale, miro qué equipo tenés.', motivo: 'Ver el modelo y las características del equipo.' },
  { accion: 'ver_reporte_soporte', patron: /\b(haz|hace|arm|prepar|gener|cre|sac|dame|quiero|necesito)\w*\b.{0,30}\b(reporte|informe|resumen|ficha)\b.{0,30}\b(soporte|tecnic\w*|equipo|pc|computadora|compu\w*|laptop)\b|\b(reporte|informe|resumen|ficha)\s+(de|del|para)\s+(el\s+)?(mi\s+)?(equipo|pc|computadora|compu\w*|laptop|soporte|tecnic\w*|ti|informatica|sistemas)\b|\b(soporte|tecnic\w*)\b.{0,30}\b(reporte|informe|resumen)\b|\bpara\s+(el\s+)?(soporte|tecnico)\b.{0,20}\b(datos|informacion|reporte|resumen)/, texto: 'Dale, armo un resumen de tu equipo para el soporte técnico.', motivo: 'Armar un resumen del equipo para mandarlo a soporte técnico.' },
  { accion: 'ver_salud_disco', patron: /\bcomo\s+esta\s+(el\s+|mi\s+|tu\s+)?(disco|ssd|hdd)\b(?!\s+(lleno|llena|casi))|\b(salud|estado)\s+(del\s+|de\s+(mi|el|tu|los)\s+)?(disco|discos|ssd|hdd)\b|\b(disco|ssd|hdd)\s+(esta\s+)?(fallando|muriendo|bien|mal)\b/, texto: 'Reviso la salud de tus discos. Solo miro: no pruebo, no reparo y no borro nada.', motivo: 'Ver si los discos muestran alertas.' },
  { accion: 'ver_puntos_restauracion', patron: /\b(volver|regresar|retroceder)\s+(atras|para\s+atras)\b|\bpuntos?\s+de\s+restauracion\b|\brestaur\w*\s+(el\s+|mi\s+)?(sistema|windows|pc|compu\w*|computadora)\b/, texto: 'Miro si hay puntos de restauración a los que volver. Solo los listo: no creo ni borro ninguno.', motivo: 'Ver los puntos de restauración que existen.' },
  { accion: 'ver_duplicados_posibles', patron: /\b(archivos?|fotos?|documentos?|videos?|copias?|cosas)\s+(duplicad\w*|repetid\w*)\b|\b(duplicad\w*|repetid\w*)\s+(archivos?|fotos?|documentos?|videos?|copias?)\b|\bbusc\w*\s+(duplicad\w*|repetid\w*)\b/, texto: 'Busco archivos que parecen repetidos. Comparo solo nombre y tamaño; no abro ni borro nada.', motivo: 'Ver posibles archivos repetidos en tus carpetas personales.' },
  { accion: 'ver_programas_sin_uso', patron: /\b(programas?|aplicaciones?|apps?)\s+(que\s+)?(no\s+uso|sin\s+usar|ya\s+no\s+uso|viejos?|que\s+nunca\s+uso)\b|\b(que|cuales)\s+(programas?|aplicaciones?|apps?)\s+((\w+\s+){0,2})?(no\s+uso|sin\s+usar|puedo\s+(borrar|desinstalar|eliminar|quitar)|tengo\s+instalad\w*|hay\s+instalad\w*)\b/, texto: 'Miro qué programas tenés instalados y cuándo se instalaron. Solo listo: no desinstalo nada.', motivo: 'Ver los programas instalados y su fecha de instalación.' },
  { accion: 'ver_consumo_bateria', patron: /\b(que|cual(es)?|quien(es)?)\s+(\w+\s+){0,2}(consum\w*|gast\w*|come[ns]?)\s+(mucha\s+|la\s+|tanta\s+)?bateria\b|\b(acaba|agota|gasta)\w*\s+(muy\s+|tan\s+|rapido\s+|mucha\s+)?(la\s+)?bateria\b|\bbateria\s+(me\s+)?dura\s+poco\b|\bme\s+dura\s+poco\b/, texto: 'Miro qué programas gastan más CPU, aproximadamente. Solo miro: no cierro nada.', motivo: 'Ver qué programas consumen más batería (aproximado).' },
  { accion: 'ver_espacio_carpetas', patron: /\b(que|cual(es)?)\s+carpetas?\s+(ocupa\w*|pesa\w*)\b|\bespacio\s+(por|de\s+cada)\s+carpeta/, texto: 'Miro qué carpetas ocupan más espacio.', motivo: 'Ver qué carpetas ocupan más espacio.' },
];

// ---------- Acciones que necesitan datos medidos del sistema ----------
const PIDE_RAM       = /^(cuanta ram uso|cuanta ram estoy usando|como esta la ram|como esta la memoria)$/;
const PIDE_CPU       = /^(cuanta cpu uso|cuanta cpu estoy usando|cpu actual|como esta la cpu)$/;
const PIDE_TOP_MEM   = /^que (programa|proceso|app) (consume|usa|ocupa) mas (ram|memoria)$/;
const PIDE_TOP_CPU   = /^que (programa|proceso|app) (consume|usa|ocupa) mas cpu$/;
const PIDE_BATERIA   = /^(como esta la bateria|cuanta bateria tengo|cuanta bateria me queda|cual es la bateria)$/;

// ---------- Respuestas de texto fijo ----------
const PIDE_SALUDO    = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey)$/;
const PIDE_GRACIAS   = /^(gracias|muchas gracias|mil gracias|te agradezco)$/;
const PIDE_QUE_PUES  = /^que puedes hacer$/;
const PIDE_HORA      = /^(que hora es|que hora son|hora actual|hora en el salvador)$/;

// Contra los falsos positivos ("inicio de sesión", "actualizaciones de Office", "equipo de ventas", "red social"):
// si el texto coincide con la regla pero también con esto, que conteste el modelo. Igual que en el backend.
const EXCEPCIONES = {
  ver_programas_inicio: /\b(inicio|iniciar|inicia|arranque)\s+(de\s+)?sesion\b|\bsesion\b/,
  ver_actualizaciones: /\b(office|word|excel|powerpoint|chrome|firefox|android|iphone|ios|apps?|juegos?|antivirus|drivers?|controlador(es)?)\b/,
  ver_info_equipo: /\bequipo\s+de\b/,
  ver_reporte_soporte: /\b(como|por que|explic\w*|que contiene|debe llevar)\b/,
  ver_puntos_restauracion: /\b(como|por que|explic\w*|que es)\b/,
  ver_programas_sin_uso: /\b(como|por que|explic\w*|que es)\b/,
  ver_consumo_bateria: /\b(como|por que|explic\w*|que es)\b/,
  ver_duplicados_posibles: /\b(como|por que|explic\w*|que es)\b/,
  ver_estado_red: /\bred\s+(del|de\s+la|de\s+los|de\s+las|social|sociales|neuronal|electrica)\b/,
  ver_dispositivos_red: /\bred\s+(del|de\s+la|de\s+los|de\s+las|social|sociales|neuronal|electrica)\b/,
};

// "no quiero vaciar la papelera", "no me abras nada", "mejor no": la persona dice que NO; que conteste el modelo.
// "archivos que ya no uso" o "no tengo internet" sí son pedidos: solo cuenta el "no" delante de un verbo de pedido. Igual que en el backend.
const NEGACION = /\b(no|nunca|jamas|ni)\s+(me\s+|la\s+|lo\s+|los\s+|las\s+)?(quier\w*|quisier\w*|necesit\w*|hace\s+falta|es\s+necesario|vaci\w*|borr\w*|elimin\w*|limpi\w*|abr\w*|toqu\w*|cierr\w*|cerr\w*|mostr\w*|muestr\w*|busqu\w*|busc\w*|revis\w*)\b|\bmejor\s+no\b/;

/** @returns {boolean} el mensaje rechaza o prohíbe una acción */
export function esNegacion(texto) {
  return NEGACION.test(norm(texto));
}

/** @returns {null | { texto: string, proponer: object }} */
export function accionLocalNueva(texto) {
  const t = norm(texto);
  if (!t || palabras(t) > MAX_PALABRAS_ACCION_LOCAL) return null;
  if (NEGACION.test(t)) return null;
  const corto = t.match(PIDE_ABRIR_CORTO);
  if (corto) {
    const destino = DESTINO_CORTO[corto[1]];
    return { texto: `Te abro "${AJUSTES_NOMBRE[destino]}" en los ajustes de Windows.`, proponer: { accion: 'abrir_ajuste', destino, motivo: `Abrir ${AJUSTES_NOMBRE[destino]} en Windows.` } };
  }
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

// ---------- Diagnóstico: "mi compu va lenta" ----------
// Sin modelo y sin tokens: mira la foto del momento y dice cuál de los tres (procesador, memoria, disco) frena más.
const HABLA_EQUIPO_LENTO = /\b(compu|compus|pc|computadora|computador|laptop|equipo|maquina|windows)\b/;
const DICE_LENTO = /\b(lent[oa]s?|tarda\w*|demor\w*|anda mal|va mal)\b/;
// "Tarda en prender" es el arranque (ver_arranque), no la lentitud de ahora.
const NO_ES_DIAGNOSTICO = /\b(prender|encender|arranc\w*|inici\w*|apag\w*|reinici\w*|bateria|cargar)\b/;
const UMBRAL_CPU_DIAG = 80;
const UMBRAL_RAM_DIAG = 85;
/** Con este número de programas de inicio activos, sin cuello de botella claro, el diagnóstico ofrece verlos. */
export const UMBRAL_INICIO_ACTIVOS = 15;

/** @param {string} t texto ya normalizado (sin tildes, en minúsculas) */
export function pideDiagnostico(t) {
  return palabras(t) <= 10 && HABLA_EQUIPO_LENTO.test(t) && DICE_LENTO.test(t) && !NO_ES_DIAGNOSTICO.test(t);
}

// Un nombre de proceso viene del sistema: se limpia antes de decirlo (sin control, sin < >, corto).
const nombreSeguro = (n) => String(n ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * El recurso que más frena, comparado contra su umbral (el mayor cociente gana). Con un cuello claro propone UNA
 * acción existente: ver_programas_inicio (memoria, o sin cuello y con muchos programas al iniciar) o limpiar_temporales
 * (disco casi lleno). Con el procesador al tope no propone nada. Nunca cierra nada.
 * @returns {{ texto: string, proponer?: object }}
 */
export function diagnosticoLento(m) {
  const cpu = Number(m.cpu) || 0;
  const ram = (m.ram.usadaMb / m.ram.totalMb) * 100;
  const disco = porcentajeDisco(m);
  const razones = [
    { recurso: 'disco', ratio: disco / DISCO_APRETADO_PCT },
    { recurso: 'memoria', ratio: ram / UMBRAL_RAM_DIAG },
    { recurso: 'procesador', ratio: cpu / UMBRAL_CPU_DIAG },
  ];
  const cuello = razones.reduce((mayor, r) => (r.ratio > mayor.ratio ? r : mayor));
  const resumen = `Ahora: procesador ${Math.round(cpu)} %, memoria ${Math.round(ram)} %, disco ${disco} % lleno.`;
  const procesos = m.procesos ?? [];

  if (cuello.ratio < 1) {
    const inicio = m.inicioActivos;
    if (Number.isInteger(inicio) && inicio >= UMBRAL_INICIO_ACTIVOS) {
      return {
        texto: `${resumen} Ninguno está al tope, pero tenés ${inicio} programas que se abren al iniciar. Eso suele frenar el arranque y la marcha; los miro si querés y vos decidís qué desactivar.`,
        proponer: { accion: 'ver_programas_inicio', motivo: `Hay ${inicio} programas activos al iniciar Windows.` },
      };
    }
    return { texto: `${resumen} Ninguno está al tope, así que no veo un culpable claro en este momento. Si sigue lenta, reiniciarla suele ayudar.` };
  }
  if (cuello.recurso === 'disco') {
    return {
      texto: `${resumen} Lo que más la frena es el disco: está casi lleno. Si querés, borro los temporales de más de 24 horas, con tu visto bueno.`,
      proponer: { accion: 'limpiar_temporales', motivo: `El disco está al ${disco} %.` },
    };
  }
  if (cuello.recurso === 'memoria') {
    const top = [...procesos].sort((a, b) => b.memoriaMb - a.memoriaMb)[0];
    const quien = top ? `: ${nombreSeguro(top.nombre)} usa ${Math.round(top.memoriaMb)} MB` : '';
    return {
      texto: `${resumen} Lo que más la frena es la memoria${quien}. Los programas que se abren al iniciar suelen gastarla; los miro si querés.`,
      proponer: { accion: 'ver_programas_inicio', motivo: 'Los programas que arrancan con Windows suelen gastar memoria.' },
    };
  }
  const top = [...procesos].sort((a, b) => b.cpu - a.cpu)[0];
  const quien = top ? `: ${nombreSeguro(top.nombre)} usa ${Math.round(top.cpu)} %` : '';
  return {
    texto: `${resumen} Lo que más la frena es el procesador${quien}. Podés revisarlo en el Administrador de tareas y decidir vos qué hacer con él.`,
  };
}

/**
 * @param {string} texto lo que escribió la persona
 * @param {object|null} m última lectura de `metricas`
 * @returns {null | { texto: string, proponer?: object }} null = que conteste el modelo
 */
export function responderLocal(texto, m) {
  if (!texto || esNegacion(texto)) return null;
  const t = norm(texto).replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const w = palabras(t);
  // Sobre el texto sin tildes: en JavaScript "qué" no tiene \b después de la "é", así que "por qué" no coincidiría.
  // "programas sin usar" no es un pedido de archivos.
  const soloProgramas = HABLA_PROGRAMAS.test(t) && !HABLA_ARCHIVOS.test(t);
  const pideVer = palabras(texto) <= MAX_PALABRAS && TEMA_PESADOS.test(texto) && (!PIDE_EXPLICAR.test(t) || PIDE_BORRAR.test(t));
  const pideBorrarViejos = palabras(texto) <= MAX_PALABRAS_BORRAR && QUIERE_BORRAR_VIEJOS.test(texto) && !PIDE_EXPLICAR.test(t);
  if ((pideVer || pideBorrarViejos) && !soloProgramas) {
    // No hace falta la lectura del sistema: la búsqueda la hace la app, y solo después de que la persona apruebe.
    return {
      texto: '¡Puedo buscarlos! Miro los archivos y carpetas más pesados que no usás hace rato, y te marco cuáles suelen sobrar y cuáles conviene respaldar. Yo no borro nada: lo decidís vos.',
      proponer: { accion: 'ver_archivos_pesados', motivo: 'Ver qué ocupa espacio sin usarse.' },
    };
  }
  const nueva = accionLocalNueva(texto);
  if (nueva) return nueva;

  // Textos fijos: siempre disponibles, sin datos del sistema.
  if (PIDE_SALUDO.test(t)) {
    return { texto: '¡Hola! Soy Kerni y cuido tu computadora. ¿En qué te ayudo?' };
  }
  if (PIDE_GRACIAS.test(t)) {
    return { texto: 'De nada. Acá estoy si necesitás algo más.' };
  }
  if (PIDE_QUE_PUES.test(t)) {
    return { texto: 'Puedo mirar el estado de tu PC (CPU, memoria, disco, batería, red), descubrir qué dispositivos hay en tu red local, ver archivos pesados que ya no usás, abrir ajustes de Windows y ayudarte a armar un reporte para soporte técnico. Lo que cambie algo lo propongo y vos decidís.' };
  }
  if (PIDE_HORA.test(t)) {
    const ahora = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' });
    return { texto: `En El Salvador son las ${ahora}` };
  }

  if (m && pideDiagnostico(t)) return diagnosticoLento(m);

  if (!m) return null;

  // Datos medidos: máximo 6 palabras.
  if (w <= MAX_PALABRAS_DATOS) {
    if (PIDE_RAM.test(t)) {
      const pct = Math.round((m.ram.usadaMb / m.ram.totalMb) * 100);
      return { texto: `Tu memoria RAM va al ${pct} %: usás ${Math.round(m.ram.usadaMb)} MB de ${Math.round(m.ram.totalMb)} MB.` };
    }
    if (PIDE_CPU.test(t)) {
      return { texto: `Tu procesador está al ${Math.round(m.cpu)} % ahora mismo.` };
    }
    if (PIDE_TOP_MEM.test(t) && m.procesos?.length) {
      const top = [...m.procesos].sort((a, b) => b.memoriaMb - a.memoriaMb).slice(0, 3);
      const lista = top.map((p) => `${p.nombre} (${Math.round(p.memoriaMb)} MB)`).join(', ');
      return { texto: `Los tres procesos que más memoria usan son: ${lista}.` };
    }
    if (PIDE_TOP_CPU.test(t) && m.procesos?.length) {
      const top = [...m.procesos].sort((a, b) => b.cpu - a.cpu).slice(0, 3);
      const lista = top.map((p) => `${p.nombre} (${p.cpu.toFixed(1)} %)`).join(', ');
      return { texto: `Los tres procesos que más CPU usan son: ${lista}.` };
    }
    if (PIDE_BATERIA.test(t)) {
      if (m.bateria) {
        const nota = m.bateria.cargando ? ' (está cargando)' : m.bateria.enchufada ? ' (enchufada)' : '';
        return { texto: `Tu batería está al ${m.bateria.porcentaje} %${nota}.` };
      }
      return { texto: 'No detecté batería: parece que es una computadora de escritorio.' };
    }
  }

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

/** Extensiones comunes de archivo: si un texto solo termina así, es un archivo, no un sitio. */
const EXTENSIONES_DE_ARCHIVO = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'zip', 'rar', '7z', 'exe', 'msi', 'mp3', 'mp4', 'mov', 'avi', 'json', 'xml', 'js', 'ts', 'py', 'log', 'ini', 'bat', 'iso']);

/**
 * Si TODO el texto copiado al portapapeles es un solo enlace, lo devuelve. Misma heurística que enlaceParaRevisar,
 * pero anclada: un párrafo, dos enlaces o un nombre de archivo ("informe.pdf") no cuentan.
 * @returns {string|null}
 */
export function enlaceUnicoEnTexto(texto) {
  const t = String(texto ?? '').trim();
  if (!t || t.length > 300 || /\s/.test(t)) return null;
  const limpio = t.replace(/[.,;:!?)\]"']+$/, '');
  if (!new RegExp(`^${ALGO_COMO_ENLACE.source}$`, 'i').test(limpio)) return null;
  // Un nombre de archivo ("factura.pdf") parece dominio; no es un enlace que valga la pena revisar.
  if (!/^(https?:\/\/|www\.)/i.test(limpio) && EXTENSIONES_DE_ARCHIVO.has(limpio.split('.').pop().toLowerCase())) return null;
  return limpio;
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

// Cómo se muestran los resultados de las herramientas extra. Lógica pura (sin DOM), testeable con `npm test`.
//
// Todo lo que viene del sistema (nombres de programas, títulos de actualizaciones, rutas) es dato no confiable:
// aquí solo se arman textos; main.js los pinta con `textContent`, nunca con `innerHTML`.
import { tamanoLegible } from './archivos.js';

export const AJUSTES = {
  almacenamiento: 'Almacenamiento',
  aplicaciones: 'Aplicaciones instaladas',
  inicio: 'Aplicaciones de inicio',
  actualizaciones: 'Windows Update',
  red: 'Red e internet',
  energia: 'Energía y batería',
};

/** Acciones que solo muestran información: se ejecutan con la función de main.js que lleva su nombre. */
/** Días sin reiniciar a partir de los cuales Kerni avisa. */
export const DIAS_SIN_REINICIAR = 7;

export const ACCIONES_PANEL = ['ver_info_equipo', 'ver_programas_inicio', 'ver_espacio_carpetas', 'ver_estado_red', 'ver_actualizaciones', 'ver_dispositivos_red'];

/** El texto de la tarjeta de confirmación para las acciones nuevas, o null si no es una de ellas. */
export function describirNueva(a) {
  switch (a.accion) {
    case 'ver_info_equipo': return '¿Miro el modelo y las características de tu equipo? Solo lo muestro en pantalla.';
    case 'ver_programas_inicio': return '¿Miro qué programas se abren solos cuando prendés la compu? Solo los listo; no cambio nada.';
    case 'ver_espacio_carpetas': return '¿Miro qué carpetas ocupan más espacio? Solo las listo; no borro ni muevo nada.';
    case 'ver_estado_red': return '¿Reviso si tenés internet y cómo está la conexión? Hago una prueba corta y no mando tus datos a ningún lado.';
    case 'ver_reporte_soporte': return '¿Armo un resumen de tu equipo para soporte técnico? Junta el modelo, la memoria, el disco, lo que se abre al iniciar y la red. Se queda en pantalla: solo se copia si vos tocás el botón.';
    case 'ver_actualizaciones': return '¿Busco si Windows tiene actualizaciones pendientes? Solo miro; no descargo ni instalo nada. Puede tardar un rato.';
    case 'ver_dispositivos_red': return '¿Reviso qué dispositivos hay conectados a tu red local? Solo los listo: no entro ni hago nada en ellos.';
    case 'abrir_ajuste': return `¿Abro "${AJUSTES[a.destino] ?? 'Configuración'}" en los ajustes de Windows?`;
    case 'vaciar_papelera': return a.detalle
      ? `¿Vaciar la papelera? Tiene ${a.detalle}. Se borra para siempre y no se puede deshacer.`
      : '¿Vaciar la papelera? Lo que tiene se borra para siempre y no se puede deshacer.';
    case 'cambiar_inicio': return a.activar
      ? `¿Querés que ${a.nombre} vuelva a abrirse al iniciar Windows?`
      : `¿Querés que ${a.nombre} deje de abrirse solo al iniciar Windows? No se desinstala y lo podés reactivar cuando quieras.`;
    default: return null;
  }
}

/** "3 elementos, 12 MB" para la tarjeta de la papelera. */
export function detallePapelera(p) {
  if (!p.elementos) return 'nada';
  return `${p.elementos} ${p.elementos === 1 ? 'elemento' : 'elementos'} (${tamanoLegible(p.mb)})`;
}

/**
 * @typedef {{ titulo: string, detalle?: string, pista?: { nivel: string, texto: string }, boton?: { texto: string, tipo: string, dato?: any } }} Fila
 * @returns {{ estado: string, filas: Fila[] }}
 */

export function panelEquipo(e) {
  const nombre = [e.fabricante, e.modelo].filter(Boolean).join(' ') || 'Tu equipo';
  const ram = e.ramMb ? `${(e.ramMb / 1024).toFixed(1)} GB de memoria` : '';
  const filas = [
    { titulo: nombre, detalle: [e.so, e.version && `versión ${e.version}`].filter(Boolean).join(' · ') },
    ...(e.cpu ? [{ titulo: e.cpu, detalle: e.nucleos ? `${e.nucleos} núcleos` : '' }] : []),
    ...(ram ? [{ titulo: ram, detalle: 'la RAM instalada' }] : []),
  ];
  return { estado: `Esto es lo que veo de tu equipo. Si me preguntás por manuales o mejoras, uso este modelo.`, filas };
}

const dosDecimales = (n) => (Math.round(n * 10) / 10).toFixed(1);

/** "12 días" / "5 horas" / "40 minutos": cuánto lleva encendida la PC desde el último arranque completo. */
export function tiempoEncendida(segundos) {
  const dias = Math.floor(segundos / 86400);
  if (dias >= 1) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  const horas = Math.floor(segundos / 3600);
  if (horas >= 1) return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const minutos = Math.max(1, Math.floor(segundos / 60));
  return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
}

/**
 * Resumen del equipo para pegarlo en un correo o chat de soporte. Solo texto: nombres de procesos y programas, nunca rutas ni el
 * nombre de usuario. Si falta un dato, esa línea no aparece (no se inventa nada).
 * @param {{ fecha?: Date, equipo?: object, metricas?: object, inicio?: object[], red?: object }} d
 */
export function armarReporte({ fecha = new Date(), equipo, metricas, inicio, red } = {}) {
  const l = [];
  const dd = (n) => String(n).padStart(2, '0');
  l.push(`Resumen del equipo para soporte (armado por Kerni el ${dd(fecha.getDate())}/${dd(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dd(fecha.getHours())}:${dd(fecha.getMinutes())})`);
  l.push('');
  if (equipo) {
    const nombre = [equipo.fabricante, equipo.modelo].filter(Boolean).join(' ');
    if (nombre) l.push(`Equipo: ${nombre}`);
    if (equipo.so) l.push(`Sistema: ${equipo.so}${equipo.version ? ` (versión ${equipo.version})` : ''}`);
    if (equipo.cpu) l.push(`Procesador: ${equipo.cpu}${equipo.nucleos ? ` (${equipo.nucleos} núcleos)` : ''}`);
  }
  if (metricas) {
    const { ram, disco } = metricas;
    if (ram?.totalMb) l.push(`Memoria: ${dosDecimales(ram.totalMb / 1024)} GB instalada, ${dosDecimales(ram.usadaMb / 1024)} GB en uso (${Math.round((ram.usadaMb / ram.totalMb) * 100)} %)`);
    if (disco?.totalGb) l.push(`Disco principal: ${dosDecimales(disco.libreGb)} GB libres de ${dosDecimales(disco.totalGb)} GB (${Math.round(((disco.totalGb - disco.libreGb) / disco.totalGb) * 100)} % usado)`);
    if (metricas.bateria) l.push(`Batería: ${metricas.bateria.porcentaje} %${metricas.bateria.cargando ? ' (cargando)' : metricas.bateria.enchufada ? ' (enchufada)' : ''}`);
    if (Number.isFinite(metricas.encendidaS)) l.push(`Encendida desde el último arranque completo: ${tiempoEncendida(metricas.encendidaS)}`);
    const top = [...(metricas.procesos ?? [])].sort((a, b) => b.memoriaMb - a.memoriaMb).slice(0, 5);
    if (top.length) l.push(`Procesos que más memoria usan: ${top.map((p) => `${p.nombre} (${dosDecimales(p.memoriaMb / 1024)} GB)`).join(', ')}`);
  }
  if (inicio) {
    const activos = inicio.filter((p) => p.activo);
    l.push(`Programas que se abren al iniciar Windows: ${activos.length} activos de ${inicio.length}${activos.length ? ` (${activos.map((p) => p.nombre).join(', ')})` : ''}`);
  }
  if (red) {
    l.push(red.internet
      ? `Red: con internet, respuesta de ${red.latenciaMs} ms${red.dns ? '' : ', pero no resuelve nombres (DNS)'}${red.adaptadores?.length ? `; conexión ${red.adaptadores.map((a) => `${a.tipo}${a.velocidad ? ` ${a.velocidad}` : ''}`).join(', ')}` : ''}`
      : 'Red: sin internet en este momento');
  }
  l.push('');
  l.push('No incluye las actualizaciones de Windows (tardan en revisarse); se piden aparte.');
  return l.join('\n');
}

export function panelReporte(texto) {
  return {
    estado: 'Este es el resumen. Revisalo: no lleva rutas, contraseñas ni tu nombre de usuario. Se copia solo si tocás el botón.',
    filas: texto.split('\n').filter(Boolean).map((linea) => ({ titulo: linea, largo: true })),
    boton: { texto: 'Copiar resumen', tipo: 'copiar', dato: texto },
  };
}

export function panelInicio(lista) {
  if (!lista.length) return { estado: 'No veo programas que se abran solos al iniciar. ¡Eso ayuda a que prenda rápido!', filas: [] };
  const activos = lista.filter((p) => p.activo);
  const estado = `Hay ${lista.length} ${lista.length === 1 ? 'programa' : 'programas'} de inicio y ${activos.length} ${activos.length === 1 ? 'está activo' : 'están activos'}. `
    + 'Desactivar uno no lo desinstala: solo evita que se abra solo, y lo podés reactivar.';
  const filas = lista.map((p) => ({
    titulo: p.nombre,
    detalle: `${p.activo ? 'Se abre al iniciar' : 'Desactivado'} · ${p.ambito === 'usuario' ? 'tuyo' : 'del equipo'}`,
    ...(p.puedeCambiar
      ? { boton: { texto: p.activo ? 'Desactivar' : 'Activar', tipo: 'cambiar_inicio', dato: { nombre: p.nombre, activar: !p.activo } } }
      : { pista: { nivel: 'revisar', texto: 'Del equipo: para cambiarlo hace falta administrador (Administrador de tareas).' } }),
  }));
  return { estado, filas };
}

export function panelEspacio({ elementos, completa }) {
  if (!elementos.length) return { estado: `No encontré carpetas grandes en tus carpetas personales.${completa ? '' : ' Revisé hasta donde alcancé.'}`, filas: [] };
  const total = elementos.reduce((s, a) => s + a.tamanoMb, 0);
  return {
    estado: `Lo más grande de tus carpetas personales suma ${tamanoLegible(total)}. ${completa ? '' : 'Puede haber más: no alcancé a revisar todo. '}Tocá "Ver" para abrirlo en el Explorador.`,
    filas: elementos.map((a) => ({
      titulo: a.esCarpeta ? `${a.nombre} (carpeta)` : a.nombre,
      detalle: `${tamanoLegible(a.tamanoMb)} · ${a.carpeta}`,
      boton: { texto: 'Ver', tipo: 'mostrar', dato: a.ruta },
    })),
  };
}

const LATENCIA_LENTA_MS = 200;

export function panelRed(r) {
  let estado;
  if (!r.internet) estado = 'No logro salir a internet. Fijate si el Wi-Fi está conectado o si el cable está bien puesto; si sigue igual, reiniciar el router suele ayudar.';
  else if (!r.dns) estado = 'Hay conexión, pero no se resuelven los nombres de las páginas (DNS). Reiniciar el router o cambiar el DNS suele arreglarlo.';
  else if (r.latenciaMs > LATENCIA_LENTA_MS) estado = `Tenés internet, pero la respuesta tarda ${r.latenciaMs} ms: está lenta. Acercarte al router o cerrar descargas puede ayudar.`;
  else estado = `Tenés internet y responde bien (${r.latenciaMs} ms).`;
  const filas = r.adaptadores.length
    ? r.adaptadores.map((a) => ({ titulo: `${a.nombre} (${a.tipo})`, detalle: a.velocidad ? `Velocidad del enlace: ${a.velocidad}` : 'Conectado' }))
    : [{ titulo: r.internet ? 'No pude leer los detalles del adaptador' : 'Ninguna conexión activa', detalle: '' }];
  return { estado, filas };
}

const filaActualizacion = (u) => ({
  titulo: u.titulo,
  detalle: `hasta ${tamanoLegible(u.mb)}${u.reinicio ? ' · pide reiniciar' : ''}`,
  ...(u.automatica
    ? { pista: { nivel: 'revisar', texto: 'Se instala sola: son las definiciones del antivirus.' } }
    : u.critica ? { pista: { nivel: 'respaldar', texto: 'Crítica: conviene instalarla pronto.' } } : {}),
});

export function panelActualizaciones(lista) {
  // Las definiciones del antivirus se instalan solas varias veces al día: se muestran, pero no cuentan como algo pendiente de hacer.
  const propias = lista.filter((u) => !u.automatica);
  const solas = lista.length - propias.length;
  const notaSolas = solas ? ` Además hay ${solas} del antivirus que se ${solas === 1 ? 'instala' : 'instalan'} sola${solas === 1 ? '' : 's'}.` : '';
  if (!propias.length) return { estado: `Windows está al día: no hay actualizaciones pendientes para vos.${notaSolas}`, filas: lista.map(filaActualizacion) };
  const criticas = propias.filter((u) => u.critica).length;
  const total = propias.reduce((s, u) => s + u.mb, 0);
  const reinicio = propias.some((u) => u.reinicio);
  return {
    estado: `Hay ${propias.length} ${propias.length === 1 ? 'actualización pendiente' : 'actualizaciones pendientes'} (hasta ${tamanoLegible(total)})`
      + `${criticas ? `, ${criticas} ${criticas === 1 ? 'crítica' : 'críticas'}` : ''}. ${reinicio ? 'Alguna pide reiniciar. ' : ''}No instalé nada: podés hacerlo desde Windows Update.${notaSolas}`,
    filas: lista.map(filaActualizacion),
    boton: { texto: 'Abrir Windows Update', tipo: 'ajuste', dato: 'actualizaciones' },
  };
}

/**
 * @param {{ ip: string, mac: string, nombre: string }[]} dispositivos
 * @returns {{ estado: string, filas: Fila[] }}
 */
export function panelDispositivosRed(dispositivos, miIpLocal) {
  const filas = dispositivos.map((d) => {
    const esLocal = Boolean(miIpLocal && miIpLocal === d.ip);
    const titulo = esLocal ? `🖥 ${d.ip} (tu PC)` : (d.ip || 'Sin IP');
    const detalle = `${d.mac || 'MAC desconocida'}${esLocal ? ' · Esta es tu IP local' : ''}`;
    return {
      titulo,
      detalle: d.nombre ? `${d.nombre} (${detalle})` : detalle,
      ...(esLocal ? { pista: { nivel: 'info', texto: 'Tu dirección IP en la red local.' } } : {}),
    };
  });
  const ipLocal = miIpLocal ? `Tu IP local es <b>${miIpLocal}</b>.` : 'No pude identificar tu IP local con certeza.';
  const actividadArp = dispositivos.length
    ? `La tabla ARP muestra ${dispositivos.length} ${dispositivos.length === 1 ? 'dispositivo' : 'dispositivos'} que tu PC ha visto recientemente (caché, no escaneo activo).`
    : 'La tabla ARP no muestra dispositivos recientes (caché, no escaneo activo).';
  const estado = `${ipLocal} ${actividadArp} ` +
    'Dispositivos que no han hablado con tu PC en los últimos minutos no aparecen.';
  return { estado, filas };
}

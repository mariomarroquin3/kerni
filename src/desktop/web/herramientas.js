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
export const ACCIONES_PANEL = ['ver_info_equipo', 'ver_programas_inicio', 'ver_espacio_carpetas', 'ver_estado_red', 'ver_actualizaciones'];

/** El texto de la tarjeta de confirmación para las acciones nuevas, o null si no es una de ellas. */
export function describirNueva(a) {
  switch (a.accion) {
    case 'ver_info_equipo': return '¿Miro el modelo y las características de tu equipo? Solo lo muestro en pantalla.';
    case 'ver_programas_inicio': return '¿Miro qué programas se abren solos cuando prendés la compu? Solo los listo; no cambio nada.';
    case 'ver_espacio_carpetas': return '¿Miro qué carpetas ocupan más espacio? Solo las listo; no borro ni muevo nada.';
    case 'ver_estado_red': return '¿Reviso si tenés internet y cómo está la conexión? Hago una prueba corta y no mando tus datos a ningún lado.';
    case 'ver_actualizaciones': return '¿Busco si Windows tiene actualizaciones pendientes? Solo miro; no descargo ni instalo nada. Puede tardar un rato.';
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

export function panelActualizaciones(lista) {
  if (!lista.length) return { estado: 'Windows está al día: no hay actualizaciones pendientes.', filas: [] };
  const criticas = lista.filter((u) => u.critica).length;
  const total = lista.reduce((s, u) => s + u.mb, 0);
  const reinicio = lista.some((u) => u.reinicio);
  return {
    estado: `Hay ${lista.length} ${lista.length === 1 ? 'actualización pendiente' : 'actualizaciones pendientes'} (${tamanoLegible(total)})`
      + `${criticas ? `, ${criticas} ${criticas === 1 ? 'crítica' : 'críticas'}` : ''}. ${reinicio ? 'Alguna pide reiniciar. ' : ''}No instalé nada: podés hacerlo desde Windows Update.`,
    filas: lista.map((u) => ({
      titulo: u.titulo,
      detalle: `${tamanoLegible(u.mb)}${u.reinicio ? ' · pide reiniciar' : ''}`,
      ...(u.critica ? { pista: { nivel: 'respaldar', texto: 'Crítica: conviene instalarla pronto.' } } : {}),
    })),
    boton: { texto: 'Abrir Windows Update', tipo: 'ajuste', dato: 'actualizaciones' },
  };
}

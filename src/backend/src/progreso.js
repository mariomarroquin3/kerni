// Progreso de aprendizaje: cuánto XP suma cada evento y el tope por día. Lógica pura (sin base de datos).
// El front solo dice QUÉ pasó (un evento de la lista cerrada); aquí se decide cuánto vale y si se suma.
// Nunca se premia cerrar procesos, vaciar la papelera ni congelar: los eventos son de aprender, no de aprobar.

/** XP por evento. Lista cerrada: un evento desconocido se rechaza con 400. */
export const XP_POR_EVENTO = Object.freeze({
  ayuda_leida: 3, // abrió "¿Por qué?" en una tarjeta (el front cuenta una vez por tipo de tarjeta y día)
  consejo_visto: 2, // leyó un consejo (el front cuenta cada consejo una sola vez)
  leccion_completa: 5, // terminó la mini-lección (aquí se limita a una por día)
});

export const EVENTOS_PROGRESO = Object.freeze(Object.keys(XP_POR_EVENTO));

/** Tope de XP que se puede ganar en un día (hora de El Salvador). */
export const TOPE_DIARIO_XP = 20;

const UTC_MENOS_6_MS = 6 * 3_600_000;

/** Día civil en El Salvador (UTC-6, sin horario de verano) como AAAA-MM-DD. */
export function diaLocal(ahoraMs = Date.now()) {
  return new Date(ahoraMs - UTC_MENOS_6_MS).toISOString().slice(0, 10);
}

/**
 * Decide cuánto XP entra con un evento dado lo que ya se ganó hoy.
 * @returns {{ aplicado: boolean, puntos: number, motivo?: 'tope_diario'|'ya_hoy', leccionHoy: boolean }}
 */
export function calcularEvento({ evento, xpHoy = 0, leccionHoy = false }) {
  const base = XP_POR_EVENTO[evento];
  if (base === undefined) return { aplicado: false, puntos: 0, motivo: 'evento_desconocido', leccionHoy };
  if (evento === 'leccion_completa' && leccionHoy) return { aplicado: false, puntos: 0, motivo: 'ya_hoy', leccionHoy };
  const restante = Math.max(0, TOPE_DIARIO_XP - xpHoy);
  const puntos = Math.min(base, restante);
  if (puntos === 0) return { aplicado: false, puntos: 0, motivo: 'tope_diario', leccionHoy };
  return { aplicado: true, puntos, leccionHoy: leccionHoy || evento === 'leccion_completa' };
}

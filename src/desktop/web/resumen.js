// Resumen diario: un mensaje al día con datos que la app ya tiene. Lógica pura (sin DOM, sin red, sin modelo).
// El día y la hora se miran en El Salvador (UTC-6, sin horario de verano), no en la zona de la PC.

import { porcentajeDisco } from './intenciones.js';
import { avisoReinicio } from './reglas.js';

export const HORA_RESUMEN = 9;
const ZONA = 'America/El_Salvador';

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

/** Fecha local de El Salvador como 'AAAA-MM-DD'. */
export function diaSV(ahora) {
  const p = Object.fromEntries(formato.formatToParts(new Date(ahora)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hora local de El Salvador, de 0 a 23. */
export function horaSV(ahora) {
  const p = Object.fromEntries(formato.formatToParts(new Date(ahora)).map((x) => [x.type, x.value]));
  return Number(p.hour) % 24;
}

/**
 * ¿Toca mostrar el resumen ahora? Solo una vez por día (El Salvador), a partir de las 9:00, con la opción encendida,
 * sin pánico, sin tarjeta abierta, sin otra burbuja en pantalla y con una lectura del sistema.
 * @returns {boolean}
 */
export function debeMostrarResumen({ activo, ahora, ultimoDia = null, panico = false, tarjetaAbierta = false, burbujaAbierta = false, lectura = null } = {}) {
  if (activo !== true || panico || tarjetaAbierta || burbujaAbierta || !lectura) return false;
  if (!Number.isFinite(ahora) || horaSV(ahora) < HORA_RESUMEN) return false;
  return ultimoDia !== diaSV(ahora);
}

const porcentaje = (usado, total) => (Number.isFinite(usado) && Number.isFinite(total) && total > 0 ? Math.round((usado / total) * 100) : null);

/**
 * El texto del resumen: disco, memoria, batería si hay, y el aviso de días sin reiniciar (el de siempre, reglas.js).
 * Solo usa números y el umbral de reinicio; no lleva nombres de procesos ni de archivos.
 */
export function textoResumenDiario(m) {
  const frases = ['Buen día.'];
  const disco = m.disco ? porcentajeDisco(m) : null;
  const ram = m.ram ? porcentaje(m.ram.usadaMb, m.ram.totalMb) : null;
  const medidas = [];
  if (Number.isFinite(disco)) medidas.push(`el disco está al ${disco} % lleno`);
  if (Number.isFinite(ram)) medidas.push(`la memoria va al ${ram} %`);
  if (medidas.length) frases.push(`Hoy ${medidas.join(' y ')}.`);
  if (m.bateria && Number.isFinite(m.bateria.porcentaje)) {
    frases.push(`La batería está al ${Math.round(m.bateria.porcentaje)} %.`);
  }
  const reinicio = avisoReinicio(m.encendidaS);
  if (reinicio) frases.push(`Lleva ${reinicio.dias} días sin reiniciarse del todo: conviene reiniciarla (elegí Reiniciar, no Apagar).`);
  return frases.join(' ');
}

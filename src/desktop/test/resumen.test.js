import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { debeMostrarResumen, diaSV, horaSV, textoResumenDiario } from '../web/resumen.js';

// El Salvador es UTC-6 todo el año: 15:00 UTC = 09:00 local.
// Date.UTC pasa solo al día siguiente cuando la hora de SV + 6 se sale de 24 (23:59 SV = 05:59 UTC del día siguiente).
const SV = (fecha, hora, min = 0) => {
  const [y, mes, dia] = fecha.split('-').map(Number);
  return Date.UTC(y, mes - 1, dia, hora + 6, min);
};
const LECTURA = { cpu: 5, ram: { usadaMb: 8000, totalMb: 16000 }, disco: { libreGb: 100, totalGb: 500 }, encendidaS: 3600, bateria: null };
const base = { activo: true, ultimoDia: null, lectura: LECTURA };

test('la fecha y la hora se miran en El Salvador, no en la zona de la PC', () => {
  assert.equal(diaSV(SV('2026-11-01', 23, 59)), '2026-11-01');
  assert.equal(diaSV(SV('2026-11-02', 0, 1)), '2026-11-02');
  assert.equal(horaSV(SV('2026-11-01', 8, 59)), 8);
  assert.equal(horaSV(SV('2026-11-01', 9, 0)), 9);
  assert.equal(horaSV(SV('2026-11-01', 0, 0)), 0);
});

test('límite de día: antes de las 9:00 no muestra; a las 9:00 sí; el día cambia a medianoche de El Salvador', () => {
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 8, 59) }), false);
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 9, 0) }), true);
  // 23:59 del 1 ya es día 1 (no se repite a medianoche si ya se mostró ese día).
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 23, 59), ultimoDia: '2026-11-01' }), false);
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-02', 0, 1), ultimoDia: '2026-11-01' }), false);
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-02', 9, 0), ultimoDia: '2026-11-01' }), true);
});

test('una vez por día: si el día guardado es hoy, no vuelve a mostrarse', () => {
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 14, 0), ultimoDia: '2026-11-01' }), false);
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 14, 0), ultimoDia: '2026-10-31' }), true);
});

test('apagado no muestra nunca', () => {
  assert.equal(debeMostrarResumen({ ...base, activo: false, ahora: SV('2026-11-01', 12, 0) }), false);
});

test('en pánico no se muestra', () => {
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 12, 0), panico: true }), false);
});

test('con una tarjeta abierta no se muestra, ni con otra burbuja en pantalla', () => {
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 12, 0), tarjetaAbierta: true }), false);
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 12, 0), burbujaAbierta: true }), false);
});

test('sin lectura del sistema no se muestra (no hay datos que resumir)', () => {
  assert.equal(debeMostrarResumen({ ...base, ahora: SV('2026-11-01', 12, 0), lectura: null }), false);
});

test('el texto trae disco y memoria en porcentaje, la batería si existe y el aviso de 7 días o más', () => {
  const t = textoResumenDiario(LECTURA);
  assert.match(t, /Buen día/);
  assert.match(t, /disco está al 80 % lleno/);
  assert.match(t, /memoria va al 50 %/);
  assert.doesNotMatch(t, /batería/);
  assert.doesNotMatch(t, /reiniciar/);

  const conBateria = textoResumenDiario({ ...LECTURA, bateria: { porcentaje: 64.4, cargando: false, enchufada: false } });
  assert.match(conBateria, /La batería está al 64 %\./);

  const viejo = textoResumenDiario({ ...LECTURA, encendidaS: 8 * 86400 });
  assert.match(viejo, /Lleva 8 días sin reiniciarse del todo/);
  assert.match(viejo, /elegí Reiniciar, no Apagar/);
});

test('el texto no nombra procesos ni archivos y no tiene etiquetas', () => {
  const t = textoResumenDiario({ ...LECTURA, procesos: [{ nombre: '<b>miner.exe</b>', cpu: 99, memoriaMb: 9000 }] });
  assert.doesNotMatch(t, /miner|<|>/);
});

test('main.js: el resumen usa textContent, va en localStorage con try/catch y no hace red ni consulta al modelo', () => {
  // Finales de línea normalizados: con core.autocrlf=true el archivo en disco tiene \r\n y el bloque se corta en "\n}\n".
  const main = readFileSync(new URL('../web/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const inicio = main.indexOf('function revisarResumenDiario');
  assert.ok(inicio > 0, 'falta revisarResumenDiario');
  const bloque = main.slice(inicio, main.indexOf('\n}\n', inicio));
  assert.match(bloque, /kerni\.resumenDiarioDia/);
  assert.match(bloque, /decir\(textoResumenDiario/);
  assert.doesNotMatch(bloque, /fetch\(|\/chat/);
  assert.match(main, /kerni\.resumenDiario'\) !== '0'/);
});

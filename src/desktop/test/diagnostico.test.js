// Diagnóstico de solo lectura (ver_arranque y las que siguen): textos de la tarjeta, paneles y pedidos locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describirNueva, panelArranque, panelSaludDisco, ACCIONES_PANEL } from '../web/herramientas.js';
import { accionLocalNueva } from '../web/intenciones.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8');
const lib = leer('src-tauri', 'src', 'lib.rs');
const main = leer('web', 'main.js');

test('ver_arranque: la tarjeta dice que solo mira y no cambia nada', () => {
  assert.match(describirNueva({ accion: "ver_arranque" }), /No cambio nada/);
  assert.ok(ACCIONES_PANEL.includes('ver_arranque'));
});

test('ver_arranque: dice cuánto tardó, o que no lo puede medir sin inventar una duración', () => {
  const p = panelArranque({ duracionS: 48.2, fecha: '2026-10-31T08:02:11', programasActivos: 7, programasTotal: 12, nota: 'Lo tomé del último registro de arranque de Windows.' });
  assert.match(p.estado, /tardó 48 segundos/);
  assert.match(p.estado, /7 de 12 programas/);
  assert.match(p.estado, /ayuda a que prenda/);
  assert.equal(p.filas[0].detalle, '2026-10-31 08:02:11');
  const sin = panelArranque({ duracionS: null, fecha: null, programasActivos: 2, programasTotal: 3, nota: 'No encuentro el registro de tiempos de arranque de Windows. Puede que haga falta administrador.' });
  assert.match(sin.estado, /No pude medir/);
  assert.match(sin.estado, /administrador/);
  assert.doesNotMatch(sin.estado, /tardó \d/);
  assert.deepEqual(sin.filas, []);
});

test('ver_arranque: "¿por qué tarda en prender?" abre la tarjeta sin modelo; "la compu tarda en prender" sigue siendo la lista de inicio', () => {
  assert.equal(accionLocalNueva('¿por qué tarda en prender?')?.proponer.accion, 'ver_arranque');
  assert.equal(accionLocalNueva('cuánto tarda en prender la compu')?.proponer.accion, 'ver_arranque');
  assert.equal(accionLocalNueva('la compu tarda en prender')?.proponer.accion, 'ver_programas_inicio');
});

test('ver_arranque: está registrado en lib.rs (dos listas) y la interfaz lo llama y lo muestra', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_arranque,/g)].length, 2);
  assert.match(lib, /^mod diagnostico;/m);
  assert.ok(main.includes("llamar('ver_arranque'"));
  assert.match(main, /ver_arranque: verArranque/);
});

test('ver_salud_disco: la tarjeta dice que solo mira y "¿cómo está el disco?" la abre sin modelo', () => {
  assert.match(describirNueva({ accion: 'ver_salud_disco' }), /no pruebo, no reparo ni borro nada/);
  assert.ok(ACCIONES_PANEL.includes('ver_salud_disco'));
  assert.equal(accionLocalNueva('¿cómo está el disco?')?.proponer.accion, 'ver_salud_disco');
  assert.equal(accionLocalNueva('cómo está el disco lleno'), null);
});

test('ver_salud_disco: separa alerta de sin alertas y nunca dice "sano"', () => {
  const alerta = panelSaludDisco({ discos: [{ nombre: 'HDD', tipo: 'HDD', gb: 1000, nivel: 'alerta', motivos: ['Windows marca advertencia en la salud del disco'], temperaturaC: null, desgastePct: null, erroresLectura: null, datosParciales: false }], nota: '' });
  assert.match(alerta.estado, /alerta. Respaldá tus archivos ya/);
  assert.match(alerta.filas[0].pista.texto, /Respaldá ya/);
  const ok = panelSaludDisco({ discos: [{ nombre: 'SSD', tipo: 'SSD', gb: 476, nivel: 'sin_alertas', motivos: [], temperaturaC: 34, desgastePct: 3, erroresLectura: 0, datosParciales: false }], nota: '' });
  assert.match(ok.estado, /Sin alertas en tus discos/);
  assert.doesNotMatch(ok.estado + JSON.stringify(ok.filas), /sano/i);
  const vacio = panelSaludDisco({ discos: [], nota: 'No pude leer los discos de esta PC: Tardó demasiado y lo cancelé' });
  assert.match(vacio.estado, /No pude leer/);
});

test('ver_salud_disco: registrado en lib.rs (dos listas) y la interfaz lo llama', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_salud_disco,/g)].length, 2);
  assert.ok(main.includes("llamar('ver_salud_disco'"));
  assert.match(main, /ver_salud_disco: verSaludDisco/);
});

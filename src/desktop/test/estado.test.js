import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDetectorPanico, calcularAnimo, sospechosos, snapshotParaBackend, modoKerni } from '../web/estado.js';

const sano = { cpu: 10, ram: { usadaMb: 4000, totalMb: 16000 }, disco: { libreGb: 200, totalGb: 476 }, procesos: [] };

test('un pico suelto de CPU no activa el pánico', () => {
  const d = crearDetectorPanico();
  assert.equal(d.actualizar(100), false);
  assert.equal(d.actualizar(40), false);
  assert.equal(d.actualizar(100), false);
});

test('tres lecturas seguidas sobre 95% activan el pánico', () => {
  const d = crearDetectorPanico();
  d.actualizar(96);
  d.actualizar(99);
  assert.equal(d.actualizar(97), true);
});

test('el pánico solo se quita tras varias lecturas tranquilas', () => {
  const d = crearDetectorPanico();
  [96, 96, 96].forEach((c) => d.actualizar(c));
  assert.equal(d.actualizar(20), true);
  assert.equal(d.actualizar(20), true);
  assert.equal(d.actualizar(20), false);
});

test('el ánimo sigue la carga de la PC', () => {
  assert.equal(calcularAnimo(sano), 'feliz');
  assert.equal(calcularAnimo({ ...sano, cpu: 60 }), 'normal');
  assert.equal(calcularAnimo({ ...sano, ram: { usadaMb: 15000, totalMb: 16000 } }), 'cansado');
  assert.equal(calcularAnimo({ ...sano, disco: { libreGb: 10, totalGb: 476 } }), 'cansado');
  assert.equal(calcularAnimo(sano, true), 'panico');
});

test('los sospechosos excluyen protegidos y procesos tranquilos', () => {
  const procesos = [
    { pid: 1, nombre: 'svchost.exe', cpu: 90, protegido: true },
    { pid: 2, nombre: 'chrome.exe', cpu: 40, protegido: false },
    { pid: 3, nombre: 'notepad.exe', cpu: 0.1, protegido: false },
    { pid: 4, nombre: 'miner.exe', cpu: 55, protegido: false },
  ];
  assert.deepEqual(sospechosos(procesos).map((p) => p.pid), [4, 2]);
});

test('la foto para el backend no lleva el campo interno protegido', () => {
  const m = { ...sano, procesos: [{ pid: 2, nombre: 'a.exe', cpu: 1, memoriaMb: 5, protegido: false }] };
  assert.deepEqual(snapshotParaBackend(m).procesos[0], { pid: 2, nombre: 'a.exe', cpu: 1, memoriaMb: 5 });
});

test('el modo de Kerni respeta la prioridad: susto, alerta, análisis, alegría, sueño, reposo', () => {
  assert.equal(modoKerni({}), 'idle');
  assert.equal(modoKerni({ dormido: true }), 'dormido');
  assert.equal(modoKerni({ dormido: true, reaccion: true }), 'sonriente');
  assert.equal(modoKerni({ reaccion: true, analizando: true }), 'research');
  assert.equal(modoKerni({ analizando: true, alerta: true }), 'alerta');
  assert.equal(modoKerni({ alerta: true, panico: true, dormido: true }), 'asustado');
});

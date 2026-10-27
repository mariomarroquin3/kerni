import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDetectorPanico, calcularAnimo, sospechosos, snapshotParaBackend, modoKerni, nivelDeCarga, crearNivelCarga, MODOS_REPOSO, duracionGlobo, GLOBO_BASE_MS, GLOBO_MAXIMO_MS } from '../web/estado.js';

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

test('los umbrales de carga: 70 % o más alta, de 30 a 69 % media, menos de 30 % baja', () => {
  assert.equal(nivelDeCarga(100), 'alta');
  assert.equal(nivelDeCarga(70), 'alta');
  assert.equal(nivelDeCarga(69.9), 'media');
  assert.equal(nivelDeCarga(30), 'media');
  assert.equal(nivelDeCarga(29.9), 'baja');
  assert.equal(nivelDeCarga(0), 'baja');
});

test('la cara sale de la carga: alta = idle (sonriente normal), media = neutro, baja = aburrido', () => {
  assert.equal(modoKerni({ carga: 'alta' }), 'idle');
  assert.equal(modoKerni({ carga: 'media' }), 'neutro');
  assert.equal(modoKerni({ carga: 'baja' }), 'aburrido');
  assert.equal(modoKerni({}), 'idle'); // sin dato de carga, la cara de siempre
});

test('los eventos mandan sobre la cara de la carga', () => {
  for (const carga of ['alta', 'media', 'baja']) {
    assert.equal(modoKerni({ carga, panico: true }), 'asustado');
    assert.equal(modoKerni({ carga, alerta: true }), 'alerta');
    assert.equal(modoKerni({ carga, analizando: true }), 'research');
    assert.equal(modoKerni({ carga, reaccion: true }), 'sonriente');
    assert.equal(modoKerni({ carga, dormido: true }), 'dormido');
  }
});

test('el nivel de carga promedia las lecturas: un pico suelto no cambia la cara', () => {
  const n = crearNivelCarga();
  for (let i = 0; i < 5; i++) n.actualizar(10);
  assert.equal(n.nivel, 'baja');
  assert.equal(n.actualizar(100), 'baja'); // promedio 28: sigue aburrido
});

test('una CPU que ronda un umbral no hace parpadear la cara (histéresis)', () => {
  const n = crearNivelCarga({ muestras: 1 });
  assert.equal(n.actualizar(25), 'baja');
  assert.equal(n.actualizar(31), 'baja');   // cruzó 30 pero no por 4 puntos
  assert.equal(n.actualizar(29), 'baja');
  assert.equal(n.actualizar(34), 'media');  // ahora sí
  assert.equal(n.actualizar(28), 'media');  // vuelve a 28 y todavía no baja (necesita < 26)
  assert.equal(n.actualizar(25), 'baja');
  assert.equal(n.actualizar(72), 'alta');
  assert.equal(n.actualizar(68), 'alta');   // sigue alta hasta bajar de 66
  assert.equal(n.actualizar(65), 'media');
});

test('una carga sostenida alta lleva a la cara sonriente normal en unos segundos', () => {
  const n = crearNivelCarga();
  const caras = [10, 10, 10, 85, 85, 85, 85, 85].map((c) => n.actualizar(c));
  assert.equal(caras[0], 'baja');
  assert.equal(caras.at(-1), 'alta');
});

test('los modos de reposo (donde Kerni se vuelve transparente) son las caras de carga y dormido', () => {
  assert.deepEqual([...MODOS_REPOSO].sort(), ['aburrido', 'dormido', 'idle', 'neutro']);
  for (const m of ['asustado', 'alerta', 'research', 'sonriente']) assert.ok(!MODOS_REPOSO.includes(m), `${m} no es reposo`);
});

test('el globo de texto dura lo que se tarda en leerlo, con un mínimo, y tiene tope', () => {
  assert.equal(duracionGlobo('Hola', 0), 6400);                       // texto corto: base + un poco
  assert.equal(duracionGlobo('Pensando…', 30000), 30000);              // el mínimo manda si es más largo
  assert.equal(duracionGlobo('x'.repeat(250), 20000), 31000);          // una respuesta larga se queda más que el mínimo
  assert.ok(duracionGlobo('x'.repeat(250), 20000) > 20000);
  assert.equal(duracionGlobo('x'.repeat(5000), 0), GLOBO_MAXIMO_MS);   // nunca se queda para siempre
  assert.equal(duracionGlobo(undefined, 0), GLOBO_BASE_MS);
});

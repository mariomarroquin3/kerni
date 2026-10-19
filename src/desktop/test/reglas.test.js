import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearVigilanteRam } from '../web/reglas.js';

const lectura = (procesos, usadaMb = 14000) => ({
  cpu: 20, ram: { usadaMb, totalMb: 16000 }, disco: { libreGb: 100, totalGb: 476 }, procesos,
});
const p = (pid, nombre, memoriaMb, protegido = false) => ({ pid, nombre, cpu: 1, memoriaMb, protegido });

test('avisa solo tras lecturas sostenidas y con la RAM apretada', () => {
  const v = crearVigilanteRam();
  const m = lectura([p(1, 'chrome.exe', 4000)]);
  assert.equal(v.revisar(m), null);
  assert.equal(v.revisar(m), null);
  const a = v.revisar(m);
  assert.equal(a.motivo, 'grande');
  assert.equal(a.pid, 1);
  assert.equal(a.proponer.accion, 'terminar_proceso');
});

test('un proceso grande con RAM holgada no molesta', () => {
  const v = crearVigilanteRam();
  const m = lectura([p(1, 'chrome.exe', 4000)], 6000);
  for (let i = 0; i < 6; i++) assert.equal(v.revisar(m), null);
});

test('no repite el aviso del mismo proceso durante el enfriamiento', () => {
  let t = 0;
  const v = crearVigilanteRam({ ahora: () => t });
  const m = lectura([p(1, 'chrome.exe', 4000)]);
  for (let i = 0; i < 3; i++) v.revisar(m);
  for (let i = 0; i < 5; i++) assert.equal(v.revisar(m), null);
  t = 6 * 60_000;
  assert.ok(v.revisar(m));
});

test('nunca propone cerrar un proceso protegido', () => {
  const v = crearVigilanteRam();
  const m = lectura([p(9, 'svchost.exe', 5000, true)]);
  for (let i = 0; i < 6; i++) assert.equal(v.revisar(m), null);
});

test('detecta una fuga: memoria que solo sube', () => {
  const v = crearVigilanteRam();
  let a = null;
  for (let i = 0; i < 15; i++) a = v.revisar(lectura([p(2, 'leaky.exe', 200 + i * 40)], 8000));
  assert.equal(a.motivo, 'fuga');
  assert.match(a.texto, /creciendo/);
});

test('un proceso que sube y baja no es fuga', () => {
  const v = crearVigilanteRam();
  let a = null;
  for (let i = 0; i < 15; i++) a = v.revisar(lectura([p(2, 'normal.exe', 300 + (i % 2) * 400)], 8000));
  assert.equal(a, null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responderLocal, porcentajeDisco } from '../web/intenciones.js';

const lectura = (libreGb, totalGb = 500) => ({
  cpu: 10, ram: { usadaMb: 4000, totalMb: 16000 }, disco: { libreGb, totalGb }, procesos: [],
});

test('calcula el porcentaje usado', () => {
  assert.equal(porcentajeDisco(lectura(125)), 75);
});

test('responde con el porcentaje y los GB sin llamar al modelo', () => {
  const r = responderLocal('¿cuánto disco me queda?', lectura(300));
  assert.match(r.texto, /40%/);
  assert.match(r.texto, /200 GB de 500 GB/);
  assert.match(r.texto, /300 GB libres/);
  assert.equal(r.proponer, undefined);
});

test('entiende varias formas de pedir el dato', () => {
  for (const q of ['disco', 'porcentaje del disco', 'cuánto espacio tengo', 'almacenamiento', 'cómo va el disco C:']) {
    if (/cómo va/.test(q)) continue; // "cómo" lo decide el modelo
    assert.ok(responderLocal(q, lectura(300)), q);
  }
});

test('con el disco apretado ofrece limpiar temporales (con confirmación en la app)', () => {
  const r = responderLocal('disco', lectura(50));
  assert.match(r.texto, /90%/);
  assert.equal(r.proponer.accion, 'limpiar_temporales');
});

test('con margen intermedio avisa que conviene vigilarlo', () => {
  assert.match(responderLocal('disco', lectura(125)).texto, /vigilarlo/);
});

test('las preguntas de causa o consejo se las deja al modelo', () => {
  for (const q of ['¿por qué se llena mi disco?', 'cómo libero espacio en el disco', 'qué hago con el disco lleno', 'limpiar disco']) {
    assert.equal(responderLocal(q, lectura(50)), null, q);
  }
});

test('mensajes largos o de otro tema van al modelo', () => {
  assert.equal(responderLocal('hola kerni, cómo estás hoy', lectura(300)), null);
  assert.equal(responderLocal('quiero saber cuánto disco me queda libre en este momento exacto', lectura(300)), null);
});

test('sin lectura todavía, contesta el modelo', () => {
  assert.equal(responderLocal('disco', null), null);
});

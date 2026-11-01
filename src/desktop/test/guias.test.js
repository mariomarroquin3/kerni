import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTONES_GUIA, etiquetaGuia, guiaVisible, pideGuia } from '../web/guias.js';

test('la etiqueta dice guía, título y paso de total', () => {
  assert.equal(etiquetaGuia({ titulo: 'PC lenta', paso: 2, total: 4 }), 'Guía: PC lenta (paso 2 de 4)');
  assert.equal(etiquetaGuia(null), '');
  assert.equal(etiquetaGuia({}), '');
});

test('un título raro se devuelve tal cual: la pantalla lo pinta con textContent', () => {
  assert.equal(etiquetaGuia({ titulo: '<img src=x onerror=alert(1)>', paso: 1, total: 3 }), 'Guía: <img src=x onerror=alert(1)> (paso 1 de 3)');
});

test('hay guía solo si trae título, paso y total', () => {
  assert.equal(guiaVisible({ titulo: 'PC lenta', paso: 1, total: 4 }), true);
  assert.equal(guiaVisible(null), false);
  assert.equal(guiaVisible(undefined), false);
  assert.equal(guiaVisible({ titulo: 'PC lenta', paso: '1', total: 4 }), false);
  assert.equal(guiaVisible({ titulo: 'PC lenta', paso: 1 }), false);
});

test('se detecta el pedido de guía por su nombre, con o sin tildes', () => {
  assert.equal(pideGuia('guíame con la PC lenta'), true);
  assert.equal(pideGuia('Guiame, por favor'), true);
  assert.equal(pideGuia('ayúdame paso a paso con la impresora'), true);
  assert.equal(pideGuia('mi pc va lenta'), false);
  assert.equal(pideGuia('listo'), false);
});

test('los botones son Listo, No pude y Salir, con su respuesta de la lista cerrada', () => {
  assert.deepEqual(BOTONES_GUIA.map((b) => [b.texto, b.respuesta]), [['Listo', 'listo'], ['No pude', 'no_pude'], ['Salir', 'salir']]);
  assert.ok(Object.isFrozen(BOTONES_GUIA));
});

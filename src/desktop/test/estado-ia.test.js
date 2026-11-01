import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estadoIA, motivoDeRespuesta, TEXTO_IA } from '../web/estado-ia.js';

const conProveedor = { proveedor: 'gemini', modelo: 'gemini-3.6-flash' };

test('sin lectura de /health todavía, la etiqueta dice que comprueba', () => {
  assert.equal(estadoIA(undefined).texto, TEXTO_IA.comprobando);
});

test('backend caído: se dice sin conexión, no "Sin IA"', () => {
  assert.equal(estadoIA(null).clave, 'sin_conexion');
});

test('sin proveedor en /health: "Sin IA: respuestas locales"', () => {
  assert.equal(estadoIA({ ok: true }).texto, 'Sin IA: respuestas locales');
});

test('con proveedor y sin cupo agotado: "Con IA", con el modelo en el detalle', () => {
  const e = estadoIA(conProveedor, 'ok');
  assert.equal(e.texto, 'Con IA');
  assert.match(e.detalle, /gemini-3\.6-flash/);
  assert.equal(estadoIA(conProveedor).clave, 'con');
});

test('la última respuesta sin cupo cambia a "Cupo agotado, probá más tarde" aunque haya proveedor', () => {
  assert.equal(estadoIA(conProveedor, 'sin_cupo').texto, 'Cupo agotado, probá más tarde');
});

test('una respuesta sin cupo no oculta que no hay proveedor', () => {
  assert.equal(estadoIA({ ok: true }, 'sin_cupo').clave, 'sin');
});

test('motivoDeRespuesta: respuesta normal es ok; respaldo por cupo es sin_cupo; 503 con fallbackLocal es sin_cupo', () => {
  assert.equal(motivoDeRespuesta(true, { respuesta: 'hola', traza: [] }), 'ok');
  assert.equal(motivoDeRespuesta(true, { respuesta: 'x', traza: [{ tipo: 'respaldo', motivo: 'sin_cupo' }] }), 'sin_cupo');
  assert.equal(motivoDeRespuesta(true, { respuesta: 'x', traza: [{ tipo: 'respaldo', motivo: 'fallo' }] }), 'ok');
  assert.equal(motivoDeRespuesta(false, { error: 'cupo', fallbackLocal: true }), 'sin_cupo');
  assert.equal(motivoDeRespuesta(false, { error: 'otro' }), null);
});

test('una llave no válida se muestra como "Llave no válida", con el archivo a revisar en el detalle', () => {
  const e = estadoIA(conProveedor, 'llave_invalida');
  assert.equal(e.texto, 'Llave no válida');
  assert.equal(e.clave, 'llave_invalida');
  assert.match(e.detalle, /no es válida/);
  assert.equal(TEXTO_IA.llave_invalida, 'Llave no válida');
});

test('los otros estados no cambian con la llave: sin conexión y sin proveedor siguen igual', () => {
  assert.equal(estadoIA(null, 'llave_invalida').clave, 'sin_conexion');
  assert.equal(estadoIA({ ok: true }, 'llave_invalida').clave, 'sin');
  assert.equal(estadoIA(conProveedor, 'sin_cupo').clave, 'cupo');
  assert.equal(estadoIA(conProveedor, 'ok').clave, 'con');
});

test('motivoDeRespuesta usa codigo: llave_invalida, sin_cupo y sin_llave (que no cambia la etiqueta)', () => {
  assert.equal(motivoDeRespuesta(false, { error: 'La llave no es válida.', codigo: 'llave_invalida', fallbackLocal: undefined }), 'llave_invalida');
  assert.equal(motivoDeRespuesta(false, { error: 'Cupo.', codigo: 'sin_cupo', fallbackLocal: true }), 'sin_cupo');
  assert.equal(motivoDeRespuesta(false, { error: 'No hay llave.', codigo: 'sin_llave', fallbackLocal: true }), null);
  assert.equal(motivoDeRespuesta(false, { error: 'Sin red.', codigo: 'sin_red' }), null);
  assert.equal(motivoDeRespuesta(false, { error: 'Algo.', codigo: 'fallo' }), null);
});

test('la etiqueta existe en la ventana y se pinta con textContent, nunca con innerHTML', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../web/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="ia-chip"/);
  assert.match(main, /\$\('ia-chip'\)[\s\S]{0,80}chip\.textContent = e\.texto/);
  assert.doesNotMatch(main, /ia-chip[^\n]*innerHTML/);
});

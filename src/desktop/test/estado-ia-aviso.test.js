import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoIA } from '../web/estado-ia.js';

test('si la IA que se usa no es la pedida, el detalle lo dice (antes quedaba en silencio)', () => {
  const e = estadoIA({ ok: true, proveedor: 'gemini', modelo: 'gemini-x', aviso: 'LLM_PROVIDER=anthropic no tiene llave: uso gemini.' });
  assert.equal(e.clave, 'con');
  assert.equal(e.texto, 'Con IA');
  assert.match(e.detalle, /Modelo: gemini-x/);
  assert.match(e.detalle, /Aviso: LLM_PROVIDER=anthropic no tiene llave/);
});

test('sin aviso, el detalle sigue siendo solo el modelo', () => {
  assert.equal(estadoIA({ ok: true, proveedor: 'gemini', modelo: 'gemini-x' }).detalle, 'Modelo: gemini-x');
});

test('sin proveedor, el detalle usa el motivo del backend si lo trae, y el texto de siempre si no', () => {
  assert.match(estadoIA({ ok: true, aviso: 'LLM_PROVIDER=gemini necesita GEMINI_API_KEY.' }).detalle, /necesita GEMINI_API_KEY/);
  assert.match(estadoIA({ ok: true }).detalle, /No hay llave de IA configurada/);
  assert.equal(estadoIA({ ok: true }).clave, 'sin');
});

test('el aviso no cambia lo que dicen el cupo agotado ni la llave inválida', () => {
  const h = { ok: true, proveedor: 'gemini', modelo: 'g', aviso: 'x' };
  assert.equal(estadoIA(h, 'sin_cupo').clave, 'cupo');
  assert.equal(estadoIA(h, 'llave_invalida').clave, 'llave_invalida');
});

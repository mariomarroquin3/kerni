import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { proximoRefresco, REFRESCO_NORMAL_MS, REFRESCO_RAPIDO_MS, REINTENTOS_RAPIDOS } from '../web/estado-ia.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(AQUI, '..', 'web', 'main.js'), 'utf8').replaceAll('\r\n', '\n');

test('sin respuesta del backend (todavía arranca) se reintenta rápido; con respuesta, una vez por minuto', () => {
  assert.equal(proximoRefresco(null, 1), REFRESCO_RAPIDO_MS);
  assert.equal(proximoRefresco(null, REINTENTOS_RAPIDOS - 1), REFRESCO_RAPIDO_MS);
  assert.equal(proximoRefresco({ ok: true, proveedor: 'gemini' }, 0), REFRESCO_NORMAL_MS);
  assert.equal(proximoRefresco(undefined, 0), REFRESCO_NORMAL_MS);
});

test('si el backend no aparece en ~1 minuto, vuelve al ritmo normal (no martilla para siempre)', () => {
  assert.equal(proximoRefresco(null, REINTENTOS_RAPIDOS), REFRESCO_NORMAL_MS);
  assert.equal(proximoRefresco(null, 500), REFRESCO_NORMAL_MS);
  assert.ok(REFRESCO_RAPIDO_MS * REINTENTOS_RAPIDOS <= 90_000, 'el reintento rápido dura como mucho un minuto y medio');
  assert.ok(REFRESCO_RAPIDO_MS >= 1000 && REFRESCO_RAPIDO_MS < REFRESCO_NORMAL_MS);
});

test('cableado: main.js usa ese tiempo, cuenta los fallos y no deja dos relojes (la bienvenida también la llama)', () => {
  assert.match(main, /import \{[^}]*proximoRefresco[^}]*\} from '\.\/estado-ia\.js'/);
  assert.match(main, /intentosIA = saludIA === null \? intentosIA \+ 1 : 0;/);
  assert.match(main, /timerIA = setTimeout\(refrescarIA, proximoRefresco\(saludIA, intentosIA\)\);/);
  assert.match(main, /async function refrescarIA\(\) \{\n  clearTimeout\(timerIA\);/);
  assert.doesNotMatch(main, /setInterval\(refrescarIA/);
  assert.match(main, /alCambiar: refrescarIA/);
});

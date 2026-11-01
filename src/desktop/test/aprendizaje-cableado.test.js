// Cableado del aprendizaje: HTML, main.js y backend de acuerdo. Como los demás tests de cableado, lee los archivos con regex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8');

const html = leer('web', 'index.html');
const main = leer('web', 'main.js');
const progresoBackend = leer('..', 'backend', 'src', 'progreso.js');

/** Texto del bloque que empieza en `inicio` y termina en `fin` (para mirar un solo manejador). */
function bloque(inicio, fin) {
  const a = main.indexOf(inicio);
  const b = main.indexOf(fin, a + inicio.length);
  assert.ok(a >= 0 && b > a, `no encuentro el bloque ${inicio}`);
  return main.slice(a, b);
}

test('la tarjeta tiene el botón "¿Por qué?" y el lugar de la explicación, cerrado al nacer', () => {
  assert.match(html, /<button id="confirmar-por-que"[^>]*>¿Por qué\?<\/button>/);
  assert.match(html, /<p id="confirmar-explicacion"[^>]*\bhidden\b/);
});

test('la insignia de nivel aparece en el HUD y en el panel de memoria', () => {
  assert.equal([...html.matchAll(/data-insignia/g)].length, 2);
});

test('la explicación se pinta con textContent, nunca con innerHTML', () => {
  assert.doesNotMatch(main, /confirmar-explicacion'\)\.innerHTML/);
  assert.match(main, /exp\.textContent = explicarAccion\(accion\)/);
  assert.doesNotMatch(main, /insignia-texto'\)\.innerHTML/);
  assert.match(main, /el\.querySelector\('\.insignia-texto'\)\.textContent = texto/);
});

test('aprobar una acción no suma XP: el manejador de Aprobar no manda ningún evento', () => {
  const aprobar = bloque("$('aprobar').addEventListener", "$('rechazar').addEventListener");
  assert.doesNotMatch(aprobar, /enviarEvento/);
  const rechazar = bloque("$('rechazar').addEventListener", '// "¿Por qué?"');
  assert.doesNotMatch(rechazar, /enviarEvento/);
});

test('el front solo manda eventos de la lista cerrada del backend', () => {
  const permitidos = [...progresoBackend.match(/XP_POR_EVENTO = Object\.freeze\(\{([\s\S]*?)\}\)/)[1].matchAll(/(\w+):/g)].map((m) => m[1]);
  assert.deepEqual(permitidos.sort(), ['ayuda_leida', 'consejo_visto', 'leccion_completa']);
  const usados = [...main.matchAll(/enviarEvento\('(\w+)'\)/g)].map((m) => m[1]);
  assert.ok(usados.length >= 1);
  for (const evento of usados) assert.ok(permitidos.includes(evento), `evento sin permiso: ${evento}`);
});

test('el front habla con las rutas del backend con los mismos nombres', () => {
  assert.ok(main.includes('`${BACKEND}/progreso?device_id=${deviceId}`'));
  assert.ok(main.includes('`${BACKEND}/progreso/evento`'));
  assert.match(progresoBackend, /export const XP_POR_EVENTO/);
  assert.match(leer('..', 'backend', 'src', 'routes', 'progreso.js'), /app\.post\('\/progreso\/evento'/);
});

test('"¿Por qué?" cuenta una vez por tipo de tarjeta y día, y no depende de la opción de consejos', () => {
  const porQue = bloque("$('confirmar-por-que').addEventListener", '\n});\n');
  assert.match(porQue, /if \(consejosActivos && !ayudaContada\(hoy, accion\)\)/);
  assert.match(porQue, /enviarEvento\('ayuda_leida'\)/);
  // La explicación se muestra en cualquier caso: lo que cambia con la opción es solo el XP.
  assert.doesNotMatch(porQue.split('const hoy')[0], /consejosActivos/);
});

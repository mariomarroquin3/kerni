import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { debeMostrarBienvenida, revisarLlave, SERVICIOS, servicioPorId, textoDePrueba, textoElegida } from '../web/bienvenida.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...r) => readFileSync(join(AQUI, '..', ...r), 'utf8');

test('la bienvenida sale solo la primera vez, con el backend vivo y sin IA ya elegida', () => {
  assert.equal(debeMostrarBienvenida({ bienvenidaVista: false, proveedor: '', sinIA: false, origen: null }), true);
  assert.equal(debeMostrarBienvenida(null), false, 'sin backend no hay nada que mostrar');
  assert.equal(debeMostrarBienvenida({ bienvenidaVista: true, proveedor: '', sinIA: true }), false);
  assert.equal(debeMostrarBienvenida({ bienvenidaVista: true, proveedor: 'gemini' }), false);
  assert.equal(debeMostrarBienvenida({ bienvenidaVista: false, proveedor: 'gemini', origen: 'env' }), false, 'si el .env fija la IA, no se pregunta');
});

test('revisarLlave rechaza lo evidente y acepta una llave pegada con espacios en los bordes', () => {
  assert.equal(revisarLlave('').ok, false);
  assert.equal(revisarLlave('', { yaGuardada: true }).ok, true);
  assert.equal(revisarLlave('corta').ok, false);
  assert.equal(revisarLlave('AIzaSyEJEMPLO una dos tres cuatro').ok, false);
  assert.equal(revisarLlave('x'.repeat(401)).ok, false);
  assert.deepEqual(revisarLlave('  AIzaSyEJEMPLO-0123456789  '), { ok: true, llave: 'AIzaSyEJEMPLO-0123456789' });
});

test('los mensajes de la prueba explican qué hacer y nunca inventan éxito', () => {
  assert.equal(textoDePrueba({ ok: true }).ok, true);
  const mala = textoDePrueba({ ok: false, codigo: 'llave_invalida', error: 'La llave no es válida.' });
  assert.equal(mala.ok, false);
  assert.match(mala.texto, /copiaste completa/);
  assert.equal(textoDePrueba({ ok: false, codigo: 'sin_cupo', error: 'Sin cupo.' }).guardable, true, 'sin cupo no es una llave mala: se puede guardar');
  assert.equal(textoDePrueba({ ok: false, codigo: 'llave_invalida', error: 'x' }).guardable, false);
  assert.match(textoDePrueba(null).texto, /No pude probar/);
});

test('textoElegida nombra el servicio o dice que sigue sin IA', () => {
  assert.match(textoElegida({ proveedor: 'gemini' }), /Google Gemini/);
  assert.match(textoElegida({ sinIA: true }), /sin IA/);
});

test('los servicios de la pantalla coinciden con los del HTML y con los del backend', () => {
  const html = leer('web', 'index.html');
  const enHtml = [...html.matchAll(/name="bienvenida-servicio" value="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(enHtml, SERVICIOS.map((s) => s.id));
  const backend = readFileSync(join(AQUI, '..', '..', 'backend', 'src', 'ajustes.js'), 'utf8');
  const lista = JSON.parse(backend.match(/PROVEEDORES_AJUSTES = (\[[^\]]+\])/)[1].replaceAll("'", '"'));
  assert.deepEqual([...lista].sort(), SERVICIOS.map((s) => s.id).sort());
  assert.ok(servicioPorId('gemini'));
});

test('el cableado de la bienvenida: ids, menú, bandeja y la llave nunca va a localStorage ni a innerHTML', () => {
  const html = leer('web', 'index.html');
  const ui = leer('web', 'bienvenida-ui.js');
  const main = leer('web', 'main.js');
  const lib = leer('src-tauri', 'src', 'lib.rs');
  const usados = [...ui.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
  const faltan = [...new Set(usados)].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(faltan, [], `ids que no están en index.html: ${faltan}`);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|innerHTML|console\./);
  assert.match(html, /id="bienvenida-llave" type="password"/);
  assert.match(html, /data-menu-accion="cambiar_ia"/);
  assert.match(main, /case 'cambiar_ia'/);
  assert.match(main, /listen\('pedir-ia'/);
  assert.match(lib, /"ia" => avisar_a_kerni\(app, "pedir-ia"\)/);
  assert.match(html, /id="bienvenida"[^>]*class="[^"]*\bzona\b/, 'si no es zona, la ventana deja pasar los clics');
});

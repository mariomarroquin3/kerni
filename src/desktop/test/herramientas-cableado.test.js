// Cableado de las herramientas extra (equipo, inicio, espacio, red, actualizaciones, papelera, ajustes):
// que HTML, JS, Rust y backend estén de acuerdo. Como integracion.test.js, falla en silencio si se renombra algo en un solo lado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8');

const html = leer('web', 'index.html');
const main = leer('web', 'main.js');
const lib = leer('src-tauri', 'src', 'lib.rs');
const rust = leer('src-tauri', 'src', 'herramientas.rs');
const acciones = leer('..', 'backend', 'src', 'acciones.js');
const herramientas = leer('web', 'herramientas.js');

test('cada comando nuevo está en los dos listados de lib.rs y la interfaz lo llama', () => {
  const comandos = {
    espacio_por_carpeta: 'sistema',
    info_equipo: 'herramientas',
    programas_inicio: 'herramientas',
    cambiar_inicio: 'herramientas',
    estado_red: 'herramientas',
    actualizaciones_windows: 'herramientas',
    papelera: 'herramientas',
    vaciar_papelera: 'herramientas',
    abrir_ajuste: 'herramientas',
  };
  for (const [comando, modulo] of Object.entries(comandos)) {
    assert.equal([...lib.matchAll(new RegExp(`${modulo}::${comando},`, 'g'))].length, 2, comando);
    assert.ok(main.includes(`llamar('${comando}'`), `main.js no llama a ${comando}`);
  }
  assert.match(lib, /^mod herramientas;/m);
});

test('el panel existe, nace oculto y tiene todos los ids que usa main.js', () => {
  for (const id of ['panel', 'panel-titulo', 'panel-estado', 'panel-lista', 'panel-extra', 'panel-cerrar']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /<section id="panel"[^>]*\bhidden\b/);
});

test('el menú "Más herramientas" avisa a la interfaz y la interfaz escucha cada evento', () => {
  assert.match(lib, /Submenu::with_items\(app, "Más herramientas"/);
  const opciones = [
    ['equipo', 'pedir-equipo', 'verEquipo'],
    ['inicio', 'pedir-inicio', 'verInicio'],
    ['espacio', 'pedir-espacio', 'verEspacio'],
    ['red', 'pedir-red', 'verRed'],
    ['actualizaciones', 'pedir-actualizaciones', 'verActualizaciones'],
  ];
  for (const [item, evento, funcion] of opciones) {
    assert.ok(lib.includes(`MenuItem::with_id(app, "${item}"`), item);
    assert.ok(lib.includes(`"${item}" => avisar_a_kerni(app, "${evento}")`), item);
    assert.ok(main.includes(`listen('${evento}', ${funcion})`), evento);
  }
  // la papelera borra: desde el menú solo abre la tarjeta de confirmación, nunca vacía directo
  assert.ok(lib.includes('"papelera" => avisar_a_kerni(app, "pedir-papelera")'));
  assert.match(main, /listen\('pedir-papelera', \(\) => proponer\(\{ accion: 'vaciar_papelera'/);
});

test('cada acción que propone el modelo tiene su ejecución en la tarjeta', () => {
  for (const a of ['ver_info_equipo', 'ver_programas_inicio', 'ver_espacio_carpetas', 'ver_estado_red', 'ver_actualizaciones']) {
    assert.ok(acciones.includes(`'${a}'`), `el backend no conoce ${a}`);
    assert.match(main, new RegExp(`${a}: ver`), a);
  }
  assert.match(main, /a\.accion === 'abrir_ajuste'/);
  assert.match(main, /a\.accion === 'vaciar_papelera'/);
  assert.match(main, /a\.accion === 'cambiar_inicio'/);
  // cambiar el inicio solo lo pide la interfaz, desde su propia lista, y siempre con tarjeta
  assert.ok(!/'cambiar_inicio'|'desactivar_inicio'/.test(acciones), 'el modelo no debe poder proponer cambiar el inicio');
  assert.match(main, /cambiar_inicio: \(\{ nombre, activar \}\) => proponer\(\{ accion: 'cambiar_inicio'/);
});

test('el modelo de la PC viaja con el chat y lo que viene del sistema se pinta con textContent', () => {
  assert.match(main, /equipo: \{ fabricante: equipo\.fabricante, modelo: equipo\.modelo, so: equipo\.so \}/);
  assert.match(main, /t\.textContent = f\.titulo/);
  assert.match(main, /d\.textContent = f\.detalle/);
  assert.match(main, /p\.textContent = f\.pista\.texto/);
});

test('los ajustes de Windows son los mismos en el backend, Rust y la interfaz', () => {
  const destinos = acciones.match(/DESTINOS_AJUSTE = \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((s) => s.replaceAll("'", ''));
  assert.ok(destinos.length >= 6);
  for (const d of destinos) {
    assert.ok(rust.includes(`"${d}" => Some("ms-settings:`), `Rust no abre el ajuste ${d}`);
    assert.ok(herramientas.includes(`${d}:`), `la interfaz no nombra el ajuste ${d}`);
  }
});

test('solo lectura donde se promete: la interfaz no tiene comandos para borrar ni mover lo que lista', () => {
  assert.doesNotMatch(main, /llamar\('(borrar|eliminar|mover)/);
  // lo único que borra, además de limpiar_temporales, es vaciar_papelera, y lleva tarjeta que avisa que no se deshace
  assert.ok(herramientas.includes('no se puede deshacer'));
});

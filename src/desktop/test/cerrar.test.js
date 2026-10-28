// "Cerrar Kerni" desde el menú del clic con dos dedos no funcionaba: el menú integrado le pedía la ventana al JavaScript
// (getCurrentWindow().close()), pero la capability de Kerni no le da ese permiso, así que fallaba en silencio y la ventana
// (sin barra de título ni botón en la barra de tareas) quedaba sin forma de cerrarse. Estos tests lo vigilan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
// Los archivos pueden venir con CRLF (Windows): se normalizan para poder buscar saltos de línea.
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8').replaceAll('\r\n', '\n');

const main = leer('web', 'main.js');
const html = leer('web', 'index.html');
const lib = leer('src-tauri', 'src', 'lib.rs');
const capacidad = JSON.parse(leer('src-tauri', 'capabilities', 'default.json'));

test('cerrar y ocultar los hace Rust, no el JavaScript: la interfaz no necesita permisos de ventana', () => {
  assert.match(main, /case 'cerrar': await llamar\('salir_de_kerni'\)/);
  assert.match(main, /case 'ocultar': await llamar\('ocultar_kerni'\)/);
  // lo único que la interfaz hace con la ventana es arrastrarla (permiso allow-start-dragging)
  assert.doesNotMatch(main, /getCurrentWindow\(\)\.(close|hide|destroy|minimize)/);
  // y la capability sigue sin darle a la interfaz el cierre ni el ocultado de la ventana
  const permisos = capacidad.permissions.join(' ');
  assert.doesNotMatch(permisos, /allow-close|allow-hide|allow-destroy/);
});

test('los dos comandos están registrados en los dos listados de lib.rs', () => {
  for (const comando of ['salir_de_kerni', 'ocultar_kerni']) {
    assert.equal([...lib.matchAll(new RegExp(`${comando},`, 'g'))].length, 2, comando);
  }
  assert.match(lib, /#\[tauri::command\]\nfn salir_de_kerni\(app: AppHandle\)/);
});

test('"Cerrar Kerni" siempre cierra: si el cierre normal se cuelga, a los 3 segundos se sale a la fuerza (bandeja y menú integrado)', () => {
  assert.match(lib, /"salir" => salir\(app\)/); // la bandeja
  assert.match(lib, /fn salir_de_kerni\(app: AppHandle\) \{\n    salir\(&app\);/); // el menú integrado
  assert.match(lib, /fn salir\(app: &AppHandle\)/);
  assert.match(lib, /Duration::from_secs\(3\)\);\n\s+std::process::exit\(0\);/);
  assert.match(lib, /app\.exit\(0\);\n\}/);
});

test('el menú integrado tiene las herramientas nuevas y cada opción tiene su acción en main.js', () => {
  assert.match(html, /id="menu-mas-boton"[^>]*aria-expanded="false"/);
  assert.match(html, /<div id="menu-mas"[^>]*\bhidden\b/);
  const opciones = [...html.matchAll(/data-menu-accion="(\w+)"/g)].map((m) => m[1]);
  for (const esperada of ['metricas', 'pesados', 'limpiar', 'ocultar', 'cerrar', 'equipo', 'reporte', 'inicio', 'espacio', 'red', 'actualizaciones', 'papelera']) {
    assert.ok(opciones.includes(esperada), `falta ${esperada} en el menú`);
  }
  // toda opción del HTML tiene su `case` (si no, el clic no haría nada)
  for (const o of opciones) assert.ok(main.includes(`case '${o}'`), `main.js no maneja la opción ${o}`);
  // "Más herramientas" despliega la lista y no cierra el menú
  assert.match(main, /e\.target\.closest\('#menu-mas-boton'\)/);
  // la papelera, desde el menú, solo abre la tarjeta de confirmación
  assert.match(main, /case 'papelera':\s+if \(!pendiente\) proponer\(\{ accion: 'vaciar_papelera'/);
  assert.doesNotMatch(main, /llamar\('vaciar_papelera'\)\s*;?\s*\n\s*break/);
});

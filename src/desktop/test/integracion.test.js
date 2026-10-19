// Pruebas de cableado: que las piezas de la app (HTML, JS, Rust, Tauri, Rive) estén de acuerdo
// entre sí. Son las que fallan en silencio cuando se renombra algo en un solo lado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { modoKerni } from '../web/estado.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8');

const html = leer('web', 'index.html');
const main = leer('web', 'main.js');
const lib = leer('src-tauri', 'src', 'lib.rs');
const conf = JSON.parse(leer('src-tauri', 'tauri.conf.json'));
const capacidad = JSON.parse(leer('src-tauri', 'capabilities', 'default.json'));

test('todo id que main.js busca con $() existe en el HTML', () => {
  const usados = [...main.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(usados.length > 10, 'debería encontrar los ids que usa main.js');
  const faltan = [...new Set(usados)].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(faltan, [], `ids que no están en index.html: ${faltan}`);
});

test('todo comando de Rust que llama el front está registrado en lib.rs', () => {
  const llamados = [...main.matchAll(/llamar\('(\w+)'/g)].map((m) => m[1]);
  const registrados = lib.match(/generate_handler!\[([^\]]+)\]/)[1].split(',').map((x) => x.trim().split('::').pop()).filter(Boolean);
  assert.ok(llamados.length >= 4);
  const faltan = [...new Set(llamados)].filter((c) => !registrados.includes(c));
  assert.deepEqual(faltan, [], `comandos sin registrar: ${faltan}`);
});

test('la ventana se llama igual en tauri.conf.json, la capability y lib.rs', () => {
  const etiqueta = conf.app.windows[0].label;
  assert.equal(etiqueta, 'kerni');
  assert.deepEqual(capacidad.windows, [etiqueta]);
  assert.ok(lib.includes(`get_webview_window("${etiqueta}")`));
});

test('la ventana es transparente, sin bordes y siempre visible (es un compañero de escritorio)', () => {
  const v = conf.app.windows[0];
  assert.equal(v.transparent, true);
  assert.equal(v.decorations, false);
  assert.equal(v.alwaysOnTop, true);
  assert.equal(v.skipTaskbar, true);
});

test('se puede arrastrar a Kerni por el dibujo (el canvas cubre todo el contenedor) y no se maximiza', () => {
  // Con el atributo suelto, Tauri solo arrastra si el clic cae en el contenedor mismo, y el canvas lo tapa.
  assert.match(html, /id="mascota"[^>]*data-tauri-drag-region="deep"/);
  assert.equal(conf.app.windows[0].maximizable, false);
  assert.ok(capacidad.permissions.includes('core:window:allow-start-dragging'));
});

test('el CSP deja hablar con el backend y cargar el motor de Rive, y nada más', () => {
  const csp = conf.app.security.csp;
  assert.match(csp, /connect-src[^;]*http:\/\/127\.0\.0\.1:8788/);
  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/);
  assert.match(csp, /worker-src[^;]*blob:/);
  const scripts = csp.match(/script-src ([^;]+)/)[1].trim();
  assert.equal(scripts, "'self' 'wasm-unsafe-eval'", 'script-src no debe permitir inline ni eval');
  assert.doesNotMatch(csp, /https?:\/\/(?!127\.0\.0\.1|localhost)/, 'el CSP no debe abrir hosts externos');
});

test('el puerto del backend coincide entre la app, el .env.example y el CSP', () => {
  const puertoApp = main.match(/BACKEND = 'http:\/\/127\.0\.0\.1:(\d+)'/)[1];
  const env = readFileSync(join(AQUI, '..', '..', 'backend', '.env.example'), 'utf8');
  assert.equal(env.match(/^PORT=(\d+)/m)[1], puertoApp);
  assert.ok(conf.app.security.csp.includes(`127.0.0.1:${puertoApp}`));
});

test('el puerto de Vite coincide entre vite.config.js y tauri.conf.json', () => {
  const vite = leer('vite.config.js').match(/port: (\d+)/)[1];
  assert.equal(new URL(conf.build.devUrl).port, vite);
});

test('el rig de Rive existe y la app y la carpeta del personaje tienen el mismo archivo', () => {
  const enApp = join(AQUI, '..', 'web', 'assets', 'kerni.riv');
  const enPersonaje = join(AQUI, '..', 'personaje', 'kerni-rive', 'kerni.riv');
  assert.ok(existsSync(enApp) && existsSync(enPersonaje));
  assert.ok(readFileSync(enApp).equals(readFileSync(enPersonaje)), 'kerni.riv de la app no coincide con el del personaje: copiá el último');
  assert.equal(readFileSync(enApp).subarray(0, 4).toString('latin1'), 'RIVE', 'no parece un .riv');
});

test('todos los modos que puede pedir la app existen en el rig', () => {
  const construir = leer('personaje', 'kerni-rive', 'fuente', 'construir.py');
  const modosRig = JSON.parse(construir.match(/MODOS = (\[[^\]]+\])/)[1]);
  const posibles = new Set([
    modoKerni({}), modoKerni({ panico: true }), modoKerni({ alerta: true }), modoKerni({ analizando: true }),
    modoKerni({ reaccion: true }), modoKerni({ dormido: true }),
    modoKerni({ carga: 'alta' }), modoKerni({ carga: 'media' }), modoKerni({ carga: 'baja' }),
  ]);
  for (const m of posibles) assert.ok(modosRig.includes(m), `la app pide el modo "${m}" y el rig no lo tiene`);
  const character = leer('web', 'character.js');
  for (const dato of ["'modo'", "'saludar'", "'mirar_x'", "'mirar_y'", "stateMachine: 'kerni'"]) {
    assert.ok(character.includes(dato), `character.js no usa ${dato}`);
  }
});

test('el rig compilado trae los nombres que usa character.js', () => {
  const riv = readFileSync(join(AQUI, '..', 'web', 'assets', 'kerni.riv')).toString('latin1');
  for (const nombre of ['kerni', 'Kerni', 'modo', 'saludar', 'mirar_x', 'mirar_y', 'idle', 'sonriente', 'asustado', 'research', 'dormido', 'alerta', 'neutro', 'aburrido']) {
    assert.ok(riv.includes(nombre), `el .riv no contiene "${nombre}"`);
  }
});

test('lo que dice el modelo se pinta con textContent, nunca con innerHTML', () => {
  assert.doesNotMatch(main, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('ocultar métricas: el botón y el contenedor existen y la preferencia se guarda de forma segura', () => {
  assert.match(html, /id="metricas"/);
  assert.match(html, /id="alternar-metricas"/);
  // el botón de limpiar sigue visible aunque se oculten las barras
  assert.ok(html.indexOf('id="limpiar"') > html.indexOf('id="metricas"'));
  assert.doesNotMatch(html.match(/<div id="metricas">[\s\S]*?<\/div>\s*<div class="hud-pie">/)?.[0] ?? '', /id="limpiar"/);
  // localStorage puede fallar (ventana privada, bloqueado): siempre dentro de try/catch
  assert.match(main, /try \{ return localStorage\.getItem/);
  assert.match(main, /try \{ localStorage\.setItem/);
});

test('la transparencia en reposo está en el CSS y la activa solo el atributo data-reposo', () => {
  const css = leer('web', 'style.css');
  assert.match(css, /body\[data-reposo='1'\] #mascota \{ opacity: 0\.6/);
  assert.match(main, /dataset\.reposo/);
});

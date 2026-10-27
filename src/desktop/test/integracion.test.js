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

test('las métricas están 100% ocultas al arrancar y se ven desde el menú del clic con dos dedos', () => {
  // toda la sección (barras y botones) nace oculta
  assert.match(html, /<section id="hud"[^>]*\bhidden\b/);
  assert.match(html, /id="metricas"/);
  assert.match(html, /id="alternar-metricas"/);
  // el menú nativo trae las opciones y avisa a la interfaz con eventos
  const lib = leer('src-tauri', 'src', 'lib.rs');
  assert.match(lib, /MenuItem::with_id\(app, "metricas"/);
  assert.match(lib, /"metricas" => avisar_a_kerni\(app, "alternar-metricas"\)/);
  assert.match(lib, /"limpiar" => avisar_a_kerni\(app, "pedir-limpiar"\)/);
  assert.match(lib, /fn menu_contextual\(ventana: WebviewWindow, metricas_visibles: Option<bool>\)/);
  assert.match(main, /listen\('alternar-metricas'/);
  assert.match(main, /listen\('pedir-limpiar'/);
  assert.match(main, /llamar\('menu_contextual', \{ metricasVisibles:/);
  // la limpieza desde el menú sigue pasando por la tarjeta de confirmación
  assert.match(main, /function pedirLimpieza\(\) \{\s*proponer\(\{ accion: 'limpiar_temporales'/);
  // y no se recuerda entre sesiones: siempre vuelve a empezar oculta
  assert.doesNotMatch(main, /kerni\.metricas/);
});

test('archivos pesados sin uso: comandos registrados, panel, menú y acción de la tarjeta', () => {
  for (const comando of ['archivos_pesados', 'mostrar_en_carpeta']) {
    // los dos listados de comandos de lib.rs (Linux y el resto) los registran
    assert.equal([...lib.matchAll(new RegExp('sistema::' + comando + ',', 'g'))].length, 2, comando);
    assert.ok(main.includes("llamar('" + comando + "'"), 'main.js no llama a ' + comando);
  }
  for (const id of ['archivos', 'archivos-estado', 'archivos-lista', 'archivos-cerrar']) assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(html, /<section id="archivos"[^>]*\bhidden\b/);
  assert.match(lib, /MenuItem::with_id\(app, "pesados"/);
  assert.match(lib, /"pesados" => avisar_a_kerni\(app, "pedir-archivos"\)/);
  assert.match(main, /listen\('pedir-archivos', buscarArchivosPesados\)/);
  // la acción propuesta por el modelo tiene su texto de confirmación y su ejecución (si no, caería en "borrar temporales")
  assert.match(main, /if \(a\.accion === 'ver_archivos_pesados'\) return/);
  assert.match(main, /else if \(a\.accion === 'ver_archivos_pesados'\) \{\s*await buscarArchivosPesados\(\)/);
  // solo lectura: la interfaz no tiene ningún comando para borrar lo que lista
  assert.doesNotMatch(main, /llamar\('(borrar|eliminar|mover)/);
  // lo que viene del disco se pinta con textContent (ya lo exige otro test: sin innerHTML)
  assert.match(main, /nombre\.textContent = a\.esCarpeta/);
});

test('el globo de texto dura lo que tarda leerse, no se cierra con el puntero encima y un clic lo cierra', () => {
  assert.match(main, /setTimeout\(ocultarGlobo, duracionGlobo\(texto, ms\)\)/);
  assert.match(main, /\$\('globo'\)\.addEventListener\('mouseenter'/);
  assert.match(main, /\$\('globo'\)\.addEventListener\('click'/);
});

test('la transparencia en reposo está en el CSS y la activa solo el atributo data-reposo', () => {
  const css = leer('web', 'style.css');
  assert.match(css, /body\[data-reposo='1'\] #mascota \{ opacity: 0\.6/);
  assert.match(main, /dataset\.reposo/);
});

test('la cara por carga sale de la BATERÍA, no de la CPU', () => {
  assert.match(main, /nivelCarga\.actualizar\(m\.bateria\.porcentaje\)/);
  assert.doesNotMatch(main, /nivelCarga\.actualizar\(m\.cpu\)/);
  const rust = leer('src-tauri', 'src', 'sistema.rs');
  assert.match(rust, /pub bateria: Option<Bateria>/);
  assert.match(rust, /GetSystemPowerStatus/);
});

test('la memoria: el front manda un device_id al chat y solo guarda recuerdos tras aprobarlos', () => {
  assert.match(main, /device_id: deviceId/);
  assert.match(main, /localStorage\.setItem\(clave, id\)/);
  // el recuerdo se propone en la tarjeta; el POST a /memoria/hechos vive solo en ejecutar() (clic en Aprobar)
  assert.equal([...main.matchAll(/\/memoria\/hechos/g)].length, 1);
  assert.match(main, /async function ejecutar\(a\) \{\s*if \(a\.accion === 'recordar'\)/);
  // la salud solo se manda desde la app real, nunca con los datos de demostración
  assert.match(main, /if \(enTauri && deviceId\) \{\s*setInterval/);
  const env = readFileSync(join(AQUI, '..', '..', 'backend', '.env.example'), 'utf8');
  assert.match(env, /^SUPABASE_URL=/m);
  assert.match(env, /^SUPABASE_SECRET_KEY=/m);
});

test('el saludo cubre todas las propiedades que tocan los modos (si no, se apilan las caras)', () => {
  // Regresión: el saludo solo apagaba las caras viejas y el modo nuevo (aburrido, neutro...) quedaba debajo.
  const escena = leer('personaje', 'kerni-rive', 'fuente', 'scene.rml');
  const animaciones = {};
  for (const [, nombre, cuerpo] of escena.matchAll(/<LinearAnimation[^>]*name="(\w+)"[^>]*>([\s\S]*?)<\/LinearAnimation>/g)) {
    const claves = new Set();
    for (const [, objeto, props] of cuerpo.matchAll(/<KeyedObject objectId="([^"]+)">([\s\S]*?)<\/KeyedObject>/g)) {
      for (const [, k] of props.matchAll(/propertyKey="(\d+)"/g)) claves.add(`${objeto}:${k}`);
    }
    animaciones[nombre] = claves;
  }
  const saludo = animaciones.saludo;
  assert.ok(saludo && saludo.size > 20, 'el saludo debería tener muchas propiedades con claves');
  for (const modo of ['idle', 'sonriente', 'asustado', 'research', 'dormido', 'alerta', 'neutro', 'aburrido']) {
    assert.ok(animaciones[modo], `no encuentro la animación del modo ${modo} en scene.rml (¿corriste construir.py?)`);
    const faltan = [...animaciones[modo]].filter((c) => !saludo.has(c));
    assert.deepEqual(faltan, [], `el modo ${modo} toca propiedades que el saludo no cubre: ${faltan.join(', ')}`);
  }
});

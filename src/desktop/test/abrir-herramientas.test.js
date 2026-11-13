// abrir_ajuste ampliado y abrir_herramienta: que backend, Rust e interfaz usen las mismas listas cerradas,
// y que los pedidos cortos se reconozcan sin abrir nada de más.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { accionLocalNueva } from '../web/intenciones.js';
import { AJUSTES, HERRAMIENTAS_WINDOWS, describirNueva } from '../web/herramientas.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8').replaceAll('\r\n', '\n');
const main = leer('web', 'main.js');
const lib = leer('src-tauri', 'src', 'lib.rs');
const rust = leer('src-tauri', 'src', 'herramientas.rs');
const acciones = leer('..', 'backend', 'src', 'acciones.js');

const comillas = (texto) => [...texto.matchAll(/'(\w+)'/g)].map((m) => m[1]);

test('las herramientas de Windows son las mismas en el backend, Rust y la interfaz', () => {
  const backend = comillas(acciones.match(/HERRAMIENTAS_WINDOWS = \[([^\]]+)\]/)[1]);
  assert.deepEqual(backend, ['administrador_tareas', 'administrador_dispositivos', 'liberador_espacio']);
  assert.deepEqual(Object.keys(HERRAMIENTAS_WINDOWS), backend);
  for (const h of backend) assert.ok(rust.includes(`"${h}" => Some((`), `Rust no abre ${h}`);
  // programas fijos de System32, sin rutas ni argumentos que vengan de afuera
  assert.match(rust, /"administrador_tareas" => Some\(\("taskmgr\.exe", &\[\]\)\)/);
  assert.match(rust, /"administrador_dispositivos" => Some\(\("mmc\.exe", &\["devmgmt\.msc"\]\)\)/);
  assert.match(rust, /"liberador_espacio" => Some\(\("cleanmgr\.exe", &\[\]\)\)/);
  assert.match(rust, /join\("System32"\)\.join\(programa\)/);
});

test('abrir_herramienta está registrado dos veces en lib.rs, la interfaz lo llama con tarjeta y no corre sin aprobar', () => {
  assert.equal([...lib.matchAll(/herramientas::abrir_herramienta,/g)].length, 2);
  assert.match(main, /a\.accion === 'abrir_herramienta'/);
  assert.match(main, /llamar\('abrir_herramienta', \{ herramienta: a\.herramienta \}\)/);
  assert.ok(describirNueva({ accion: 'abrir_herramienta', herramienta: 'administrador_tareas' }).includes('Administrador de tareas'));
  assert.ok(describirNueva({ accion: 'abrir_herramienta', herramienta: 'liberador_espacio' }).startsWith('¿Abro'));
});

test('cada pantalla de Configuración tiene nombre en la interfaz y dirección ms-settings en Rust', () => {
  const destinos = comillas(acciones.match(/DESTINOS_AJUSTE = \[([^\]]+)\]/)[1]);
  assert.ok(destinos.length >= 20);
  assert.deepEqual(Object.keys(AJUSTES).sort(), [...destinos].sort());
  for (const d of destinos) assert.match(rust, new RegExp(`"${d}" => Some\\("ms-settings:[a-z-]+"\\)`), d);
  // privacidad y cuentas no se abren desde Kerni
  assert.doesNotMatch(rust, /=> Some\("ms-settings:(privacy|accounts|emailandaccounts|signinoptions|yourinfo)/);
});

test('pedidos cortos de pantallas de Configuración', () => {
  const casos = {
    'abre la pantalla': 'pantalla',
    'abrime el sonido': 'sonido',
    'abre bluetooth': 'bluetooth',
    'abre las impresoras': 'impresoras',
    'abre el wifi': 'wifi',
    'abre la barra de tareas': 'barra_tareas',
    'llevame a fecha y hora': 'fecha_hora',
    'abre la configuracion de sonido': 'sonido',
    'mostrame la seguridad de windows': 'seguridad_windows',
    'abre el solucionador de problemas': 'solucionador',
  };
  for (const [frase, destino] of Object.entries(casos)) {
    const r = accionLocalNueva(frase);
    assert.equal(r?.proponer?.accion, 'abrir_ajuste', frase);
    assert.equal(r.proponer.destino, destino, frase);
  }
});

test('pedidos cortos de herramientas de Windows', () => {
  const casos = {
    'abre el administrador de tareas': 'administrador_tareas',
    'abrime el administrador de dispositivos': 'administrador_dispositivos',
    'abre el liberador de espacio': 'liberador_espacio',
    'abre la limpieza de disco': 'liberador_espacio',
  };
  for (const [frase, herramienta] of Object.entries(casos)) {
    const r = accionLocalNueva(frase);
    assert.equal(r?.proponer?.accion, 'abrir_herramienta', frase);
    assert.equal(r.proponer.herramienta, herramienta, frase);
  }
});

test('lo ambiguo, largo o negado no abre nada: que conteste el modelo', () => {
  for (const frase of [
    'abre la pantalla completa de este juego',
    'como cambio el brillo de la pantalla',
    'no abras el administrador de tareas',
    'abre el administrador de tareas y cierra chrome',
    'abre la configuracion de privacidad',
    'abre mis cuentas',
    'abre el registro de windows',
  ]) {
    const r = accionLocalNueva(frase);
    assert.ok(!r || (r.proponer?.accion !== 'abrir_herramienta' && !['pantalla', 'cuentas'].includes(r.proponer?.destino)), frase);
  }
});

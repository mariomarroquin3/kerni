// Consejos y "¿Por qué?": cada tarjeta tiene su explicación, los consejos son de texto corto y sin emojis.
// Como los demás tests de cableado, lee acciones.js con regex (el front no importa el backend).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONSEJOS, proximosConsejos, siguienteConsejo } from '../web/consejos.js';
import { EXPLICACIONES, explicarAccion } from '../web/explicaciones.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8');

const SIN_EMOJI = /\p{Extended_Pictographic}/u;

/** Nombres de ACCIONES en el backend (lista cerrada que el modelo puede proponer). */
function accionesDelBackend() {
  const fuente = leer('..', 'backend', 'src', 'acciones.js');
  const bloque = fuente.match(/export const ACCIONES = \[([\s\S]*?)\];/)[1];
  return [...bloque.matchAll(/'(\w+)'/g)].map((m) => m[1]);
}

/** Tipos de tarjeta que describe herramientas.js (cada `case` de describirNueva). */
function tiposDeHerramientas() {
  const fuente = leer('web', 'herramientas.js');
  return [...fuente.matchAll(/case '(\w+)':/g)].map((m) => m[1]);
}

test('cada acción de ACCIONES (backend) tiene su "¿Por qué?"', () => {
  for (const accion of accionesDelBackend()) {
    assert.ok(explicarAccion(accion), `falta la explicación de ${accion}`);
  }
});

test('cada tipo de tarjeta de herramientas.js y las que arma main.js tienen explicación', () => {
  const tipos = [...tiposDeHerramientas(), 'recordar', 'cambiar_inicio', 'reanudar_proceso'];
  assert.ok(tipos.length >= 19, 'el regex no encontró los casos de herramientas.js');
  for (const tipo of tipos) assert.ok(explicarAccion(tipo), `falta la explicación de ${tipo}`);
});

test('no hay explicaciones de acciones que no existen (el diccionario no se pudre)', () => {
  const conocidas = new Set([...accionesDelBackend(), ...tiposDeHerramientas(), 'recordar', 'cambiar_inicio', 'reanudar_proceso']);
  for (const clave of Object.keys(EXPLICACIONES)) assert.ok(conocidas.has(clave), `sobra la explicación ${clave}`);
});

test('las explicaciones son de una o dos frases, sin emojis y sin texto vacío', () => {
  for (const [accion, texto] of Object.entries(EXPLICACIONES)) {
    assert.ok(texto.length >= 40 && texto.length <= 320, `${accion}: largo ${texto.length}`);
    assert.doesNotMatch(texto, SIN_EMOJI, accion);
    assert.match(texto, /[.!?]$/, `${accion} debe terminar con puntuación`);
    const frases = texto.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    assert.ok(frases <= 2, `${accion} tiene ${frases} frases`);
  }
});

test('las explicaciones de lo que cambia dicen qué NO hace', () => {
  // Las acciones que borran o cambian algo deben decir qué queda intacto.
  for (const accion of ['terminar_proceso', 'limpiar_cache_navegador', 'vaciar_papelera', 'limpiar_temporales', 'congelar_proceso', 'cambiar_inicio']) {
    assert.match(EXPLICACIONES[accion], /\b(no|No|nunca|ni)\b|Lo podés|No se puede/, accion);
  }
});

test('los consejos son 20, con id único, cortos y sin emojis', () => {
  assert.equal(CONSEJOS.length, 20);
  assert.equal(new Set(CONSEJOS.map((c) => c.id)).size, CONSEJOS.length);
  for (const c of CONSEJOS) {
    assert.ok(c.texto.length >= 40 && c.texto.length <= 300, `${c.id}: largo ${c.texto.length}`);
    assert.doesNotMatch(c.texto, SIN_EMOJI, c.id);
    const frases = c.texto.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    assert.ok(frases <= 2, `${c.id} tiene ${frases} frases`);
  }
});

test('siguienteConsejo da el primero no visto y null cuando ya están todos', () => {
  assert.equal(siguienteConsejo([]).id, 'c01');
  assert.equal(siguienteConsejo(['c01', 'c02']).id, 'c03');
  assert.equal(siguienteConsejo(['c03']).id, 'c01');
  const todos = CONSEJOS.map((c) => c.id);
  assert.equal(siguienteConsejo(todos), null);
});

test('proximosConsejos da hasta n consejos no vistos, en orden', () => {
  assert.deepEqual(proximosConsejos(['c02'], 3).map((c) => c.id), ['c01', 'c03', 'c04']);
  assert.deepEqual(proximosConsejos(CONSEJOS.slice(0, 19).map((c) => c.id), 3).map((c) => c.id), ['c20']);
  assert.deepEqual(proximosConsejos(CONSEJOS.map((c) => c.id)), []);
});

test('explicarAccion no devuelve nada para una acción desconocida', () => {
  assert.equal(explicarAccion('borrar_todo'), null);
  assert.equal(explicarAccion('constructor'), null);
});

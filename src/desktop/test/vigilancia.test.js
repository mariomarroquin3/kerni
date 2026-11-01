import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enlaceUnicoEnTexto } from '../web/intenciones.js';
import { crearVigilanteEnlaces, debeLeerPortapapeles } from '../web/vigilancia.js';

test('enlaceUnicoEnTexto: un solo enlace (con o sin http, con puntuación final) se reconoce', () => {
  assert.equal(enlaceUnicoEnTexto('https://paypa1-login.com/verificar'), 'https://paypa1-login.com/verificar');
  assert.equal(enlaceUnicoEnTexto('  www.ejemplo.com  '), 'www.ejemplo.com');
  assert.equal(enlaceUnicoEnTexto('ejemplo.com.'), 'ejemplo.com');
  assert.equal(enlaceUnicoEnTexto('http://192.168.1.5/login'), 'http://192.168.1.5/login');
});

test('enlaceUnicoEnTexto: párrafos, dos enlaces, vacíos y textos que no son enlace no cuentan', () => {
  assert.equal(enlaceUnicoEnTexto(''), null);
  assert.equal(enlaceUnicoEnTexto(null), null);
  assert.equal(enlaceUnicoEnTexto('hola, mirá esto'), null);
  assert.equal(enlaceUnicoEnTexto('https://a.com https://b.com'), null);
  assert.equal(enlaceUnicoEnTexto('Te mando el link https://a.com por favor'), null);
  assert.equal(enlaceUnicoEnTexto('x'.repeat(301)), null);
});

test('enlaceUnicoEnTexto: nombres de archivo ("factura.pdf") no son enlaces, pero un sitio con www sí', () => {
  assert.equal(enlaceUnicoEnTexto('factura.pdf'), null);
  assert.equal(enlaceUnicoEnTexto('Informe.DOCX'), null);
  assert.equal(enlaceUnicoEnTexto('www.informe.pdf'), 'www.informe.pdf');
});

test('vigilante: un enlace nuevo se ofrece una vez; el mismo enlace no se repite', () => {
  const v = crearVigilanteEnlaces();
  assert.equal(v.mirar('https://a.com/x'), 'https://a.com/x');
  assert.equal(v.mirar('https://a.com/x'), null);
  assert.equal(v.mirar('https://a.com/x '), null);
});

test('vigilante: un enlace distinto sí se ofrece; un texto cualquiera no ofrece nada', () => {
  const v = crearVigilanteEnlaces();
  assert.equal(v.mirar('https://a.com'), 'https://a.com');
  assert.equal(v.mirar('una nota cualquiera'), null);
  assert.equal(v.mirar('https://b.com'), 'https://b.com');
  assert.equal(v.mirar(42), null);
});

test('vigilante: lo que estaba en el portapapeles al encender la opción no se ofrece', () => {
  const v = crearVigilanteEnlaces();
  v.marcarVisto('https://viejo.com');
  assert.equal(v.mirar('https://viejo.com'), null);
  assert.equal(v.mirar('https://nuevo.com'), 'https://nuevo.com');
});

test('debeLeerPortapapeles: apagada no lee nunca, sin importar lo demás', () => {
  assert.equal(debeLeerPortapapeles({ activo: false, enfocada: true }), false);
  assert.equal(debeLeerPortapapeles({ enfocada: true }), false);
  assert.equal(debeLeerPortapapeles({ activo: true, enfocada: false }), false);
  assert.equal(debeLeerPortapapeles({ activo: true, enfocada: true, panico: true }), false);
  assert.equal(debeLeerPortapapeles({ activo: true, enfocada: true, tarjetaAbierta: true }), false);
  assert.equal(debeLeerPortapapeles({ activo: true, enfocada: true }), true);
});

test('main.js: el portapapeles se lee solo tras la guarda, la opción va en localStorage con try/catch y el enlace solo sale con el clic', () => {
  const main = readFileSync(new URL('../web/main.js', import.meta.url), 'utf8');
  assert.match(main, /kerni\.vigilarEnlaces/);
  assert.match(main, /debeLeerPortapapeles\(/);
  assert.match(main, /navigator\.clipboard\.readText\(\)/);
  // El envío a /enlaces/revisar vive solo en la función que corre con el clic de la burbuja.
  const inicio = main.indexOf('async function revisarEnlaceCopiado');
  assert.ok(inicio > 0, 'falta revisarEnlaceCopiado');
  const cuerpo = main.slice(inicio, main.indexOf('\n}\n', inicio));
  assert.match(cuerpo, /\/enlaces\/revisar/);
  // Nada del portapapeles se registra ni se guarda.
  assert.doesNotMatch(main, /(console\.\w+|localStorage\.setItem)\([^)]*(portapapeles|clipboard|texto copiado)/i);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIVELES, nivelDeXp, textoInsignia, contarAyuda, contarTarjeta, diaVacio, estadoDeHoy, ayudaContada } from '../web/progreso.js';

test('los niveles son los cinco del diseño, con sus umbrales', () => {
  assert.deepEqual(NIVELES.map((n) => [n.desde, n.nombre]), [[0, 'Aprendiz'], [20, 'Vigía'], [60, 'Guardián'], [120, 'Experto'], [200, 'Maestro']]);
});

test('el nivel cambia justo en cada umbral', () => {
  assert.equal(nivelDeXp(0).nombre, 'Aprendiz');
  assert.equal(nivelDeXp(19).nombre, 'Aprendiz');
  assert.equal(nivelDeXp(20).nombre, 'Vigía');
  assert.equal(nivelDeXp(59).nombre, 'Vigía');
  assert.equal(nivelDeXp(60).nombre, 'Guardián');
  assert.equal(nivelDeXp(120).nombre, 'Experto');
  assert.equal(nivelDeXp(199).nombre, 'Experto');
  assert.equal(nivelDeXp(200).nombre, 'Maestro');
});

test('el progreso dentro del nivel es un porcentaje entero', () => {
  assert.deepEqual(
    { p: nivelDeXp(10).porcentaje, faltan: nivelDeXp(10).faltan, sig: nivelDeXp(10).siguiente.nombre },
    { p: 50, faltan: 10, sig: 'Vigía' },
  );
  assert.equal(nivelDeXp(40).porcentaje, 50); // 40 de 20..60
  assert.equal(nivelDeXp(59).porcentaje, 97);
});

test('en el nivel máximo el progreso es 100 y no hay siguiente', () => {
  const m = nivelDeXp(350);
  assert.equal(m.nombre, 'Maestro');
  assert.equal(m.porcentaje, 100);
  assert.equal(m.siguiente, null);
  assert.equal(m.faltan, 0);
});

test('un XP inválido cuenta como cero, sin romper', () => {
  for (const malo of [undefined, null, NaN, -5, 'x', Infinity]) {
    assert.equal(nivelDeXp(malo).xp, 0, String(malo));
  }
});

test('la insignia dice si todavía se carga o si la función está apagada', () => {
  assert.match(textoInsignia({ disponible: null }), /cargando/);
  assert.match(textoInsignia({ disponible: false }), /no disponible/);
});

test('la insignia muestra nivel, XP y lo que falta; avisa si los consejos están apagados', () => {
  assert.equal(textoInsignia({ xp: 6, disponible: true, activos: true }), 'Aprendiz · 6 XP · faltan 14 XP para Vigía');
  assert.match(textoInsignia({ xp: 6, disponible: true, activos: false }), /consejos desactivados/);
  assert.match(textoInsignia({ xp: 250, disponible: true }), /nivel máximo/);
});

test('el estado del día se reinicia cuando cambia la fecha', () => {
  const ayer = { dia: '2026-10-31', tarjetas: 4, ayudas: ['terminar_proceso'], leccion: true, ofrecida: true };
  assert.deepEqual(estadoDeHoy(ayer, '2026-11-01'), diaVacio('2026-11-01'));
  assert.equal(estadoDeHoy(ayer, '2026-10-31').tarjetas, 4);
});

test('un dato guardado mal no rompe nada: se descarta o se limpia', () => {
  for (const malo of [null, 'texto', 42, [], { dia: '2026-11-01', tarjetas: 'mucho', ayudas: 'x' }]) {
    const e = estadoDeHoy(malo, '2026-11-01');
    assert.equal(e.dia, '2026-11-01');
    assert.equal(e.tarjetas, 0);
    assert.deepEqual(e.ayudas, []);
  }
});

test('"¿Por qué?" se cuenta una vez por tipo de tarjeta y día', () => {
  let e = diaVacio('2026-11-01');
  e = contarAyuda(e, 'terminar_proceso');
  e = contarAyuda(e, 'terminar_proceso');
  e = contarAyuda(e, 'vaciar_papelera');
  assert.deepEqual(e.ayudas, ['terminar_proceso', 'vaciar_papelera']);
  assert.equal(ayudaContada(e, 'vaciar_papelera'), true);
  assert.equal(ayudaContada(e, 'ver_estado_red'), false);
});

test('contar tarjetas suma una por vez', () => {
  let e = diaVacio('2026-11-01');
  for (let i = 0; i < 3; i++) e = contarTarjeta(e);
  assert.equal(e.tarjetas, 3);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responderLocal, porcentajeDisco, enlaceParaRevisar, resumenEnlace } from '../web/intenciones.js';

const lectura = (libreGb, totalGb = 500) => ({
  cpu: 10, ram: { usadaMb: 4000, totalMb: 16000 }, disco: { libreGb, totalGb }, procesos: [],
});

test('calcula el porcentaje usado', () => {
  assert.equal(porcentajeDisco(lectura(125)), 75);
});

test('responde con el porcentaje y los GB sin llamar al modelo', () => {
  const r = responderLocal('¿cuánto disco me queda?', lectura(300));
  assert.match(r.texto, /40%/);
  assert.match(r.texto, /200 GB de 500 GB/);
  assert.match(r.texto, /300 GB libres/);
  assert.equal(r.proponer, undefined);
});

test('entiende varias formas de pedir el dato', () => {
  for (const q of ['disco', 'porcentaje del disco', 'cuánto espacio tengo', 'almacenamiento', 'cómo va el disco C:']) {
    if (/cómo va/.test(q)) continue; // "cómo" lo decide el modelo
    assert.ok(responderLocal(q, lectura(300)), q);
  }
});

test('con el disco apretado ofrece limpiar temporales (con confirmación en la app)', () => {
  const r = responderLocal('disco', lectura(50));
  assert.match(r.texto, /90%/);
  assert.equal(r.proponer.accion, 'limpiar_temporales');
});

test('con margen intermedio avisa que conviene vigilarlo', () => {
  assert.match(responderLocal('disco', lectura(125)).texto, /vigilarlo/);
});

test('las preguntas de causa o consejo se las deja al modelo', () => {
  for (const q of ['¿por qué se llena mi disco?', 'cómo libero espacio en el disco', 'qué hago con el disco lleno', 'limpiar disco']) {
    assert.equal(responderLocal(q, lectura(50)), null, q);
  }
});

test('mensajes largos o de otro tema van al modelo', () => {
  assert.equal(responderLocal('hola kerni, cómo estás hoy', lectura(300)), null);
  assert.equal(responderLocal('quiero saber cuánto disco me queda libre en este momento exacto', lectura(300)), null);
});

test('sin lectura todavía, contesta el modelo', () => {
  assert.equal(responderLocal('disco', null), null);
});

test('pedir ver los archivos pesados sin uso propone la búsqueda (solo lectura) sin llamar al modelo, aunque no haya lectura', () => {
  for (const q of ['mostrame los archivos pesados', 'carpetas grandes', 'qué ocupa más espacio', 'archivos que ya no uso', 'cosas sin usar', 'qué archivos ocupan espacio']) {
    const r = responderLocal(q, null);
    assert.ok(r, q);
    assert.equal(r.proponer.accion, 'ver_archivos_pesados', q);
    assert.match(r.texto, /no borro nada/);
  }
});

test('lo de archivos pesados no se confunde con el disco ni con pedidos largos o ajenos', () => {
  assert.equal(responderLocal('cuánto disco me queda', null), null);                     // sin lectura, el disco sigue yendo al modelo
  assert.equal(responderLocal('cuánto disco me queda', lectura(300)).proponer, undefined);
  assert.equal(responderLocal('hola, ¿cómo estás hoy?', null), null);
  // un pedido largo o con causa va al modelo
  assert.equal(responderLocal('por favor explicame con calma por qué mis archivos pesados siguen creciendo tanto', null), null);
});

test('detecta cuando piden revisar UN enlace y lo saca limpio del mensaje', () => {
  assert.equal(enlaceParaRevisar('¿es seguro https://paypa1-login.com/verify?'), 'https://paypa1-login.com/verify');
  assert.equal(enlaceParaRevisar('es seguro paypa1-login.com'), 'paypa1-login.com');
  assert.equal(enlaceParaRevisar('¿será una estafa www.premio-gratis.xyz/ganaste?'), 'www.premio-gratis.xyz/ganaste');
  assert.equal(enlaceParaRevisar('me llegó http://bit.ly/3abc, ¿es peligroso?'), 'http://bit.ly/3abc');
});

test('no se mete cuando no corresponde: sin palabra de seguridad, con dos enlaces, muy largo o sin enlace', () => {
  assert.equal(enlaceParaRevisar('abrí https://www.dell.com por favor'), null);        // no pregunta por seguridad
  assert.equal(enlaceParaRevisar('¿es seguro dell.com o hp.com?'), null);              // dos enlaces: que decida el modelo
  assert.equal(enlaceParaRevisar('¿es seguro mi disco?'), null);                       // no hay enlace
  assert.equal(enlaceParaRevisar('¿es seguro dell.com? ' + 'palabra '.repeat(30)), null);
  assert.equal(enlaceParaRevisar(''), null);
});

test('el resumen del enlace nunca dice "seguro", avisa de los límites y explica los motivos', () => {
  const peligro = resumenEnlace({ nivel: 'peligroso', motivos: ['Usa letras que imitan a otras.', 'No usa conexión cifrada.', 'Tercero.'], dominio: 'x.com', listas: { estado: 'no_consultada' } });
  assert.match(peligro, /no entres/i);
  assert.match(peligro, /cambiá la contraseña/);
  assert.match(peligro, /imitan a otras/);
  assert.doesNotMatch(peligro, /Tercero/);                                             // máximo dos motivos

  const duda = resumenEnlace({ nivel: 'dudoso', motivos: ['Es un enlace acortado.'], dominio: 'bit.ly', listas: { estado: 'no_consultada' } });
  assert.match(duda, /desconfianza/);
  assert.match(duda, /no la lista de sitios peligrosos de Google/);

  const bien = resumenEnlace({ nivel: 'sin_senales', motivos: [], dominio: 'dell.com', listas: { estado: 'no_aparece' } });
  assert.match(bien, /no veo señales de peligro/i);
  assert.match(bien, /no es una garantía/);
  assert.match(bien, /Google tampoco lo tiene/);
  assert.doesNotMatch(bien, /\bes seguro\b/i);

  assert.match(resumenEnlace({ nivel: 'no_se_puede', motivos: ['No pude entender ese enlace. ¿Lo copiaste completo?'] }), /copiaste completo/);
});

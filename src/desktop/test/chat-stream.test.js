import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerRespuestaSse } from '../web/chat-stream.js';

function cuerpoSse(texto, cortes = [texto.length]) {
  const encoder = new TextEncoder();
  const partes = [];
  let inicio = 0;
  for (const corte of cortes) {
    partes.push(encoder.encode(texto.slice(inicio, corte)));
    inicio = corte;
  }
  if (inicio < texto.length) partes.push(encoder.encode(texto.slice(inicio)));
  return new ReadableStream({
    start(control) {
      for (const parte of partes) control.enqueue(parte);
      control.close();
    },
  });
}

test('lee una respuesta SSE aunque el stream use CRLF y los chunks corten eventos', async () => {
  const eventos = [
    'event: delta\r\ndata: {"text":"Hola "}\r\n\r\n',
    'event: status\r\ndata: {"herramienta":"buscar_conocimiento"}\r\n\r\n',
    'event: done\r\ndata: {"session_id":"abc","respuesta":"Hola mundo","acciones":[]}\r\n\r\n',
  ].join('');
  const cortes = [9, 23, 38, 64, 80];
  const deltas = [];
  const estados = [];

  const respuesta = await leerRespuestaSse(cuerpoSse(eventos, cortes), {
    alDelta: (texto) => deltas.push(texto),
    alEstado: (estado) => estados.push(estado),
  });

  assert.deepEqual(deltas, ['Hola ']);
  assert.deepEqual(estados, [{ herramienta: 'buscar_conocimiento' }]);
  assert.equal(respuesta.respuesta, 'Hola mundo');
});

test('informa si el backend cierra el stream sin evento final', async () => {
  const stream = cuerpoSse('event: delta\ndata: {"text":"Hola"}\n\n');
  await assert.rejects(leerRespuestaSse(stream), /antes de enviar el resultado del chat/);
});

test('no oculta un evento JSON dañado', async () => {
  const stream = cuerpoSse('event: done\ndata: {no es JSON}\n\n');
  await assert.rejects(leerRespuestaSse(stream), SyntaxError);
});

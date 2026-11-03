export async function leerRespuestaSse(body, { alDelta = () => {}, alEstado = () => {} } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let respuesta;

  function procesarBloque(bloque) {
    let evento = 'message';
    const datos = [];
    for (const linea of bloque.split(/\r?\n/)) {
      if (linea.startsWith('event:')) evento = linea.slice(6).trim();
      else if (linea.startsWith('data:')) datos.push(linea.slice(5).replace(/^ /, ''));
    }
    if (!datos.length) return;

    const parsed = JSON.parse(datos.join('\n'));
    if (evento === 'delta') {
      if (typeof parsed.text !== 'string') throw new Error('El backend envió un fragmento de chat inválido.');
      alDelta(parsed.text);
    } else if (evento === 'status') {
      alEstado(parsed);
    } else if (evento === 'done') {
      respuesta = parsed;
    } else if (evento === 'error') {
      respuesta = { error: parsed.error, codigo: parsed.codigo, fallbackLocal: parsed.fallbackLocal };
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const bloques = buffer.split(/\r?\n\r?\n/);
    buffer = bloques.pop() ?? '';
    for (const bloque of bloques) procesarBloque(bloque);
  }

  buffer += decoder.decode();
  if (buffer.trim()) procesarBloque(buffer);
  if (respuesta === undefined) {
    throw new Error('El backend cerró la respuesta antes de enviar el resultado del chat.');
  }
  return respuesta;
}

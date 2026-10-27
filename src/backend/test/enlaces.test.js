import { describe, expect, it } from 'vitest';
import { analizarEnlace, createRevisorEnlaces, dominioRegistrable, NOTA } from '../src/enlaces.js';
import { createTestApp, texto, usarTool } from './helpers.js';

const nivel = (u) => analizarEnlace(u).nivel;

describe('analizarEnlace (solo mira la dirección)', () => {
  it.each([
    ['https://www.dell.com/support/home'],
    ['https://github.com/mariomarroquin3/kerni'],
    ['https://mail.google.com/mail'],
    ['https://www.paypal.com/signin'],
    ['dell.com'],
  ])('%s: no hay señales de peligro', (u) => {
    expect(nivel(u)).toBe('sin_senales');
  });

  it.each([
    ['paypa1-login.com/verify', 'peligroso'],                              // imita a PayPal con un 1 por la l
    ['https://paypal.com.cuenta-segura.xyz/login', 'peligroso'],            // la marca al principio para engañar
    ['https://xn--pypal-4ve.com', 'peligroso'],                             // letras que imitan a otras
    ['http://192.168.1.5:8080/login', 'peligroso'],                         // IP, sin cifrar y con puerto raro
    ['javascript:alert(1)', 'peligroso'],
    ['https://bit.ly/3abc', 'dudoso'],                                      // acortado: no se ve el destino
    ['https://usuario@evil.com', 'dudoso'],                                 // el "@" esconde el destino real
    ['https://microsoft-soporte-tecnico.top', 'dudoso'],                    // marca ajena + terminación de estafa
    ['hola', 'no_se_puede'],
    ['file:///C:/Windows', 'no_se_puede'],
    ['mailto:alguien@correo.com', 'no_se_puede'],
    ['', 'no_se_puede'],
  ])('%s: %s', (u, esperado) => {
    expect(nivel(u)).toBe(esperado);
  });

  it('el mejor resultado nunca se llama "seguro" y cada nivel dudoso o peligroso trae motivos', () => {
    expect(analizarEnlace('https://www.dell.com')).toMatchObject({ nivel: 'sin_senales' });
    for (const u of ['paypa1-login.com/verify', 'https://bit.ly/3abc']) {
      const r = analizarEnlace(u);
      expect(r.motivos.length).toBeGreaterThan(0);
      expect(JSON.stringify(r)).not.toMatch(/"nivel":"seguro"/);
    }
  });

  it('avisa si le faltaba el https:// y lo revisa igual', () => {
    expect(analizarEnlace('dell.com').motivos.join(' ')).toMatch(/faltaba el "https:\/\/"/);
  });

  it('un enlace larguísimo o con basura no rompe nada', () => {
    expect(nivel('a'.repeat(5000))).toBe('no_se_puede');
    expect(nivel('https://')).toBe('no_se_puede');
    expect(nivel('<script>alert(1)</script>')).toBe('no_se_puede');
  });

  it('el dominio que se muestra viene limpio (nada de etiquetas ni saltos de línea)', () => {
    const r = analizarEnlace('https://sitio.com/');
    expect(r.dominio).toBe('sitio.com');
    expect(r.dominio).not.toMatch(/[<>\n]/);
  });

  it('calcula el dominio registrable, también con terminaciones de dos partes', () => {
    expect(dominioRegistrable('mail.google.com')).toBe('google.com');
    expect(dominioRegistrable('www.hacienda.gob.sv')).toBe('hacienda.gob.sv');
    expect(dominioRegistrable('bit.ly')).toBe('bit.ly');
  });
});

describe('createRevisorEnlaces (lista de Google opcional)', () => {
  const respuesta = (json, status = 200) => new Response(JSON.stringify(json), { status });

  it('sin llave solo revisa la dirección y lo dice; nunca llama a internet', async () => {
    let llamadas = 0;
    const revisor = createRevisorEnlaces({ fetch: async () => { llamadas++; return respuesta({}); } });
    const r = await revisor.revisar('https://www.dell.com');
    expect(r.listas.estado).toBe('no_consultada');
    expect(r.nota).toBe(NOTA);
    expect(llamadas).toBe(0);
    expect(revisor.listasDisponibles).toBe(false);
  });

  it('si Google lo tiene en su lista, es peligroso aunque la dirección parezca normal', async () => {
    const visto = [];
    const revisor = createRevisorEnlaces({
      apiKey: 'CLAVE_SECRETA',
      fetch: async (url, init) => { visto.push({ url, cuerpo: JSON.parse(init.body) }); return respuesta({ matches: [{ threatType: 'SOCIAL_ENGINEERING' }] }); },
    });
    const r = await revisor.revisar('https://sitio-normal.com/pagina');
    expect(r.nivel).toBe('peligroso');
    expect(r.motivos[0]).toMatch(/Google tiene este sitio/);
    // lo único que sale a internet es la consulta a Google; el sitio revisado no se abre
    expect(visto).toHaveLength(1);
    expect(visto[0].url).toMatch(/^https:\/\/safebrowsing\.googleapis\.com\//);
    expect(visto[0].cuerpo.threatInfo.threatEntries).toEqual([{ url: 'https://sitio-normal.com/pagina' }]);
  });

  it('si Google no lo tiene, queda el nivel de la dirección y se anota que no apareció', async () => {
    const revisor = createRevisorEnlaces({ apiKey: 'k', fetch: async () => respuesta({}) });
    const r = await revisor.revisar('https://www.dell.com');
    expect(r.nivel).toBe('sin_senales');
    expect(r.listas.estado).toBe('no_aparece');
  });

  it('si la consulta falla (red, 403, tiempo) no rompe y no filtra la llave', async () => {
    for (const fetch of [async () => { throw new Error('sin red https://x?key=CLAVE_SECRETA'); }, async () => respuesta({ error: 'key CLAVE_SECRETA' }, 403)]) {
      const r = await createRevisorEnlaces({ apiKey: 'CLAVE_SECRETA', fetch }).revisar('https://www.dell.com');
      expect(r.listas.estado).toBe('error');
      expect(JSON.stringify(r)).not.toContain('CLAVE_SECRETA');
    }
  });

  it('no consulta a Google lo que ni siquiera es un enlace', async () => {
    let llamadas = 0;
    const revisor = createRevisorEnlaces({ apiKey: 'k', fetch: async () => { llamadas++; return respuesta({}); } });
    expect((await revisor.revisar('hola')).nivel).toBe('no_se_puede');
    expect(llamadas).toBe(0);
  });
});

describe('herramienta revisar_enlace y ruta /enlaces/revisar', () => {
  it('el modelo la pide y recibe el nivel y los motivos, sin acciones propuestas', async () => {
    const { app, anthropic } = createTestApp({
      respuestas: [usarTool('revisar_enlace', { url: 'paypa1-login.com/verify' }), texto('Ese enlace no me gusta nada, no pongas tus datos ahí.')],
    });
    const res = (await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: '¿es seguro paypa1-login.com/verify?' } })).json();
    expect(res.acciones).toEqual([]);
    expect(res.traza.find((t) => t.nombre === 'revisar_enlace')).toMatchObject({ ok: true, nivel: 'peligroso' });
    const resultado = JSON.parse(anthropic.messages.create.llamadas[1].messages.at(-1).content[0].content);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.nota).toBe(NOTA);
    expect(resultado.motivos.length).toBeGreaterThan(0);
  });

  it('el modelo la ve siempre entre sus herramientas y limita a 3 revisiones por turno', async () => {
    const cuatro = { stop_reason: 'tool_use', content: ['a', 'b', 'c', 'd'].map((id) => ({ type: 'tool_use', id, name: 'revisar_enlace', input: { url: 'https://www.dell.com' } })) };
    const { app, anthropic } = createTestApp({ respuestas: [cuatro, texto('Listo.')] });
    await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'revisá estos enlaces por favor' } });
    expect(anthropic.messages.create.llamadas[0].tools.map((t) => t.name)).toContain('revisar_enlace');
    const resultados = anthropic.messages.create.llamadas[1].messages.at(-1).content;
    expect(resultados.map((r) => Boolean(r.is_error))).toEqual([false, false, false, true]);
  });

  it('argumentos inválidos devuelven error al modelo, no un fallo', async () => {
    const { app, anthropic } = createTestApp({ respuestas: [usarTool('revisar_enlace', {}), texto('Mandame el enlace completo.')] });
    const res = await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'es seguro?' } });
    expect(res.statusCode).toBe(200);
    expect(anthropic.messages.create.llamadas[1].messages.at(-1).content[0].is_error).toBe(true);
  });

  it('POST /enlaces/revisar contesta sin modelo, valida la entrada y tiene tope de uso', async () => {
    const { app } = createTestApp();
    const post = (url) => app.inject({ method: 'POST', url: '/enlaces/revisar', payload: { url } });
    const bueno = await post('https://paypal.com.cuenta-segura.xyz/login');
    expect(bueno.statusCode).toBe(200);
    expect(bueno.json()).toMatchObject({ nivel: 'peligroso', listas: { estado: 'no_consultada' } });
    expect((await post('')).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/enlaces/revisar', payload: {} })).statusCode).toBe(400);
    expect((await post('x'.repeat(2001))).statusCode).toBe(400);
    let ultimo;
    for (let i = 0; i < 35; i++) ultimo = await post('https://www.dell.com');
    expect(ultimo.statusCode).toBe(429);
  });
});

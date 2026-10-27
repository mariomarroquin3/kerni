import { limpiarNombre } from './telemetria.js';

/**
 * Revisión de enlaces: mira la DIRECCIÓN, nunca entra al sitio. Dos fuentes:
 *  1) señales de la propia dirección (HTTP, IP, acortadores, letras que imitan a otras, marcas imitadas...);
 *  2) opcional: la lista de sitios peligrosos de Google Safe Browsing (hace falta una llave gratuita).
 * Ninguna revisión garantiza que un sitio sea seguro: por eso el mejor resultado se llama `sin_senales`,
 * no "seguro". Todo lo que se pega acá es dato no confiable.
 */
export const MAX_ENLACE = 2000;
export const NOTA = 'Ninguna revisión garantiza que un sitio sea seguro: esto solo mira la dirección y, si hay llave, la lista de sitios peligrosos de Google.';

const ACORTADORES = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'bit.do']);
const TLD_SOSPECHOSOS = new Set(['zip', 'mov', 'xyz', 'top', 'click', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'support', 'loan', 'rest', 'country', 'kim', 'men', 'icu', 'cyou']);
const PALABRAS_DE_ENGANO = ['login', 'signin', 'verify', 'verificar', 'secure', 'account', 'cuenta', 'update', 'actualizar', 'confirm', 'wallet', 'password', 'clave', 'soporte', 'support', 'premio', 'sorteo', 'gratis', 'bono'];
const MARCAS = [
  { nombre: 'paypal', dominios: ['paypal.com'] },
  { nombre: 'google', dominios: ['google.com', 'google.com.sv', 'goog.le'] },
  { nombre: 'microsoft', dominios: ['microsoft.com', 'live.com', 'office.com', 'outlook.com'] },
  { nombre: 'apple', dominios: ['apple.com', 'icloud.com'] },
  { nombre: 'amazon', dominios: ['amazon.com'] },
  { nombre: 'facebook', dominios: ['facebook.com', 'fb.com'] },
  { nombre: 'instagram', dominios: ['instagram.com'] },
  { nombre: 'whatsapp', dominios: ['whatsapp.com', 'whatsapp.net'] },
  { nombre: 'netflix', dominios: ['netflix.com'] },
  { nombre: 'github', dominios: ['github.com'] },
  { nombre: 'dell', dominios: ['dell.com'] },
  { nombre: 'bancoagricola', dominios: ['bancoagricola.com'] },
];
const SEGUNDO_NIVEL_COMPUESTO = new Set(['com', 'net', 'org', 'gob', 'edu', 'co', 'gov', 'ac']);

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return fila[b.length];
}

/** Variantes de una palabra con las letras que suelen falsificarse (0 por o, 1 por l o i, rn por m...). */
function variantes(palabra) {
  const base = palabra.replace(/rn/g, 'm').replace(/vv/g, 'w');
  const mapa = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };
  const sinDigitos = base.replace(/[03-578]/g, (d) => mapa[d]);
  return [sinDigitos.replace(/1/g, 'l'), sinDigitos.replace(/1/g, 'i')];
}

export function dominioRegistrable(host) {
  const partes = host.split('.');
  if (partes.length <= 2) return host;
  const compuesto = partes.at(-1).length === 2 && SEGUNDO_NIVEL_COMPUESTO.has(partes.at(-2));
  return partes.slice(compuesto ? -3 : -2).join('.');
}

const esIp = (host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');

/** @returns {{ url: URL } | { resultado: object }} la URL lista para analizar, o un resultado ya decidido */
function interpretar(entrada) {
  const crudo = String(entrada ?? '').trim().replace(/^[<"'(]+|[>"')\].,;]+$/g, '');
  if (!crudo || crudo.length > MAX_ENLACE) return { resultado: { nivel: 'no_se_puede', motivos: ['No pude entender el enlace: está vacío o es larguísimo.'], dominio: '' } };
  if (/^(javascript|data|vbscript):/i.test(crudo)) {
    return { resultado: { nivel: 'peligroso', motivos: ['No es una página web: es código que se ejecuta apenas lo abrís.'], dominio: '' } };
  }
  if (/^file:/i.test(crudo)) return { resultado: { nivel: 'no_se_puede', motivos: ['Es un archivo de tu propia compu, no un sitio de internet.'], dominio: '' } };
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(crudo) && !/^https?:/i.test(crudo)) {
    return { resultado: { nivel: 'no_se_puede', motivos: ['Solo puedo revisar enlaces web (http o https).'], dominio: '' } };
  }
  const conEsquema = /^https?:\/\//i.test(crudo) ? crudo : `https://${crudo.replace(/^\/+/, '')}`;
  const sinEsquema = !/^https?:\/\//i.test(crudo);
  try {
    const url = new URL(conEsquema);
    if (!url.hostname.includes('.') && !esIp(url.hostname)) throw new Error('sin dominio');
    return { url, sinEsquema };
  } catch {
    return { resultado: { nivel: 'no_se_puede', motivos: ['No pude entender ese enlace. ¿Lo copiaste completo?'], dominio: '' } };
  }
}

/**
 * Señales de la dirección. Puntaje: 6 o más = peligroso; de 3 a 5 = dudoso; menos = sin señales.
 * @returns {{ nivel: string, motivos: string[], dominio: string, puntaje?: number }}
 */
export function analizarEnlace(entrada) {
  const interpretado = interpretar(entrada);
  if (interpretado.resultado) return interpretado.resultado;
  const { url, sinEsquema } = interpretado;
  const host = url.hostname.toLowerCase();
  const dominio = dominioRegistrable(host);
  const nombreSeguro = limpiarNombre(dominio);
  const motivos = [];
  let puntaje = 0;
  const sumar = (puntos, texto) => { puntaje += puntos; motivos.push(texto); };

  if (url.username || url.password) sumar(3, 'Tiene un "@" en la dirección: lo que se ve al principio no es el sitio real al que vas.');
  if (esIp(host)) sumar(3, 'Usa un número en lugar de un nombre de sitio, algo que los sitios de verdad casi nunca hacen.');
  if (host.split('.').some((e) => e.startsWith('xn--'))) sumar(3, 'Usa letras especiales que imitan a otras para parecerse a un sitio conocido.');
  if (ACORTADORES.has(dominio)) sumar(3, 'Es un enlace acortado: no se ve a qué sitio lleva de verdad.');
  if (url.protocol === 'http:') sumar(2, 'No usa conexión cifrada (HTTP): lo que escribas ahí puede verse en el camino.');
  if (url.port && !['80', '443'].includes(url.port)) sumar(1, 'Usa un puerto raro, poco común en sitios normales.');

  const etiquetas = host.split('.');
  const tld = etiquetas.at(-1);
  if (TLD_SOSPECHOSOS.has(tld)) sumar(1, `Termina en ".${tld}", una terminación que usan mucho las estafas.`);
  const registrables = dominio.split('.').length;
  if (!esIp(host) && etiquetas.length - registrables >= 3) sumar(1, 'Tiene demasiados subdominios, una forma de esconder el nombre real.');
  const etiquetaPrincipal = dominio.split('.')[0] ?? '';
  if ((etiquetaPrincipal.match(/-/g) ?? []).length >= 3) sumar(1, 'El nombre tiene muchos guiones, típico de sitios armados para engañar.');
  if (host.length > 45) sumar(1, 'El nombre del sitio es larguísimo.');
  if (/[?&](url|redirect|redirect_uri|next|continue|goto|link)=(https?(:|%3a))/i.test(url.search)) sumar(1, 'Te manda a otro sitio escondido dentro del enlace.');

  // Marcas imitadas: el nombre de una marca conocida en un sitio que no es el suyo.
  const partes = etiquetaPrincipal.split('-').filter(Boolean);
  for (const marca of MARCAS) {
    const oficial = marca.dominios.some((d) => host === d || host.endsWith(`.${d}`));
    if (oficial) continue;
    const idem = partes.some((p) => p === marca.nombre);
    const parecida = partes.some((p) => p !== marca.nombre && variantes(p).some((v) => v === marca.nombre || distancia(v, marca.nombre) <= 1) && p.length >= 5);
    // También cuenta si la marca aparece en un subdominio, como "paypal.com.sitio-raro.xyz".
    const enSubdominio = etiquetas.slice(0, -registrables).some((e) => e === marca.nombre || e.startsWith(`${marca.nombre}-`));
    if (parecida) { sumar(5, `El nombre se parece mucho a "${marca.nombre}" pero no es el sitio oficial.`); break; }
    if (enSubdominio) { sumar(4, `Pone "${marca.nombre}" al principio para engañarte, pero el sitio real es otro (${nombreSeguro}).`); break; }
    if (idem) { sumar(3, `Usa el nombre "${marca.nombre}" pero el sitio no es el oficial (${nombreSeguro}).`); break; }
  }
  const palabra = PALABRAS_DE_ENGANO.find((w) => host.includes(w));
  if (palabra) sumar(1, `El nombre del sitio incluye "${palabra}", una palabra que usan mucho los engaños.`);

  if (sinEsquema) motivos.push('Le faltaba el "https://": lo revisé como si lo tuviera.');
  const nivel = puntaje >= 6 ? 'peligroso' : puntaje >= 3 ? 'dudoso' : 'sin_senales';
  return { nivel, puntaje, motivos, dominio: nombreSeguro };
}

/**
 * Revisor completo: señales de la dirección + (si hay llave) Google Safe Browsing.
 * Nunca abre el enlace: lo único que sale a internet es la consulta a Google, con la dirección.
 */
export function createRevisorEnlaces({ apiKey = '', fetch: fetchFn = globalThis.fetch, timeoutMs = 4000 } = {}) {
  async function consultarListas(url) {
    if (!apiKey) return { estado: 'no_consultada' };
    try {
      const res = await fetchFn(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'kerni', clientVersion: '0.1' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { estado: 'error' };
      const json = await res.json();
      const tipos = [...new Set((json.matches ?? []).map((m) => String(m.threatType)))];
      return tipos.length ? { estado: 'aparece', tipos } : { estado: 'no_aparece' };
    } catch {
      return { estado: 'error' };   // sin detalles: ni la llave ni el cuerpo de la respuesta salen de aquí
    }
  }

  return {
    listasDisponibles: Boolean(apiKey),
    async revisar(entrada) {
      const base = analizarEnlace(entrada);
      if (base.nivel === 'no_se_puede' || !base.dominio) return { ...base, listas: { estado: 'no_consultada' }, nota: NOTA };
      const interpretado = interpretar(entrada);
      const listas = await consultarListas(interpretado.url.href);
      if (listas.estado === 'aparece') {
        const que = listas.tipos.includes('MALWARE') || listas.tipos.includes('UNWANTED_SOFTWARE') ? 'virus o programas dañinos' : 'estafas';
        return { ...base, nivel: 'peligroso', motivos: [`Google tiene este sitio en su lista de sitios peligrosos (${que}).`, ...base.motivos], listas, nota: NOTA };
      }
      return { ...base, listas, nota: NOTA };
    },
  };
}

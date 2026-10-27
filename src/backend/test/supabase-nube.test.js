import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabase } from '../src/memoria/supabase.js';
import { esObligatorio, tipoDeLlave, verificarSupabase } from '../src/rag/verificar.js';
import { descargarManuales, HOSTS_PERMITIDOS, leerManifiesto, validarEntrada } from '../src/rag/manuales.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_CONOCIMIENTO = join(AQUI, '..', '..', '..', 'conocimiento');
const jwt = (payload) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.firma`;
const URL_NUBE = 'https://abcdefghijklmnop.supabase.co';
const falla = (mensaje, extra = {}) => Object.assign(new Error(mensaje), extra);

describe('tipoDeLlave y la URL del cliente', () => {
  it('distingue la llave secreta de la pública sin llamar a nadie', () => {
    expect(tipoDeLlave('sb_secret_abc')).toBe('secret');
    expect(tipoDeLlave('sb_publishable_abc')).toBe('publishable');
    expect(tipoDeLlave(jwt({ role: 'service_role' }))).toBe('service_role');
    expect(tipoDeLlave(jwt({ role: 'anon' }))).toBe('anon');
    expect(tipoDeLlave('cualquier-cosa')).toBe('desconocido');
    expect(tipoDeLlave(undefined)).toBe('desconocido');
  });

  it('tolera que peguen la URL con /rest/v1 y espacios', async () => {
    const vistos = [];
    const fetch = async (u) => { vistos.push(u); return new Response('[]', { status: 200 }); };
    await createSupabase({ url: ` ${URL_NUBE}/rest/v1/ `, key: 'k', fetch }).select('kerni_salud');
    await createSupabase({ url: URL_NUBE, key: 'k', fetch }).select('kerni_salud');
    expect(vistos[0]).toBe(`${URL_NUBE}/rest/v1/kerni_salud?select=*`);
    expect(vistos[1]).toBe(vistos[0]);
  });
});

describe('verificarSupabase: dice qué falta y qué hacer', () => {
  const dbSana = (filas = [{ fuente: 'a.md' }, { fuente: 'b.pdf' }, { fuente: 'b.pdf' }]) => ({
    llamadas: [],
    async select(tabla) { this.llamadas.push(['select', tabla]); return tabla === 'kerni_conocimiento' ? filas : []; },
    async rpc(nombre, args) { this.llamadas.push(['rpc', nombre, args]); return []; },
  });
  const porNombre = (pasos, parte) => pasos.find((p) => p.nombre.includes(parte));

  it('con todo bien pasan todos los pasos y cuenta lo indexado', async () => {
    const db = dbSana();
    const pasos = await verificarSupabase({ url: URL_NUBE, key: 'sb_secret_x', db });
    expect(pasos.every((p) => p.ok)).toBe(true);
    expect(porNombre(pasos, 'kerni_conocimiento').detalle).toBe('3 fragmentos de 2 documentos');
    // las dos búsquedas se prueban con un vector de 768 ceros, no con datos reales
    const vector = db.llamadas.find((c) => c[1] === 'kerni_buscar_conocimiento')[2].consulta;
    expect(vector.split(',')).toHaveLength(768);
  });

  it('una tabla de conocimiento vacía se avisa como "falta indexar", no como error', async () => {
    const pasos = await verificarSupabase({ url: URL_NUBE, key: 'sb_secret_x', db: dbSana([]) });
    expect(porNombre(pasos, 'kerni_conocimiento')).toMatchObject({ ok: true });
    expect(porNombre(pasos, 'kerni_conocimiento').detalle).toMatch(/falta indexar/);
  });

  it('sin URL o sin llave se detiene antes de llamar a la red', async () => {
    let llamadas = 0;
    const db = { select: async () => { llamadas++; return []; }, rpc: async () => { llamadas++; return []; } };
    expect((await verificarSupabase({ url: '', key: 'k', db }))[0].ayuda).toMatch(/SUPABASE_URL/);
    expect((await verificarSupabase({ url: URL_NUBE, key: '', db })).at(-1).ayuda).toMatch(/SUPABASE_SECRET_KEY/);
    expect(llamadas).toBe(0);
  });

  it('la llave pública se rechaza antes de llamar, explicando por qué', async () => {
    let llamadas = 0;
    const db = { select: async () => { llamadas++; return []; }, rpc: async () => [] };
    const pasos = await verificarSupabase({ url: URL_NUBE, key: 'sb_publishable_x', db });
    expect(porNombre(pasos, 'Llave')).toMatchObject({ ok: false });
    expect(porNombre(pasos, 'Llave').ayuda).toMatch(/PÚBLICA/);
    expect(llamadas).toBe(0);
  });

  it('una llave rechazada o un proyecto pausado cortan con un consejo claro', async () => {
    const rechazada = await verificarSupabase({ url: URL_NUBE, key: 'sb_secret_x', db: { select: async () => { throw falla('401', { codigo: 'memoria_llave_invalida', status: 401 }); }, rpc: async () => [] } });
    expect(rechazada.at(-1).ayuda).toMatch(/llave SECRETA/);
    expect(rechazada).toHaveLength(3);                                    // no sigue probando con una llave mala
    const sinRed = await verificarSupabase({ url: URL_NUBE, key: 'sb_secret_x', db: { select: async () => { throw falla('sin red', { codigo: 'memoria_sin_red' }); }, rpc: async () => [] } });
    expect(sinRed.at(-1).ayuda).toMatch(/pausado/);
  });

  it('si falta una migración dice cuál archivo correr', async () => {
    const db = {
      select: async (tabla) => { if (tabla === 'kerni_conocimiento') throw falla("Supabase respondió 404: Could not find the table 'public.kerni_conocimiento' in the schema cache", { status: 404 }); return []; },
      rpc: async (nombre) => { throw falla(`Supabase respondió 404: Could not find the function public.${nombre}`, { status: 404 }); },
    };
    const pasos = await verificarSupabase({ url: URL_NUBE, key: 'sb_secret_x', db });
    expect(porNombre(pasos, 'kerni_conocimiento').ayuda).toMatch(/20261021000100_rag\.sql/);
    expect(porNombre(pasos, 'vectorial').ayuda).toMatch(/20261021000100_rag\.sql/);
    expect(porNombre(pasos, 'híbrida').ayuda).toMatch(/20261021000200_rag_hibrido\.sql/);
  });

  it('la búsqueda híbrida es opcional: su ausencia no impide usar el RAG', async () => {
    const db = { ...dbSana(), rpc: async (nombre) => { if (/hibrido/.test(nombre)) throw falla('404 Could not find the function', { status: 404 }); return []; } };
    const pasos = await verificarSupabase({ url: URL_NUBE, key: 'sb_secret_x', db });
    const hibrida = porNombre(pasos, 'híbrida');
    expect(hibrida.ok).toBe(false);
    expect(esObligatorio(hibrida)).toBe(false);
    expect(hibrida.ayuda).toMatch(/opcional/);
    expect(pasos.filter((p) => !p.ok && esObligatorio(p))).toEqual([]);
  });

  it('avisa si la dimensión de los vectores no coincide con la tabla', async () => {
    const db = { ...dbSana(), rpc: async () => { throw falla('expected 1536 dimensions, not 768', { status: 400 }); } };
    const pasos = await verificarSupabase({ url: URL_NUBE, key: 'sb_secret_x', db });
    expect(porNombre(pasos, 'vectorial').ayuda).toMatch(/dimensión/);
  });

  it('una URL con /rest/v1 sobrante se acepta con un aviso, y una rara se marca', async () => {
    const con = await verificarSupabase({ url: `${URL_NUBE}/rest/v1`, key: 'sb_secret_x', db: dbSana() });
    expect(con[0]).toMatchObject({ ok: true });
    expect(con[0].ayuda).toMatch(/Sobra/);
    const rara = await verificarSupabase({ url: 'https://ejemplo.com', key: 'sb_secret_x', db: dbSana() });
    expect(rara[0]).toMatchObject({ ok: false });
  });
});

describe('manuales oficiales', () => {
  const temporales = [];
  afterAll(() => { for (const t of temporales) rmSync(t, { recursive: true, force: true }); });
  const carpeta = () => { const d = mkdtempSync(join(tmpdir(), 'kerni-manuales-')); temporales.push(d); return d; };
  const entrada = (extra = {}) => ({ nombre: 'Manual de prueba', url: 'https://dl.dell.com/content/manual1.pdf', destino: 'privado/prueba/manual.pdf', bytesMinimos: 10, ...extra });
  const pdf = (bytes = 100) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes, 'x')]);
  const respuestaCon = (contenido, status = 200) => new Response(contenido, { status });

  it('el listado real es válido: https desde sitios permitidos, destinos únicos y dentro de privado/', () => {
    const manuales = leerManifiesto(join(RAIZ_CONOCIMIENTO, 'manuales.json'));
    expect(manuales.length).toBeGreaterThanOrEqual(2);
    for (const m of manuales) expect(validarEntrada(m, RAIZ_CONOCIMIENTO), m.nombre).toEqual({ ok: true });
    expect(new Set(manuales.map((m) => m.destino)).size).toBe(manuales.length);
    expect(new Set(manuales.map((m) => m.url)).size).toBe(manuales.length);
    expect(HOSTS_PERMITIDOS).toEqual(['dl.dell.com']);
  });

  it('rechaza http, otros sitios, rutas que se escapan de privado/ y archivos que no son PDF', () => {
    const r = (extra) => validarEntrada(entrada(extra), RAIZ_CONOCIMIENTO);
    expect(r({ url: 'http://dl.dell.com/x.pdf' }).error).toMatch(/https/);
    expect(r({ url: 'https://sitio-malo.example/x.pdf' }).error).toMatch(/lista permitida/);
    expect(r({ destino: 'privado/../hardware/memoria-ram.pdf' }).error).toMatch(/dentro de conocimiento\/privado/);
    expect(r({ destino: '../../fuera.pdf' }).ok).toBe(false);
    expect(r({ destino: 'privado/x/programa.exe' }).ok).toBe(false);
    expect(r({ url: 'no es una url' }).ok).toBe(false);
    expect(validarEntrada({ nombre: 'x' }, RAIZ_CONOCIMIENTO).ok).toBe(false);
  });

  it('descarga un PDF válido, lo deja en su sitio y no deja archivos a medias', async () => {
    const raiz = carpeta();
    const [r] = await descargarManuales([entrada()], raiz, { fetch: async () => respuestaCon(pdf()) });
    expect(r).toMatchObject({ estado: 'descargado' });
    expect(existsSync(join(raiz, 'privado/prueba/manual.pdf'))).toBe(true);
    expect(readdirSync(join(raiz, 'privado/prueba'))).toEqual(['manual.pdf']);
  });

  it('lo que ya está no se vuelve a bajar', async () => {
    const raiz = carpeta();
    await descargarManuales([entrada()], raiz, { fetch: async () => respuestaCon(pdf()) });
    let llamadas = 0;
    const [r] = await descargarManuales([entrada()], raiz, { fetch: async () => { llamadas++; return respuestaCon(pdf()); } });
    expect(r.estado).toBe('ya_estaba');
    expect(llamadas).toBe(0);
  });

  it('descarta lo que no es un PDF, lo incompleto y los errores del sitio, sin dejar nada', async () => {
    const raiz = carpeta();
    const intentos = [
      [respuestaCon('<html>Access denied</html>'), /no es un PDF/],
      [respuestaCon(pdf(5)), /menos de lo esperado/],
      [respuestaCon('no', 404), /respondió 404/],
    ];
    for (const [respuesta, esperado] of intentos) {
      const [r] = await descargarManuales([entrada({ bytesMinimos: 1000 })], raiz, { fetch: async () => respuesta });
      expect(r.estado).toBe('error');
      expect(r.detalle).toMatch(esperado);
    }
    expect(existsSync(join(raiz, 'privado/prueba/manual.pdf'))).toBe(false);
    expect(readdirSync(join(raiz, 'privado/prueba')).filter((f) => f.endsWith('.parcial'))).toEqual([]);
  });

  it('una entrada inválida da error sin llamar a la red, y las demás siguen', async () => {
    const raiz = carpeta();
    let llamadas = 0;
    const r = await descargarManuales([entrada({ url: 'http://dl.dell.com/x.pdf' }), entrada({ destino: 'privado/otra/b.pdf' })], raiz, { fetch: async () => { llamadas++; return respuestaCon(pdf()); } });
    expect(r.map((x) => x.estado)).toEqual(['error', 'descargado']);
    expect(llamadas).toBe(1);
  });
});

describe('la guía de Supabase en la nube no se desactualiza', () => {
  const raiz = join(AQUI, '..', '..', '..');
  const guia = readFileSync(join(raiz, 'docs', 'supabase-cloud-setup.md'), 'utf8');

  it('nombra todas las migraciones del repo, en orden', () => {
    const migraciones = readdirSync(join(raiz, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    let desde = 0;
    for (const m of migraciones) {
      const donde = guia.indexOf(m, desde);
      expect(donde, `la guía no nombra ${m} (o está fuera de orden)`).toBeGreaterThanOrEqual(desde);
      desde = donde;
    }
  });

  it('los comandos que menciona existen en package.json', () => {
    const scripts = JSON.parse(readFileSync(join(AQUI, '..', 'package.json'), 'utf8')).scripts;
    for (const comando of ['probar-supabase', 'manuales', 'indexar']) {
      expect(guia).toContain(`npm run ${comando}`);
      expect(scripts[comando], comando).toBeTruthy();
    }
  });

  it('explica que nunca se use la llave pública y que la secreta no se comparte', () => {
    expect(guia).toMatch(/Never use the publishable \/ anon key/);
    expect(guia).toMatch(/Do not commit it/);
  });
});

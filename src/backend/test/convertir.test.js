import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertirPdf, convertirTodo, listarPdfs, rutaMarkdown, tituloDeArchivo } from '../src/rag/convertir.js';
import { fragmentar } from '../src/rag/fragmentos.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => join(AQUI, 'fixtures', n);

describe('convertir PDF a Markdown', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kerni-md-'));
    copyFileSync(fixture('manual-prueba.pdf'), join(dir, 'manual-prueba.pdf'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('arma un título legible a partir del nombre del archivo', () => {
    expect(tituloDeArchivo('C:/x/latitude-3120_service-manual.pdf')).toBe('Latitude 3120 service manual');
  });

  it('el .md queda junto al PDF, o en la carpeta de salida', () => {
    expect(rutaMarkdown(join(dir, 'a.pdf'))).toBe(join(dir, 'a.md'));
    expect(rutaMarkdown(join(dir, 'a.pdf'), join(dir, 'salida'))).toBe(join(dir, 'salida', 'a.md'));
  });

  it('convierte con un título por página y el resultado se puede fragmentar', async () => {
    const r = await convertirPdf(join(dir, 'manual-prueba.pdf'));
    expect(r.estado).toBe('convertido');
    expect(r.paginas).toBe(2);
    const md = readFileSync(r.md, 'utf8');
    expect(md).toMatch(/^# Manual prueba\n\nFuente: manual-prueba\.pdf \(2 páginas\)/);
    expect(md).toContain('## Página 1');
    expect(md).toContain('memoria LPDDR4 soldada a la placa base');
    expect(fragmentar(md).map((f) => f.titulo)).toContain('Página 2');
    expect(readdirSync(dir).some((n) => n.endsWith('.parcial'))).toBe(false);
  });

  it('no pisa un .md existente salvo que se pida', async () => {
    writeFileSync(join(dir, 'manual-prueba.md'), 'editado a mano', 'utf8');
    expect((await convertirPdf(join(dir, 'manual-prueba.pdf'))).estado).toBe('existe');
    expect(readFileSync(join(dir, 'manual-prueba.md'), 'utf8')).toBe('editado a mano');
    expect((await convertirPdf(join(dir, 'manual-prueba.pdf'), { sobrescribir: true })).estado).toBe('convertido');
    expect(readFileSync(join(dir, 'manual-prueba.md'), 'utf8')).toContain('## Página 1');
  });

  it('un PDF escaneado se avisa y no genera .md; uno roto no detiene a los demás', async () => {
    copyFileSync(fixture('escaneado-prueba.pdf'), join(dir, 'escaneado.pdf'));
    writeFileSync(join(dir, 'roto.pdf'), 'esto no es un pdf');
    const vistos = [];
    const rs = await convertirTodo(dir, {}, (r) => vistos.push(r.estado));
    expect(Object.fromEntries(rs.map((r) => [r.pdf.split(/[\\/]/).pop(), r.estado]))).toEqual({
      'escaneado.pdf': 'escaneado',
      'manual-prueba.pdf': 'convertido',
      'roto.pdf': 'error',
    });
    expect(vistos).toHaveLength(3);
    expect(readdirSync(dir).filter((n) => n.endsWith('.md'))).toEqual(['manual-prueba.md']);
  });

  it('listarPdfs acepta un archivo o una carpeta y rechaza lo que no existe', () => {
    expect(listarPdfs(dir)).toHaveLength(1);
    expect(listarPdfs(join(dir, 'manual-prueba.pdf'))).toHaveLength(1);
    expect(() => listarPdfs(join(dir, 'nada'))).toThrow(/No existe/);
  });
});

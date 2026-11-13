import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coincide, evaluar, resumir } from '../src/rag/evaluacion.js';
import { MIN_PREGUNTA } from '../src/rag/conocimiento.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const preguntas = JSON.parse(readFileSync(join(aqui, '..', 'evaluacion', 'preguntas.json'), 'utf8'));
const raiz = join(aqui, '..', '..', '..', 'conocimiento');

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [relative(raiz, ruta).split('\\').join('/')];
  });
}

describe('evaluación de la búsqueda: lógica', () => {
  it('coincide mira el nombre de la fuente sin importar mayúsculas', () => {
    expect(coincide('windows/Impresoras-Windows.md', ['windows/impresoras'])).toBe(true);
    expect(coincide('hardware/memoria-ram.md', ['windows/impresoras'])).toBe(false);
    expect(coincide('', ['x'])).toBe(false);
    expect(coincide('a.md', [])).toBe(false);
  });

  it('cuenta aciertos, posición y preguntas ajenas', async () => {
    const respuestas = {
      'pregunta uno larga': [{ fuente: 'windows/a.md', similitud: 0.8 }, { fuente: 'hardware/b.md', similitud: 0.7 }],
      'pregunta dos larga': [{ fuente: 'hardware/x.md', similitud: 0.7 }, { fuente: 'windows/b.md', similitud: 0.6 }],
      'pregunta tres larga': [{ fuente: 'office/z.md', similitud: 0.6 }],
      'pregunta ajena larga': [],
      'otra ajena larga': [{ fuente: 'windows/a.md', similitud: 0.56 }],
    };
    const { filas, resumen } = await evaluar([
      { pregunta: 'pregunta uno larga', esperado: ['windows/a'] },
      { pregunta: 'pregunta dos larga', esperado: ['windows/b'] },
      { pregunta: 'pregunta tres larga', esperado: ['windows/c'] },
      { pregunta: 'pregunta ajena larga', esperado: [] },
      { pregunta: 'otra ajena larga', esperado: [] },
    ], async (q) => respuestas[q]);

    expect(filas.map((f) => f.posicion)).toEqual([1, 2, null, null, null]);
    expect(filas.map((f) => f.acierto)).toEqual([true, true, false, true, false]);
    expect(resumen).toMatchObject({ preguntas: 5, deTema: 3, aciertos: 2, porcentaje: 67, primero: 1, ajenas: 2, rechazadas: 1, errores: 0 });
    expect(resumen.mrr).toBe(0.5); // (1 + 1/2 + 0) / 3
  });

  it('una búsqueda que falla se cuenta como error y no como acierto, ni siquiera en una pregunta ajena', async () => {
    const { filas, resumen } = await evaluar([
      { pregunta: 'pregunta de tema', esperado: ['windows/a'] },
      { pregunta: 'pregunta ajena', esperado: [] },
    ], async () => { throw new Error('sin red'); });
    expect(filas.every((f) => !f.acierto && f.error === 'sin red')).toBe(true);
    expect(resumen.errores).toBe(2);
    expect(resumen.aciertos).toBe(0);
    expect(resumen.rechazadas).toBe(0);
  });

  it('sin preguntas no divide por cero', () => {
    expect(resumir([])).toMatchObject({ preguntas: 0, porcentaje: 0, mrr: 0 });
  });
});

describe('evaluacion/preguntas.json', () => {
  it('cada pregunta es de verdad una pregunta que la búsqueda no descarta por corta', () => {
    expect(preguntas.length).toBeGreaterThanOrEqual(25);
    for (const p of preguntas) {
      expect(typeof p.pregunta).toBe('string');
      expect(p.pregunta.length, p.pregunta).toBeGreaterThanOrEqual(MIN_PREGUNTA);
      expect(Array.isArray(p.esperado), p.pregunta).toBe(true);
    }
    expect(new Set(preguntas.map((p) => p.pregunta)).size).toBe(preguntas.length);
  });

  it('hay preguntas ajenas al tema, para vigilar que no se invente una respuesta', () => {
    expect(preguntas.filter((p) => p.esperado.length === 0).length).toBeGreaterThanOrEqual(2);
  });

  it('cada documento esperado existe en conocimiento/ (los manuales privados de Dell no están en el repo y se aceptan por nombre)', () => {
    if (!existsSync(raiz)) return;
    const todos = archivos(raiz).filter((f) => f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.pdf')).map((f) => f.toLowerCase());
    for (const p of preguntas) {
      for (const e of p.esperado) {
        if (e.startsWith('dell-latitude')) continue;
        expect(todos.some((f) => f.includes(e.toLowerCase())), `${p.pregunta} espera "${e}", que no existe en conocimiento/`).toBe(true);
      }
    }
  });
});

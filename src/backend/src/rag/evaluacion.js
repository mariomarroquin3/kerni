// Medición de la búsqueda del conocimiento: cuántas preguntas encuentran el documento correcto.
// Lógica pura (sin red): `evaluar` recibe la función de búsqueda, así se prueba con dobles y se corre de verdad con `npm run evaluar-rag`.

/** ¿La fuente de un fragmento (ruta relativa como "windows/impresoras-windows.md") es alguna de las esperadas? */
export function coincide(fuente, esperados) {
  const f = String(fuente ?? '').toLowerCase();
  return (esperados ?? []).some((e) => f.includes(String(e).toLowerCase()));
}

/**
 * @param {{ pregunta: string, esperado: string[], nota?: string }[]} preguntas
 *   `esperado` son trozos del nombre de la fuente. Una lista vacía significa "no debería encontrar nada" (pregunta ajena al tema).
 * @param {(pregunta: string) => Promise<{ fuente: string, similitud?: number }[]>} buscar
 */
export async function evaluar(preguntas, buscar) {
  const filas = [];
  for (const p of preguntas) {
    let resultados = [];
    let error = null;
    try {
      resultados = (await buscar(p.pregunta)) ?? [];
    } catch (err) {
      error = err.message;
    }
    const ajena = !p.esperado?.length;
    const posicion = ajena ? null : resultados.findIndex((r) => coincide(r.fuente, p.esperado)) + 1 || null;
    filas.push({
      pregunta: p.pregunta,
      esperado: p.esperado ?? [],
      ajena,
      acierto: ajena ? resultados.length === 0 && !error : posicion !== null,
      posicion,
      mejor: resultados[0]?.similitud ?? null,
      fuentes: resultados.map((r) => r.fuente),
      error,
    });
  }
  return { filas, resumen: resumir(filas) };
}

/** Totales: aciertos sobre preguntas del tema, rechazos sobre las ajenas, y qué tan arriba aparece el documento (MRR). */
export function resumir(filas) {
  const deTema = filas.filter((f) => !f.ajena);
  const ajenas = filas.filter((f) => f.ajena);
  const aciertos = deTema.filter((f) => f.acierto).length;
  const primero = deTema.filter((f) => f.posicion === 1).length;
  const mrr = deTema.length ? deTema.reduce((s, f) => s + (f.posicion ? 1 / f.posicion : 0), 0) / deTema.length : 0;
  const rechazadas = ajenas.filter((f) => f.acierto).length;
  return {
    preguntas: filas.length,
    deTema: deTema.length,
    aciertos,
    porcentaje: deTema.length ? Math.round((aciertos / deTema.length) * 100) : 0,
    primero,
    mrr: Math.round(mrr * 100) / 100,
    ajenas: ajenas.length,
    rechazadas,
    errores: filas.filter((f) => f.error).length,
  };
}

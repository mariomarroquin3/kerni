// Vigilante de RAM por reglas, sin modelo ni API key. Lógica pura (sin DOM)
// para probarla con node --test. Lo alimenta main.js con cada lectura (2 s).

export const UMBRAL_PROCESO_MB = 1500;     // un proceso así de grande ya es sospechoso
export const UMBRAL_PROCESO_PCT = 15;      // o ese % de toda la RAM
export const UMBRAL_SISTEMA_PCT = 85;      // RAM total apretada
export const LECTURAS_SOSTENIDAS = 3;      // seguidas sobre el umbral (6 s) antes de avisar
export const VENTANA_CRECIMIENTO = 15;     // lecturas (30 s) para detectar fugas
export const CRECIMIENTO_MB = 300;         // crecimiento en esa ventana que parece fuga
export const ENFRIAMIENTO_MS = 5 * 60_000; // no repetir el aviso del mismo proceso
export const DISCO_ETA_UMBRAL_DIAS = 14;   // si quedan menos de este número de días, avisa
export const DISCO_ENFRIAMIENTO_MS = 24 * 60 * 60_000; // no repetir el aviso tras reiniciar

const gb = (mb) => (mb / 1024).toFixed(1);

/**
 * Vigilante de disco por reglas: revisa el resumen histórico que mandó el backend
 * y sugiere limpiar temporales cuando queda poco tiempo (voseo salvadoreño).
 * Lógica pura para probar con node --test.
 */
export function crearVigilanteDisco({ ahora = () => Date.now() } = {}) {
  const avisado = new Map(); // clave: fecha "YYYY-MM-DD" del último aviso

  /**
   * @param {object | null} h resumen de `resumen_historial`, campo `disco`
   * @returns {null | { texto, proponer: object }}
   */
  function revisar(h) {
    const d = h?.disco;
    if (!d || d.diasHastaLlenarse == null || d.diasHastaLlenarse >= DISCO_ETA_UMBRAL_DIAS) return null;
    const dias = Math.round(d.diasHastaLlenarse);
    const gbDia = Math.abs(d.crecimientoGbDia).toFixed(1);
    const fecha = String(ahora()).slice(0, 10);
    if (ahora() - (avisado.get(fecha) ?? -Infinity) < DISCO_ENFRIAMIENTO_MS) return null;
    avisado.set(fecha, ahora());
    const texto = `Tu disco viene bajando ~${gbDia} GB por día; a este ritmo se llena en unos ${dias} días.`;
    return {
      texto,
      proponer: { accion: 'limpiar_temporales', motivo: `El disco viene bajando ~${gbDia} GB por día.` },
    };
  }

  return { revisar };
}

export function crearVigilanteRam({ ahora = () => Date.now() } = {}) {
  const racha = new Map();      // pid -> lecturas seguidas sobre el umbral
  const historial = new Map();  // pid -> últimas memorias (MB)
  const avisado = new Map();    // pid -> cuándo se avisó por última vez

  /**
   * @param {object} m lectura de `metricas` (con `protegido` por proceso)
   * @returns {null | { pid, nombre, memoriaMb, motivo: 'grande'|'fuga', texto, proponer: object|null }}
   */
  function revisar(m) {
    const t = ahora();
    const ramPct = (m.ram.usadaMb / m.ram.totalMb) * 100;
    const vivos = new Set(m.procesos.map((p) => p.pid));
    for (const pid of [...racha.keys(), ...historial.keys()]) {
      if (!vivos.has(pid)) { racha.delete(pid); historial.delete(pid); }
    }

    const candidatos = [];
    for (const p of m.procesos) {
      const h = [...(historial.get(p.pid) ?? []), p.memoriaMb].slice(-VENTANA_CRECIMIENTO);
      historial.set(p.pid, h);

      const grande = p.memoriaMb >= UMBRAL_PROCESO_MB || (p.memoriaMb / m.ram.totalMb) * 100 >= UMBRAL_PROCESO_PCT;
      racha.set(p.pid, grande ? (racha.get(p.pid) ?? 0) + 1 : 0);

      const crece = h.length >= VENTANA_CRECIMIENTO && h.at(-1) - h[0] >= CRECIMIENTO_MB
        && h.every((v, i) => i === 0 || v >= h[i - 1] - 5); // sube sin bajar (margen de 5 MB)

      if (p.protegido) continue; // de Windows: se informa en el HUD, no se propone cerrar
      if (t - (avisado.get(p.pid) ?? -Infinity) < ENFRIAMIENTO_MS) continue;
      if (crece) candidatos.push({ p, motivo: 'fuga' });
      else if (racha.get(p.pid) >= LECTURAS_SOSTENIDAS && ramPct >= UMBRAL_SISTEMA_PCT) candidatos.push({ p, motivo: 'grande' });
    }
    if (!candidatos.length) return null;

    // El que más memoria usa; una fuga gana si empatan en importancia.
    candidatos.sort((a, b) => b.p.memoriaMb - a.p.memoriaMb);
    const { p, motivo } = candidatos[0];
    avisado.set(p.pid, t);

    const texto = motivo === 'fuga'
      ? `${p.nombre} viene creciendo en memoria sin parar (ya usa ${gb(p.memoriaMb)} GB). Puede tener una fuga.`
      : `${p.nombre} usa ${gb(p.memoriaMb)} GB y tu RAM va por ${Math.round(ramPct)}%. Es el que más pesa.`;
    return {
      pid: p.pid, nombre: p.nombre, memoriaMb: p.memoriaMb, motivo, texto,
      proponer: {
        accion: 'terminar_proceso', pid: p.pid, nombre: p.nombre,
        motivo: `Usa ${gb(p.memoriaMb)} GB de RAM (${Math.round(ramPct)}% en total).`,
      },
    };
  }

  return { revisar };
}

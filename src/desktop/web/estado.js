// Lógica pura del ánimo de Kerni, sin DOM, para poder probarla con node --test.

export const UMBRAL_PANICO_CPU = 95;
/** Lecturas seguidas (una cada 2 s) por encima del umbral para entrar en pánico. */
export const MUESTRAS_PANICO = 3;
/** Lecturas seguidas por debajo del umbral para salir del pánico. */
export const MUESTRAS_CALMA = 3;

/**
 * Detecta pánico solo con picos sostenidos: una lectura suelta de 100% (abrir
 * un programa) no debe asustar a Kerni. Con histéresis para no parpadear.
 */
export function crearDetectorPanico({ umbral = UMBRAL_PANICO_CPU, entrar = MUESTRAS_PANICO, salir = MUESTRAS_CALMA } = {}) {
  let altas = 0;
  let bajas = 0;
  let enPanico = false;
  return {
    actualizar(cpu) {
      if (cpu >= umbral) {
        altas += 1;
        bajas = 0;
      } else {
        bajas += 1;
        altas = 0;
      }
      if (!enPanico && altas >= entrar) enPanico = true;
      else if (enPanico && bajas >= salir) enPanico = false;
      return enPanico;
    },
    get enPanico() {
      return enPanico;
    },
  };
}

/** Ánimo normal (sin pánico) según qué tan apretada anda la PC. */
export function calcularAnimo(m, enPanico = false) {
  if (enPanico) return 'panico';
  const ramPct = (m.ram.usadaMb / m.ram.totalMb) * 100;
  const discoPct = ((m.disco.totalGb - m.disco.libreGb) / m.disco.totalGb) * 100;
  if (m.cpu >= 80 || ramPct >= 90 || discoPct >= 95) return 'cansado';
  if (m.cpu >= 50 || ramPct >= 75 || discoPct >= 85) return 'normal';
  return 'feliz';
}

/** Procesos que se pueden ofrecer cerrar en modo pánico: los que más CPU usan y no son protegidos. */
export function sospechosos(procesos, max = 3) {
  return procesos
    .filter((p) => !p.protegido && p.cpu >= 5)
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, max);
}

/** Lo que se manda al backend: la foto sin el campo interno `protegido`. */
export function snapshotParaBackend(m) {
  return {
    cpu: m.cpu,
    ram: m.ram,
    disco: m.disco,
    procesos: m.procesos.map(({ pid, nombre, cpu, memoriaMb }) => ({ pid, nombre, cpu, memoriaMb })),
  };
}

/**
 * Qué modo del rig de Rive toca. Prioridad: el susto manda, luego la alerta (Kerni
 * propuso algo y espera), "pensando", una reacción corta de alegría, el sueño; si no,
 * en reposo.
 * @param {{ panico?: boolean, alerta?: boolean, analizando?: boolean, reaccion?: boolean, dormido?: boolean }} e
 * @returns {'asustado'|'alerta'|'research'|'sonriente'|'dormido'|'idle'}
 */
export function modoKerni({ panico = false, alerta = false, analizando = false, reaccion = false, dormido = false } = {}) {
  if (panico) return 'asustado';
  if (alerta) return 'alerta';
  if (analizando) return 'research';
  if (reaccion) return 'sonriente';
  if (dormido) return 'dormido';
  return 'idle';
}

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

// ---------- Carga de la BATERÍA -> cara de Kerni ----------
// (La "carga" de la que habla la regla es la de la batería, no la del procesador.)
export const UMBRAL_CARGA_ALTA = 70;   // 70 % o más: la cara sonriente normal (idle)
export const UMBRAL_CARGA_MEDIA = 30;  // de 30 % a 69 %: cara seria (neutro); menos de 30 %: aburrido
const HISTERESIS_CARGA = 4;            // puntos que hay que pasarse del umbral para cambiar de cara
const MUESTRAS_CARGA = 5;              // lecturas que se promedian por defecto

/** Nivel de una carga (porcentaje 0-100) sin suavizar: 'alta' | 'media' | 'baja'. */
export function nivelDeCarga(porcentaje) {
  if (porcentaje >= UMBRAL_CARGA_ALTA) return 'alta';
  if (porcentaje >= UMBRAL_CARGA_MEDIA) return 'media';
  return 'baja';
}

/**
 * Decide el nivel sin parpadear: promedia las últimas lecturas y solo cambia cuando el promedio se
 * aleja del umbral más que la histéresis. Así un porcentaje que ronda 30 % o 70 % no hace saltar a
 * Kerni entre dos caras en cada lectura.
 */
export function crearNivelCarga({ muestras = MUESTRAS_CARGA, histeresis = HISTERESIS_CARGA } = {}) {
  const ventana = [];
  let nivel = null;
  const sigue = {
    baja: (p) => p < UMBRAL_CARGA_MEDIA + histeresis,
    media: (p) => p >= UMBRAL_CARGA_MEDIA - histeresis && p < UMBRAL_CARGA_ALTA + histeresis,
    alta: (p) => p >= UMBRAL_CARGA_ALTA - histeresis,
  };
  return {
    actualizar(cpu) {
      ventana.push(cpu);
      if (ventana.length > muestras) ventana.shift();
      const promedio = ventana.reduce((a, b) => a + b, 0) / ventana.length;
      if (nivel === null || !sigue[nivel](promedio)) nivel = nivelDeCarga(promedio);
      return nivel;
    },
    get nivel() {
      return nivel;
    },
  };
}

const CARA_POR_CARGA = { alta: 'idle', media: 'neutro', baja: 'aburrido' };

/**
 * Qué modo del rig de Rive toca. Prioridad: el susto manda, luego la alerta (Kerni propuso algo
 * y espera), "pensando", una reacción corta de alegría, el sueño; si no, la cara que toca por
 * la carga de la PC (idle = sonriente normal con 70 % o más, neutro con 30-69 %, aburrido con menos).
 * @param {{ panico?: boolean, alerta?: boolean, analizando?: boolean, reaccion?: boolean, dormido?: boolean, carga?: 'alta'|'media'|'baja' }} e
 * @returns {'asustado'|'alerta'|'research'|'sonriente'|'dormido'|'idle'|'neutro'|'aburrido'}
 */
export function modoKerni({ panico = false, alerta = false, analizando = false, reaccion = false, dormido = false, carga = 'alta' } = {}) {
  if (panico) return 'asustado';
  if (alerta) return 'alerta';
  if (analizando) return 'research';
  if (reaccion) return 'sonriente';
  if (dormido) return 'dormido';
  return CARA_POR_CARGA[carga] ?? 'idle';
}

/** Modos de "reposo": nadie le habla ni pasa nada. En ellos Kerni se vuelve un poco transparente. */
export const MODOS_REPOSO = ['idle', 'neutro', 'aburrido', 'dormido'];

/** Cuánto se queda el globo de texto: lo que se tarda en leerlo (unos 10 caracteres por segundo, más una pausa), nunca menos que `minimoMs`. */
export const GLOBO_BASE_MS = 6000;
export const GLOBO_MS_POR_CARACTER = 100;
export const GLOBO_MAXIMO_MS = 90000;
export function duracionGlobo(texto, minimoMs = 0) {
  const lectura = GLOBO_BASE_MS + String(texto ?? '').length * GLOBO_MS_POR_CARACTER;
  return Math.min(GLOBO_MAXIMO_MS, Math.max(minimoMs, lectura));
}

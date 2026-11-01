// Nivel y progreso de aprendizaje. Lógica pura (sin DOM): main.js pinta el resultado con textContent.
// El XP lo decide el backend (src/backend/src/progreso.js); aquí solo se calcula cómo se ve.

/** Niveles con su umbral de XP (desde). Son fijos: cambiarlos cambia lo que ya ganó la persona. */
export const NIVELES = Object.freeze([
  { desde: 0, nombre: 'Aprendiz' },
  { desde: 20, nombre: 'Vigía' },
  { desde: 60, nombre: 'Guardián' },
  { desde: 120, nombre: 'Experto' },
  { desde: 200, nombre: 'Maestro' },
]);

/**
 * Nivel actual a partir del XP total.
 * @returns {{ indice: number, nombre: string, xp: number, siguiente: {nombre: string, desde: number}|null, faltan: number, porcentaje: number }}
 */
export function nivelDeXp(xp) {
  const x = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let indice = 0;
  NIVELES.forEach((n, i) => { if (x >= n.desde) indice = i; });
  const actual = NIVELES[indice];
  const sig = NIVELES[indice + 1] ?? null;
  const porcentaje = sig ? Math.floor(((x - actual.desde) / (sig.desde - actual.desde)) * 100) : 100;
  return {
    indice,
    nombre: actual.nombre,
    xp: x,
    siguiente: sig ? { nombre: sig.nombre, desde: sig.desde } : null,
    faltan: sig ? sig.desde - x : 0,
    porcentaje,
  };
}

/**
 * Lo que dice la insignia. `disponible`: true (el backend respondió), false (memoria apagada o sin backend) o null (todavía no se sabe).
 * `activos`: si los consejos están encendidos (con ellos apagados no se suma XP nuevo, y la insignia lo dice).
 */
export function textoInsignia({ xp = 0, disponible = null, activos = true } = {}) {
  if (disponible === null) return 'Aprendizaje: cargando…';
  if (disponible === false) return 'Aprendizaje: no disponible sin la memoria local';
  const n = nivelDeXp(xp);
  const avance = n.siguiente ? `faltan ${n.faltan} XP para ${n.siguiente.nombre}` : 'nivel máximo';
  return `${n.nombre} · ${n.xp} XP · ${avance}${activos ? '' : ' · consejos desactivados (no suma XP nuevo)'}`;
}

// ---------- Estado de hoy (en este PC): cuántas ayudas se contaron, cuántas tarjetas se resolvieron ----------
// Se guarda en localStorage. Es solo para no sumar dos veces en el front; el tope real lo cuenta el backend.

/** Estado vacío de un día. */
export function diaVacio(dia) {
  return { dia, tarjetas: 0, ayudas: [], leccion: false, ofrecida: false };
}

/** Lo guardado si es de hoy (y bien formado); si no, un día vacío. Cualquier dato raro se descarta. */
export function estadoDeHoy(guardado, dia) {
  if (!guardado || typeof guardado !== 'object' || guardado.dia !== dia) return diaVacio(dia);
  return {
    dia,
    tarjetas: Math.max(0, Math.floor(Number(guardado.tarjetas)) || 0),
    ayudas: Array.isArray(guardado.ayudas) ? guardado.ayudas.filter((a) => typeof a === 'string').slice(0, 50) : [],
    leccion: guardado.leccion === true,
    ofrecida: guardado.ofrecida === true,
  };
}

/** ¿Ya se contó el "¿Por qué?" de este tipo de tarjeta hoy? */
export function ayudaContada(estado, accion) {
  return estado.ayudas.includes(accion);
}

/** Cuenta un "¿Por qué?" de este tipo de tarjeta (una vez por tipo y día). */
export function contarAyuda(estado, accion) {
  return ayudaContada(estado, accion) ? estado : { ...estado, ayudas: [...estado.ayudas, accion] };
}

/** Una tarjeta aprobada o rechazada hoy. */
export function contarTarjeta(estado) {
  return { ...estado, tarjetas: estado.tarjetas + 1 };
}

// ---------- Consejos y mini-lección: cuándo aparecen ----------

/** Cuántas tarjetas resueltas en un día hacen que Kerni ofrezca la lección de 1 minuto. */
export const TARJETAS_PARA_LECCION = 5;

/**
 * ¿Puede aparecer un consejo ahora? Nunca en pánico, nunca con una tarjeta abierta ni con otro globo, y una sola vez por sesión.
 * Con los consejos apagados o sin memoria local (la función está apagada), tampoco.
 */
export function puedeMostrarConsejo({ activos, disponible, panico, tarjetaAbierta, globoVisible, yaEnSesion, hayConsejo }) {
  return Boolean(activos && disponible === true && !panico && !tarjetaAbierta && !globoVisible && !yaEnSesion && hayConsejo);
}

/** ¿Toca ofrecer la lección? Una vez por día, después de la tarjeta número 5, y si no se hizo ya. */
export function debeOfrecerLeccion(estado, { activos, disponible, panico, tarjetaAbierta, hayConsejos }) {
  return Boolean(
    activos && disponible === true && !panico && !tarjetaAbierta && hayConsejos
    && estado.tarjetas >= TARJETAS_PARA_LECCION && !estado.ofrecida && !estado.leccion,
  );
}

export function marcarOfrecida(estado) {
  return { ...estado, ofrecida: true };
}

export function marcarLeccion(estado) {
  return { ...estado, leccion: true };
}

/** Lista de ids de consejos ya vistos, leída de localStorage: solo cadenas y sin repetir. */
export function listaVistos(guardado) {
  if (!Array.isArray(guardado)) return [];
  return [...new Set(guardado.filter((id) => typeof id === 'string' && id.length <= 20))].slice(0, 200);
}

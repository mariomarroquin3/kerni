/**
 * Límite de turnos por clave en una ventana de tiempo. Protege el costo del
 * modelo ante abuso o bucles. En memoria: suficiente para un backend local.
 */
export function createLimitador({ max, ventanaMs = 60_000, now = () => Date.now() }) {
  const marcas = new Map();
  return {
    permitir(clave) {
      const t = now();
      const recientes = (marcas.get(clave) ?? []).filter((m) => t - m < ventanaMs);
      if (recientes.length >= max) {
        marcas.set(clave, recientes);
        return false;
      }
      recientes.push(t);
      marcas.set(clave, recientes);
      return true;
    },
  };
}

export function combinarLimitadores(...limitadores) {
  return { permitir: (clave) => limitadores.every((l) => l.permitir(clave)) };
}

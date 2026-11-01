// Vigilancia de enlaces copiados: lógica pura (sin DOM, sin red, sin almacenamiento). Testable con node:test.
//
// Regla: el portapapeles solo se mira con la opción activa, con la ventana enfocada y sin pánico ni tarjeta abierta.
// Lo último visto vive solo en memoria: nunca se guarda, nunca se registra y nunca sale de la PC salvo que la
// persona apriete "Revisar" en la burbuja (eso lo hace main.js, no este módulo).

import { enlaceUnicoEnTexto } from './intenciones.js';

/** Sí o no a leer el portapapeles. Con la opción apagada no se lee NUNCA. */
export function debeLeerPortapapeles({ activo, enfocada, panico = false, tarjetaAbierta = false } = {}) {
  return activo === true && enfocada === true && panico !== true && tarjetaAbierta !== true;
}

/**
 * Recuerda el último texto visto y el último enlace ofrecido, para no repetir la burbuja por el mismo enlace.
 * `mirar(texto)` devuelve el enlace nuevo (para ofrecer) o null.
 */
export function crearVigilanteEnlaces() {
  let ultimoTexto = null;  // en memoria: el último contenido visto (solo para no procesarlo dos veces)
  let ultimoEnlace = null; // el último enlace visto u ofrecido

  return {
    /** Toma lo que hay ahora en el portapapeles sin ofrecer nada (al encender la opción: lo de antes no molesta). */
    marcarVisto(texto) {
      ultimoTexto = typeof texto === 'string' ? texto : null;
      ultimoEnlace = enlaceUnicoEnTexto(texto);
    },
    /** Devuelve el enlace si es nuevo; null si no hay enlace o es el mismo de antes. */
    mirar(texto) {
      if (typeof texto !== 'string' || texto === ultimoTexto) return null;
      ultimoTexto = texto;
      const enlace = enlaceUnicoEnTexto(texto);
      if (!enlace || enlace === ultimoEnlace) return null;
      ultimoEnlace = enlace;
      return enlace;
    },
  };
}

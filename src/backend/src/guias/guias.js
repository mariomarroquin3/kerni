// Guías paso a paso: los pasos son datos fijos escritos aquí, nunca los genera el modelo ni vienen del sistema.
//
// Cada paso es una sola acción para la persona:
//   - tipo "instruccion": Kerni solo dice qué hacer (la persona lo hace en Windows).
//   - tipo "accion": Kerni propone una acción de la lista cerrada de `proponer_accion`. La propuesta pasa por
//     `validarPropuesta` (acciones.js) y por la tarjeta de confirmación: la guía nunca ejecuta nada (regla 1).
//
// Las fuentes de cada texto son las guías de conocimiento/windows/ y conocimiento/office/. Si cambia una, cambiar esto.
// Los textos van en español (voseo salvadoreño), sin emojis.

/** @typedef {{ texto: string, tipo: 'instruccion' } | { texto: string, tipo: 'accion', motivo: string, propuesta: { accion: string, destino?: string } }} PasoGuia */
/** @typedef {{ id: string, titulo: string, intro: string, pasos: PasoGuia[] }} Guia */

/** @type {ReadonlyArray<Guia>} */
export const GUIAS = Object.freeze([
  Object.freeze({
    id: 'pc-lenta',
    titulo: 'PC lenta',
    intro: 'Vamos por partes: miramos qué consume más, qué arranca con Windows y cuánto espacio queda. No cierro ni borro nada sin que lo decidas.',
    pasos: Object.freeze([
      // Fuente: procesos-y-rendimiento.md (Administrador de tareas, Ctrl + Mayús + Esc).
      { texto: 'Abrí el Administrador de tareas con Ctrl + Mayús + Esc y, en la pestaña Procesos, mirá cuáles usan más CPU y más memoria.', tipo: 'instruccion' },
      // Fuente: procesos-y-rendimiento.md (Programas que arrancan con Windows).
      {
        texto: 'Aprobá la tarjeta para ver qué programas se abren solos al prender la PC. Desactivá solo los que reconocés.',
        tipo: 'accion',
        motivo: 'Ver qué programas se abren solos al iniciar Windows.',
        propuesta: { accion: 'ver_programas_inicio' },
      },
      // Fuente: liberar-espacio-windows.md (Qué hace Kerni con esto: solo muestra cuánto ocupa cada carpeta).
      {
        texto: 'Aprobá la tarjeta para ver qué carpetas personales ocupan más espacio. Solo mira: no borra nada.',
        tipo: 'accion',
        motivo: 'Ver qué carpetas ocupan más espacio.',
        propuesta: { accion: 'ver_espacio_carpetas' },
      },
      // Fuente: procesos-y-rendimiento.md (Reiniciar de vez en cuando; apagar puede no ser reiniciar).
      { texto: 'Listo. Si sigue lenta, reiniciala desde el menú Inicio (no solo apagarla): eso cierra procesos colgados y libera memoria.', tipo: 'instruccion' },
    ]),
  }),
  Object.freeze({
    id: 'impresora-fuera-de-linea',
    titulo: 'Impresora fuera de línea',
    intro: 'Muchas veces basta con revisar la conexión, reiniciar la impresora y limpiar la cola. Vamos paso a paso.',
    pasos: Object.freeze([
      // Fuente: impresoras-windows.md (encendida, conectada; papel y tapas).
      { texto: 'Revisá que la impresora esté encendida, con papel y sin tapas abiertas, y conectada a la red Wi-Fi o a la PC por USB.', tipo: 'instruccion' },
      // Fuente: impresoras-windows.md (ruta de Windows 11).
      { texto: 'Abrí Configuración > Bluetooth y dispositivos > Impresoras y escáneres. Fijate si tu impresora aparece en la lista.', tipo: 'instruccion' },
      // Fuente: impresoras-windows.md (paso 2 del mensaje "fuera de línea").
      { texto: 'Apagá la impresora, desconectala de la corriente, esperá unos 30 segundos y volvé a encenderla.', tipo: 'instruccion' },
      // Fuente: impresoras-windows.md (La cola de impresión).
      { texto: 'Entrá a la cola de la impresora desde esa misma pantalla y cancelá los trabajos trabados que veas.', tipo: 'instruccion' },
      // Cierre: remite a la guía completa, con el solucionador y el reinicio del servicio de impresión.
      { texto: 'Si sigue fuera de línea, pedime la guía completa de impresoras de Windows: tiene el solucionador de Obtener ayuda y cómo quitarla y agregarla de nuevo.', tipo: 'instruccion' },
    ]),
  }),
  Object.freeze({
    id: 'espacio-en-disco',
    titulo: 'Espacio en disco',
    intro: 'Vamos a liberar espacio sin perder nada importante. Cada cosa que se borre la decidís vos.',
    pasos: Object.freeze([
      // Fuente: liberar-espacio-windows.md (Configuración > Sistema > Almacenamiento).
      {
        texto: 'Aprobá la tarjeta para abrir Almacenamiento en Configuración. Ahí Windows muestra qué ocupa más espacio.',
        tipo: 'accion',
        motivo: 'Abrir Almacenamiento en la configuración de Windows.',
        propuesta: { accion: 'abrir_ajuste', destino: 'almacenamiento' },
      },
      // Fuente: liberar-espacio-windows.md (La Papelera de reciclaje: cuidado).
      { texto: 'Abrí la Papelera de reciclaje y mirá cuánto hay adentro. Antes de vaciarla, revisá que no tenga nada que necesites: no se puede deshacer.', tipo: 'instruccion' },
      // Fuente: liberar-espacio-windows.md (Qué hace Kerni con esto).
      {
        texto: 'Aprobá la tarjeta para ver qué carpetas personales ocupan más espacio. Solo mira: no borra nada.',
        tipo: 'accion',
        motivo: 'Ver qué carpetas ocupan más espacio.',
        propuesta: { accion: 'ver_espacio_carpetas' },
      },
      // Cierre: Kerni nunca borra sin tarjeta; lo que se borra lo decide la persona.
      { texto: 'Recordá: Kerni no borra nada sin tarjeta y vos aprobás cada cosa. Lo que quieras borrar, revisalo antes; las fotos, videos y documentos mejor respaldarlos primero.', tipo: 'instruccion' },
    ]),
  }),
  Object.freeze({
    id: 'actualizaciones-pendientes',
    titulo: 'Actualizaciones pendientes',
    intro: 'Kerni solo mira qué hay pendiente. Instalar o no, lo decidís vos desde Windows.',
    pasos: Object.freeze([
      // Fuente: actualizaciones-windows.md (Qué hace Kerni con las actualizaciones; la consulta tarda).
      {
        texto: 'Aprobá la tarjeta para ver qué actualizaciones tiene pendientes Windows. La consulta puede tardar unos minutos y no instala nada.',
        tipo: 'accion',
        motivo: 'Ver si hay actualizaciones de Windows pendientes (no las instala).',
        propuesta: { accion: 'ver_actualizaciones' },
      },
      // Fuente: actualizaciones-windows.md (Dónde se ven).
      { texto: 'Abrí Configuración > Windows Update. Si querés instalar algo, lo hacés vos desde ahí, cuando te convenga.', tipo: 'instruccion' },
      // Fuente: actualizaciones-windows.md (Reinicios).
      { texto: 'Si Windows pide reiniciar, guardá tu trabajo y cerrá tus documentos antes de hacerlo.', tipo: 'instruccion' },
      // Cierre: si falla, historial y solucionador; luego técnico.
      { texto: 'Listo. Si una actualización falla, mirá el código en el historial de actualizaciones; si no se resuelve, consultá a un técnico.', tipo: 'instruccion' },
    ]),
  }),
]);

export const GUIA_IDS = Object.freeze(GUIAS.map((g) => g.id));

/** La guía con ese id, o null. Solo busca en la lista fija: un id que no está ahí no existe. */
export function buscarGuia(id) {
  return GUIAS.find((g) => g.id === id) ?? null;
}

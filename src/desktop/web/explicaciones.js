// Texto de "¿Por qué?" para cada tipo de tarjeta, por nombre de acción. Dice qué hace y qué NO hace.
// Lógica pura (sin DOM). El test de cobertura compara estas claves con ACCIONES de backend/src/acciones.js.

export const EXPLICACIONES = {
  terminar_proceso: 'Cierra el programa que elegiste; si tiene trabajo sin guardar, ese trabajo se pierde. Kerni nunca cierra procesos de Windows ni de seguridad.',
  congelar_proceso: 'Pausa el programa para que deje de usar CPU mientras está pausado. No lo cierra ni borra nada: lo podés reanudar después, y si tenía algo abierto puede quedarse sin responder.',
  reanudar_proceso: 'Vuelve a correr un programa que pausaste antes. No cambia nada más del programa ni de tus archivos.',
  limpiar_temporales: 'Borra archivos temporales de Windows con más de 24 horas de antigüedad. No toca tus documentos, fotos ni programas instalados.',
  ver_archivos_pesados: 'Lista los archivos y carpetas muy grandes que no se usan hace tiempo, mirando solo nombre, tamaño y fecha. No abre ni borra nada: qué borrar lo decidís vos.',
  ver_info_equipo: 'Lee el fabricante, el modelo, el sistema, el procesador y la memoria de tu equipo, y los muestra en pantalla. No cambia nada y no envía los datos a ningún lado.',
  ver_programas_inicio: 'Muestra qué programas se abren solos al prender la compu y si están activos. No desactiva ni desinstala nada.',
  ver_espacio_carpetas: 'Muestra las carpetas y archivos que más espacio ocupan en tus carpetas personales. No borra ni mueve nada.',
  ver_estado_red: 'Hace una prueba corta de tu conexión a internet y muestra el DNS y los adaptadores activos. No manda tus datos a ningún servidor.',
  ver_actualizaciones: 'Pregunta a Windows Update qué actualizaciones están pendientes. No descarga ni instala nada, y puede tardar unos minutos.',
  ver_reporte_soporte: 'Arma un resumen de texto con el equipo, la memoria, el disco, los programas de inicio y la red, sin rutas ni tu nombre de usuario. Solo se copia si tocás el botón; nunca se envía solo.',
  ver_dispositivos_red: 'Lista los dispositivos de tu red local que tu PC vio hace poco, usando la caché ARP. No escanea la red ni entra a ninguno de ellos.',
  ver_arranque: 'Mira cuánto tardó tu último arranque y cuántos programas se abren al iniciar. Solo lee datos de Windows y no cambia el inicio.',
  ver_salud_bateria: 'Compara cuánto carga hoy tu batería con cuánto cargaba nueva, según el informe de batería de Windows. Solo lee: no cambia ninguna configuración ni calibra nada.',
  ver_estado_seguridad: 'Lee lo que Windows dice de su antivirus, su cortafuegos y el control de cuentas. No activa ni desactiva nada, y que no haya alertas no garantiza que la PC esté libre de problemas.',
  ver_salud_disco: 'Le pide a Windows la salud que reporta cada disco. No prueba, no repara y no borra nada; una lectura sin alertas tampoco garantiza que el disco esté bien.',
  ver_puntos_restauracion: 'Lista los puntos de restauración que existen, para saber si hay a dónde volver. No crea ni borra ninguno.',
  ver_duplicados_posibles: 'Busca archivos con el mismo nombre y tamaño en tus carpetas personales. Son solo posibles copias: no abre los archivos y no borra ninguno.',
  ver_programas_sin_uso: 'Lista los programas instalados con su fecha de instalación. Windows no dice cuándo usaste cada uno, así que la fecha no prueba que no se usen; no desinstala nada.',
  ver_consumo_bateria: 'Mide unos segundos qué programas usan más CPU, para ver qué gasta la batería. Es aproximado y no cierra ningún programa.',
  abrir_ajuste: 'Abre una pantalla de Configuración de Windows de una lista cerrada. No cambia ningún ajuste: eso lo hacés vos en la pantalla que se abre.',
  vaciar_papelera: 'Borra para siempre lo que hay en la papelera de reciclaje. No se puede deshacer y no borra nada fuera de la papelera.',
  limpiar_cache_navegador: 'Borra la caché de Chrome y Edge: archivos guardados para abrir páginas más rápido. No borra cookies, contraseñas, historial, marcadores, sesiones ni extensiones; los navegadores abiertos se saltan.',
  cambiar_inicio: 'Activa o desactiva que un programa se abra solo al prender Windows. No lo desinstala y lo podés volver a activar cuando quieras.',
  recordar: 'Guarda un dato que aprobaste para acordarme de él en las próximas conversaciones. Se queda en esta PC y lo podés borrar cuando quieras.',
};

/** El texto de "¿Por qué?" para una tarjeta, o null si esa acción no tiene explicación (no debería pasar: lo cubre un test). */
export function explicarAccion(accion) {
  return Object.hasOwn(EXPLICACIONES, accion) ? EXPLICACIONES[accion] : null;
}

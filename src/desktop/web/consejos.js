// Consejos fijos para aprender sobre la salud y la seguridad de la PC. Texto revisado a mano, sin modelo y sin datos del equipo.
// Lógica pura (sin DOM): main.js los muestra con textContent y registra cada uno como visto en la base local.

export const CONSEJOS = [
  { id: 'c01', texto: 'svchost.exe no es un programa suelto: Windows lo usa para correr varios servicios a la vez. Cerrarlo puede dejar sin funcionar partes del sistema, por eso Kerni nunca lo cierra.' },
  { id: 'c02', texto: 'Cerrar procesos de Windows o de seguridad casi nunca hace la compu más rápida y puede romper algo. Lo que sí suele ayudar es cerrar los programas que abriste y ya no usás.' },
  { id: 'c03', texto: 'La caché del navegador son archivos guardados para abrir las páginas más rápido. Vaciarla libera espacio, pero no borra tus cookies, contraseñas ni historial.' },
  { id: 'c04', texto: 'Un punto de restauración es una foto de la configuración de Windows en un momento dado. Crear uno antes de instalar algo grande o un controlador te deja volver atrás si algo sale mal.' },
  { id: 'c05', texto: 'Los instaladores (.exe o .msi) que ya usaste suelen sobrar: ocupan espacio y casi nunca los necesitás de nuevo. Guardá solo los que quieras para reinstalar.' },
  { id: 'c06', texto: 'Los programas que se abren al iniciar Windows alargan el arranque. Desactivarlos no los desinstala: solo evita que se abran solos, y los podés reactivar.' },
  { id: 'c07', texto: 'Reiniciar la compu de vez en cuando aplica actualizaciones pendientes y libera memoria. Apagar no siempre alcanza: el inicio rápido de Windows guarda parte de la sesión.' },
  { id: 'c08', texto: 'Las actualizaciones de Windows suelen traer parches de seguridad. Conviene instalarlas aunque tarden; las definiciones del antivirus se instalan solas.' },
  { id: 'c09', texto: 'Un respaldo de tus archivos en otro lugar, como un disco externo o la nube, es lo que te salva si el disco falla. Ningún chequeo garantiza que el disco no va a fallar.' },
  { id: 'c10', texto: 'Si Windows reporta una alerta en la salud de un disco, respaldá tus archivos ya. Un disco con alerta puede fallar sin avisar.' },
  { id: 'c11', texto: 'La papelera guarda lo que borrás y ocupa espacio. Vaciarla es para siempre, así que revisá antes qué hay adentro.' },
  { id: 'c12', texto: 'Dos archivos con el mismo nombre y tamaño pueden ser versiones distintas. Antes de borrar uno, abrilo y mirá cuál es el bueno.' },
  { id: 'c13', texto: 'Un mensaje que te apura a dar una contraseña o un dato del banco es una señal de estafa. Escribí la dirección del sitio vos mismo en vez de seguir el enlace.' },
  { id: 'c14', texto: 'Un antivirus activo y al día protege más que los programas que prometen acelerar la PC con un clic. Desconfiá de los limpiadores que te asustan con alertas.' },
  { id: 'c15', texto: 'Que la memoria RAM se vea llena no siempre es un problema: Windows usa la libre para acelerar las cosas. Lo que importa es si la compu se siente lenta.' },
  { id: 'c16', texto: 'Cuando la compu anda lenta, mirá primero qué programa usa más CPU o memoria antes de reiniciar a ciegas. Así sabés qué está pesando.' },
  { id: 'c17', texto: 'Un programa que ya no usás puede seguir ocupando espacio. Desinstalarlo desde Configuración, en Aplicaciones, es más seguro que borrar su carpeta a mano.' },
  { id: 'c18', texto: 'Usar una contraseña distinta para cada cuenta evita que una filtración en un sitio abra las demás. Un gestor de contraseñas ayuda a recordarlas.' },
  { id: 'c19', texto: 'Guardá tu trabajo seguido, sobre todo antes de cerrar un programa o apagar la compu. Así, si algo falla, no perdés horas.' },
  { id: 'c20', texto: 'Si la batería se descarga muy rápido, puede que esté gastada o que algún programa consuma mucho. Kerni puede mostrar qué programas usan más CPU mientras mide la batería.' },
];

/** Primer consejo que la persona todavía no vio, o null si ya los vio todos. `vistos` es una lista de ids. */
export function siguienteConsejo(vistos = [], consejos = CONSEJOS) {
  const vistosSet = new Set(vistos);
  return consejos.find((c) => !vistosSet.has(c.id)) ?? null;
}

/** Hasta `n` consejos no vistos, en orden, para la mini-lección. Puede devolver menos (o ninguno) si quedan pocos. */
export function proximosConsejos(vistos = [], n = 3, consejos = CONSEJOS) {
  const vistosSet = new Set(vistos);
  return consejos.filter((c) => !vistosSet.has(c.id)).slice(0, n);
}

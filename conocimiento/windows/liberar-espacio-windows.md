# Liberar espacio en Windows sin perder nada importante

Cuando el disco está lleno, Windows va más lento, las actualizaciones fallan y los programas no pueden guardar. Esta guía explica cómo ver qué ocupa espacio y cómo liberarlo con cuidado.

## Primero: mirá qué ocupa el espacio
Abrí Configuración > Sistema > Almacenamiento. Ahí Windows muestra qué categorías usan más espacio (aplicaciones, documentos, archivos temporales, etc.). Mirá antes de borrar: así sabés qué vale la pena limpiar.

## Storage Sense (el limpiador que ya trae Windows)
Storage Sense borra solo algunos archivos que Windows considera temporales y ayuda a liberar espacio para las actualizaciones. Se activa desde la página Almacenamiento (Configuración > Sistema > Almacenamiento).

Lo que te conviene saber:
- Por defecto viene desactivado.
- Solo limpia la unidad del sistema (normalmente C:).
- Solo funciona si tenés sesión iniciada y estás conectado a internet.
- Podés elegir cada cuánto corre. Por defecto corre cuando el disco se queda sin espacio.
- Podés decidir cuánto tiempo se guardan los archivos de la Papelera de reciclaje antes de borrarse solos.
- La carpeta Descargas no se toca a menos que actives la opción de borrar archivos de Descargas que no se abrieron en cierto tiempo. Si la activás, revisá la carpeta de vez en cuando.
- Los archivos en la nube que no uses pueden pasar a "solo en línea". Eso no los borra: siguen en la nube y se descargan al abrirlos.

## Archivos temporales y recomendaciones de limpieza
En la misma página de Almacenamiento hay una sección de archivos temporales y de recomendaciones de limpieza. Ahí Windows te muestra categorías de archivos que puede borrar y te deja elegir cuáles quitar.

Regla simple: marcá solo lo que entendés. Antes de confirmar, leé cada categoría. Si no sabés qué es, no lo borres.

## La Papelera de reciclaje: cuidado
Vaciar la Papelera borra para siempre los archivos que están ahí. No hay forma sencilla de recuperarlos después. Antes de vaciarla:
- Revisá que no esté un archivo que necesitás.
- Pensá que lo que borrás de la Papelera ya no se puede deshacer.

Si usás OneDrive, tené en cuenta que los archivos borrados desde la nube pueden tener su propia papelera con plazo. Revisá la ayuda de OneDrive antes de asumir que ya no existen.

## Qué no conviene borrar
- Carpetas de Windows (por ejemplo, Windows, Program Files) ni archivos que no reconocés en la raíz de C:.
- Archivos de programas que todavía usás. Desinstalá los que no usás desde Configuración > Aplicaciones.
- Fotos, videos o documentos "porque ocupan mucho". Antes de borrarlos, hacé una copia de respaldo.

## Desinstalar lo que no usás
Los programas que ya no usás ocupan espacio y a veces arrancan solos. Revisalos en Configuración > Aplicaciones. Desinstalar desde ahí es más seguro que borrar la carpeta a mano.

## Qué hace Kerni con esto
Kerni no borra archivos por su cuenta:
- Puede limpiar archivos temporales de más de 24 horas, pero siempre te muestra una tarjeta de confirmación y solo actúa si aprobás.
- Puede listar archivos pesados o viejos de tus carpetas personales (Descargas, Escritorio, Documentos, Videos, Imágenes y Música). Solo los muestra: no hay ninguna acción que los borre. Si querés borrarlos, lo decidís vos desde el Explorador de archivos.
- Puede mostrar cuánto ocupa cada carpeta personal, sin tocar nada.

## Si el disco sigue lleno
- Mirá si tenés un disco externo o una memoria USB con espacio para mover fotos y videos. Movelos con cuidado: primero copiá, verificá que se abran, y recién después borrá el original.
- Si el disco se llena de forma rápida y sin razón, puede haber un problema del disco. Consultá a un técnico antes de que falle.

## Fuentes
- Microsoft Support, "Free up space for Windows updates": https://support.microsoft.com/en-us/windows/deployment/updates-lifecycle/free-up-space-for-windows-updates
- Microsoft Support, "Manage drive space with Storage Sense": https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/manage-drive-space-with-storage-sense
- Microsoft Support, "Delete a file": https://support.microsoft.com/en-us/office/collab-files/delete-a-file

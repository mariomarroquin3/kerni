# Errores comunes de Windows y qué hacer primero

Esta guía explica, en palabras simples, algunos mensajes que aparecen con frecuencia en Windows 11 y qué conviene probar primero. No cubre todos los errores posibles. Si el mensaje no aparece aquí, buscalo en la ayuda de Microsoft o consulta a un técnico.

Los nombres de menú de esta guía son los de Windows 11 en español, tal como los documenta Microsoft en inglés. Si en tu PC se llaman distinto, usá la lupa de Configuración con la palabra clave.

## Regla general antes de tocar nada
Antes de probar cualquier cosa, anotá el texto exacto del mensaje o el código que aparece (por ejemplo 0x80070005). Ese código es lo que más ayuda a encontrar la solución oficial. Si el problema afecta un archivo importante, primero hacé una copia de respaldo de ese archivo.

## "No se puede eliminar el archivo porque está en uso"
Windows no puede borrar un archivo mientras algún programa lo tiene abierto. Microsoft lo dice con claridad: no se puede eliminar un archivo mientras alguien lo tenga abierto en cualquier programa, y tiene que estar cerrado antes.

Qué probar:
1. Cerrá el documento, la foto, el video o el programa que lo esté usando. Revisá también las ventanas que quedaron minimizadas.
2. Si no encontrás cuál programa lo tiene abierto, reiniciá la PC. Antes, guardá tu trabajo.
3. Después del reinicio, intentá borrarlo otra vez.

## "Espacio en disco insuficiente"
Significa que el disco donde Windows guarda sus cosas (normalmente C:) está lleno. Puede hacer que las actualizaciones fallen y que el equipo vaya más lento.

Qué probar: revisá la guía *liberar-espacio-windows.md*. Empezá por Configuración > Sistema > Almacenamiento, que muestra qué ocupa lugar. No borres carpetas del sistema para ganar espacio.

## "Acceso denegado" o código 0x80070005
Quiere decir que Windows no tiene permiso para hacer lo que pediste. En la página de Microsoft sobre problemas de actualización, este código aparece asociado a revisar que tengas acceso de administrador y, si hace falta, desactivar temporalmente el antivirus o el firewall de terceros.

Qué probar:
1. Confirmá que la cuenta con la que usás la PC es de administrador (buscalo en la lupa de Configuración; la ruta exacta en tu versión: verificar).
2. Si el error aparece al instalar algo, cerrá el instalador y volvé a intentarlo.
3. No desactives el antivirus si no sabés por qué lo hacés. Si lo desactivás para instalar algo, activalo de nuevo al terminar.

## "La PC se reinició sola"
Hay que distinguir dos casos:

- **Reinicio por actualización.** Algunas actualizaciones necesitan reiniciar para terminar de instalarse. Windows intenta hacerlo cuando no estás usando la PC, o te pide elegir un horario. Podés programar el reinicio en Configuración > Windows Update > Programar el reinicio (ruta de Windows 11 según Microsoft).
- **Reinicio inesperado.** Si no hubo actualización y la PC se reinicia sola con frecuencia, conviene revisar el calor, la fuente de poder y la memoria, y consultar a un técnico si se repite. Esta guía no tiene un procedimiento verificado para este caso; no abras la PC para revisarla sin saber qué hacés.

## "La actualización de Windows no se pudo instalar"
Es el caso con más códigos oficiales. Los pasos seguros, en orden, son:

1. Ejecutá el solucionador de problemas: Configuración > Sistema > Solucionar problemas > Otros solucionadores de problemas, y después Ejecutar junto a Windows Update.
2. Reiniciá la PC y volvé a buscar actualizaciones.
3. Si sigue fallando, mirá el código en Configuración > Windows Update > Historial de actualizaciones y buscalo en la ayuda de Microsoft.

Algunos códigos que Microsoft documenta para actualizaciones y lo que sugiere:

| Código | Qué sugiere Microsoft |
|---|---|
| 0x8007000d | Limpiar la caché de Windows Update y volver a ejecutar el solucionador |
| 0x800705b4 | Revisar la conexión a internet, reiniciar y desactivar temporalmente antivirus o firewall |
| 0x80240034 | Revisar que el servicio de Windows Update esté funcionando |
| 0x800f0922 | Liberar espacio en disco y desactivar la VPN si la usás |
| 0x80070002 | Reiniciar, ejecutar el solucionador y revisar el espacio libre |
| 0x80070005 | Confirmar acceso de administrador (ver arriba) |
| 0x80070057 o 0x80080005 | Ejecutar el revisor de archivos del sistema (sfc /scannow) |
| 0xC1900101 | Revisar controladores de red o de video; Microsoft sugiere reinstalarlos desde el Administrador de dispositivos y luego hacer un inicio limpio |

Los pasos del Administrador de dispositivos y del inicio limpio son más técnicos. Si tenés que hacerlos, pedí ayuda a alguien de confianza. No los hagas en una PC de trabajo sin permiso.

## "El equipo no tiene la hora correcta"
Una hora mal puesta puede hacer fallar actualizaciones y conexiones seguras (páginas https). Revisá la guía *hora-y-certificados.md*.

## Antes de llamar a un técnico
Tené a mano:
- El texto exacto del mensaje o el código.
- Qué hacías cuando apareció y desde cuándo pasa.
- Si hubo una actualización o un programa instalado justo antes.
- Lo que ya probaste.

## Fuentes
- Microsoft Support, "Troubleshoot problems updating Windows": https://support.microsoft.com/en-us/windows/deployment/updates-lifecycle/troubleshoot-problems-updating-windows
- Microsoft Support, "Delete a file": https://support.microsoft.com/en-us/office/collab-files/delete-a-file
- Microsoft Support, "Windows Update: FAQ": https://support.microsoft.com/en-us/windows/windows-update-faq-8a903416-6f45-0718-f5c7-375e92dddeb2
- Microsoft Support, "Manage drive space with Storage Sense": https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/manage-drive-space-with-storage-sense

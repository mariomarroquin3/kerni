# Restaurar sistema: puntos de restauración

Restaurar sistema es una herramienta de Windows que devuelve la configuración del sistema a un momento anterior. Sirve para deshacer cambios que dejaron la PC inestable, como una instalación de programa que rompió algo. Esta guía explica qué hace, qué no hace y cuándo conviene usarla.

## Qué es un punto de restauración
Un punto de restauración es una foto de la configuración del sistema en un momento determinado. Windows guarda esas fotos de forma automática durante eventos importantes, como instalar programas o actualizaciones, y también podés crear una a mano.

Según Microsoft, cuando elegís un punto de restauración, Windows vuelve a la configuración del sistema, el registro y los programas instalados tal como estaban en ese momento.

## Qué no toca
Según la ayuda de Microsoft, restaurar el sistema deshace cambios sin afectar tus archivos personales: documentos, fotos y videos no se modifican. Sin embargo:
- Los programas que se instalaron después del punto de restauración pueden desaparecer.
- Los controladores (drivers) y la configuración que cambiaste después también vuelven atrás.

Antes de elegir un punto, usá el botón de buscar programas afectados (la página de Microsoft lo menciona como "Scan for affected programs") para ver qué se va a eliminar o restaurar. Así no te llevás sorpresas.

Importante: un punto de restauración **no es una copia de respaldo**. No guarda tus archivos personales como una copia completa. Para eso, mirá las buenas prácticas de copias de seguridad en *buenas-practicas/mantenimiento-de-la-pc.md*.

## Cómo abrirla
- Desde Windows: Panel de control > Recuperación > Abrir Restaurar sistema. También podés presionar la tecla Windows + R, escribir `rstrui.exe` y confirmar.
- Si Windows no arranca: en el entorno de recuperación, Solucionar problemas > Opciones avanzadas > Restaurar sistema (ruta de Microsoft).

Si el equipo tiene cifrado BitLocker, puede pedir la clave de recuperación para completar el proceso. Esa clave solo la debe ingresar la persona dueña de la cuenta, en su propio equipo. Nunca la compartas con nadie que te la pida por teléfono o mensaje.

## Cuándo sirve
- Después de instalar un programa o un controlador que dejó la PC inestable.
- Cuando una actualización causó problemas graves y hay un punto anterior.
- Cuando Windows se comporta de forma extraña después de un cambio reciente que sabés identificar.

No sirve para virus que ya dañaron archivos personales, ni para recuperar un archivo borrado. Para eso, mirá la papelera o una copia de respaldo.

## Antes de hacer cambios grandes
Una buena costumbre es crear un punto de restauración manual antes de instalar un programa grande, un controlador o un cambio de configuración. Así, si algo sale mal, tenés a dónde volver. Esta recomendación es general; el punto no reemplaza la copia de respaldo.

## Si no aparecen puntos
Puede que la función de protección del sistema esté desactivada en esa unidad, o que no se hayan creado puntos recientemente. Revisá la ayuda de Microsoft sobre la protección del sistema antes de activarla; no hay un procedimiento verificado en esta guía para hacerlo.

## Antes de restaurar, no olvides
1. **Guardá tu trabajo** y cerrá los programas. La PC puede reiniciarse varias veces durante el proceso.
2. **Hacé una copia de respaldo** de los archivos importantes, aunque la restauración no los toque en teoría. Antes de algo riesgoso, la copia es el seguro real.
3. Anotá los programas que instalaste recientemente, para reinstalarlos si hacen falta.
4. Conectá la laptop al cargador. No apagues la PC mientras restaura.

## Fuentes
- Microsoft Support, "System Restore": https://support.microsoft.com/en-us/windows/experience/backup-recovery/system-restore

# Actualizaciones de Windows: lo básico

Las actualizaciones corrigen fallos y cierran huecos de seguridad. Por eso conviene tenerlas al día. Esta guía explica cómo revisarlas, cómo pausarlas por un tiempo y qué esperar cuando piden reiniciar.

## Dónde se ven
En Windows 11, abrí Configuración > Windows Update. Ahí ves si hay actualizaciones disponibles o pendientes y podés buscar nuevas.

Para ver lo que ya se instaló, entrá a Configuración > Windows Update > Historial de actualizaciones. Si una actualización falló, ese historial muestra el código de error, que sirve para buscar la solución oficial (ver *errores-comunes-windows.md*).

## Pausar las actualizaciones
Podés pausar las actualizaciones por un tiempo corto, por ejemplo si estás en medio de un trabajo importante o de una presentación.

Según Microsoft:
- Podés pausar hasta 35 días desde hoy. El calendario solo deja elegir fechas dentro de ese límite.
- Cuando termina la pausa, las actualizaciones se reanudan solas si no hacés nada.
- Podés reanudarlas antes, manualmente. Windows entonces busca e instala lo más reciente.
- Pausar no apaga las actualizaciones para siempre. Si llegás al límite de la pausa, tenés que instalar lo último antes de poder volver a pausar.
- Una actualización que estaba en curso se cancela al pausar, y la PC no se reinicia sola para terminarla hasta que termine la pausa.

La ruta, según Microsoft: Inicio > Configuración > Windows Update, y en el control Pausar actualizaciones.

Microsoft también dice que no se pueden detener las actualizaciones por completo. No busques "desactivar Windows Update" en sitios que prometen hacerlo: suelen dejar la PC sin parches de seguridad.

## Reinicios
Algunas actualizaciones necesitan reiniciar para terminar de instalarse. Antes de reiniciar:
- **Guardá tu trabajo.** Cerrá documentos, cerrá el navegador o dejá todo guardado.
- Si no querés que pase en medio del día, programá el reinicio en Configuración > Windows Update > Programar el reinicio (ruta según Microsoft para Windows 11).

Windows intenta reiniciar cuando no estás usando la PC. Si no puede, te pide elegir un horario.

## Mientras actualiza
Es normal que la PC vaya más lenta un rato mientras descarga e instala. No la apagues a la fuerza mientras dice que está instalando: eso puede dejar la instalación a medias. Esperá a que termine o, si hay un reinicio pendiente, hacelo de forma normal.

## Si la actualización falla
1. Ejecutá el solucionador: Configuración > Sistema > Solucionar problemas > Otros solucionadores de problemas, y después Ejecutar junto a Windows Update.
2. Reiniciá y volvé a buscar actualizaciones.
3. Si sigue fallando, anotá el código del historial y buscalo en la ayuda de Microsoft.

Si después de todo esto sigue fallando, no intentes reparaciones avanzadas por tu cuenta. Consultá a un técnico o a quien administra el equipo, sobre todo si es una PC de trabajo o de la institución.

## Espacio para actualizar
Las actualizaciones necesitan espacio libre en la unidad del sistema. Si no lo tienen, fallan. Para liberarlo, mirá *liberar-espacio-windows.md*.

## Qué hace Kerni con las actualizaciones
Kerni solo las consulta. Puede preguntarle a Windows Update qué actualizaciones hay pendientes y mostrártelas en un panel. Esa consulta puede tardar varios minutos.

Kerni no descarga, no instala y no reinicia nada: la decisión siempre es tuya, desde Configuración de Windows.

Las definiciones del antivirus también aparecen en la lista, pero no se cuentan como pendientes.

## Fuentes
- Microsoft Support, "Pause updates in Windows": https://support.microsoft.com/en-us/windows/deployment/updates-lifecycle/pause-updates-in-windows
- Microsoft Support, "Windows Update: FAQ": https://support.microsoft.com/en-us/windows/windows-update-faq-8a903416-6f45-0718-f5c7-375e92dddeb2
- Microsoft Support, "Troubleshoot problems updating Windows": https://support.microsoft.com/en-us/windows/deployment/updates-lifecycle/troubleshoot-problems-updating-windows

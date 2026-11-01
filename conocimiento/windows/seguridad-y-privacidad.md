# Seguridad y privacidad en Windows

## Cómo identificar enlaces y correos de phishing
El phishing es un intento de engaño para robar contraseñas, datos personales o bancarios fingiendo ser una entidad de confianza (bancos, servicios de correo, paqueterías o redes sociales). Las señales de alerta más comunes son: mensajes con sensación de urgencia ("tu cuenta será cerrada en 24 horas"), direcciones de remitente dudosas con letras cambiadas (como `paypa1.com` o `banco-soporte.xyz`), y enlaces con arroba (`@`) o acortadores que ocultan el destino real. La regla fundamental es nunca introducir contraseñas ni datos bancarios desde un enlace recibido por correo o mensaje; siempre es más seguro entrar escribiendo la dirección oficial directamente en el navegador.

## Windows Defender y protección en tiempo real
Windows incluye de fábrica Seguridad de Windows (cuyo proceso es `MsMpEng.exe`). Este antivirus integrado protege contra malware, ransomware y sitios fraudulentos sin costo adicional. Analiza archivos nuevos y descargas en segundo plano. No es necesario instalar antivirus de terceros adicionales: tener dos antivirus activos al mismo tiempo ralentiza la PC, crea conflictos en el sistema y satura la memoria RAM. Si `MsMpEng.exe` consume CPU por unos minutos, es normal mientras realiza un examen periódico y se calma solo al terminar.

## Contraseñas seguras y verificación en dos pasos (2FA)
Una contraseña segura tiene al menos 12 caracteres y combina letras, números y símbolos sin incluir nombres propios ni fechas de cumpleaños. Reutilizar la misma clave en varias páginas es el mayor riesgo: si un sitio sufre una brecha de seguridad, los atacantes probarán esa clave en tus correos y redes. Conviene apoyarse en un gestor de contraseñas confiable en lugar de guardarlas en notas sin cifrar. Además, activar la verificación en dos pasos (código al celular o app de autenticación) impide el acceso aunque alguien adivine tu contraseña.

## Permisos de aplicaciones y privacidad
En Windows se puede controlar qué programas acceden a componentes sensibles. Desde Configuración > Privacidad y seguridad se pueden revistar los permisos de cámara, micrófono, ubicación y notificaciones. Si una aplicación que no necesita micrófono (por ejemplo un juego solitario o un visor de fotos) pide acceso, se le puede revocar el permiso sin que deje de funcionar. Desactivar el inicio automático de aplicaciones en segundo plano que no usás a diario protege tu privacidad y ahorra memoria RAM.

## Descargas seguras y programas sospechosos
Para evitar virus y software publicitario no deseado (adware), descargá programas únicamente desde las páginas web oficiales de sus creadores o desde Microsoft Store. Al instalar programas gratuitos, prestá atención a cada pantalla del instalador y desmarcá casillas que ofrezcan instalar barras de búsqueda, navegadores extra o supuestos optimizadores milagrosos. Esos programas añadidos suelen saturar el procesador, mostrar publicidad molesta y ralentizar el arranque de la computadora.

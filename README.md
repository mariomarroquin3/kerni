# Kerni

Kerni es una mascota de escritorio que cuida la salud de tu PC con Windows. Mira tu CPU, memoria, disco y procesos en tiempo real, te lo explica en español salvadoreño y, cuando algo anda mal, **te propone** qué hacer: vos aprobás o rechazás cada acción en pantalla.

Basado en la propuesta *CyberPet AI* ([`docs/`](docs)) y construido con el mismo patrón que Bitoo: app Tauri transparente + backend con harness de agente (Claude).

## Qué hace hoy (hito 1: Salud + Pánico)

- **Se ve cómo está tu PC**: barras de CPU, RAM y disco, y una mascota que cambia de ánimo (feliz, normal, cansado, pánico).
- **Personaje animado en Rive** con ocho modos. Su cara sigue la carga de la **batería** (70 % o más: sonriente; 30-69 %: seria; menos de 30 %: aburrida) y reacciona: alegre, asustado, investigando, alerta y dormido (tras 3 minutos sin interacción).
- **Discreto**: en reposo se vuelve un poco transparente, y un botón oculta o muestra las métricas (se recuerda la preferencia).
- **Modo pánico**: si la CPU pasa de 95% de forma sostenida, Kerni se pone en alerta roja y te muestra qué procesos la están usando, con un botón para cerrarlos.
- **Alimentar a Kerni**: limpia los archivos temporales de más de 24 horas.
- **Chat**: preguntale "¿por qué está lenta mi compu?". Kerni responde con tus números reales y puede proponer cerrar un proceso o limpiar temporales.

## Seguridad por diseño

1. El modelo **no ejecuta nada**; solo propone. Cada acción pasa por una tarjeta de confirmación.
2. La propuesta se valida dos veces: en el backend contra la foto del sistema y en Rust antes de ejecutarse.
3. Los procesos de Windows y de seguridad están protegidos y no se pueden cerrar.
4. El backend escucha solo en `127.0.0.1` y la llave del modelo nunca llega a la app.

## Cómo correrlo

Doble clic en **`Kerni.bat`**. Instala lo que falte la primera vez, enciende el backend si hay llave y abre la app. Kerni aparece en la esquina inferior derecha; se cierra con clic derecho sobre él o desde su ícono en la bandeja.

- La **primera vez** compila Rust y tarda varios minutos. Después abre en segundos.
- **Sin llave de modelo** todo funciona menos el chat con IA (RAM, disco, pánico y limpiar temporales son reglas locales). Para activarlo, pegá **una** llave en `src/backend/.env`: `GEMINI_API_KEY=`, `OPENROUTER_API_KEY=` o `ANTHROPIC_API_KEY=`. Con `LLM_PROVIDER=` elegís cuál usar si hay varias.
- Para comprobar tu llave: `cd src/backend && npm run probar-llm`.
- `Kerni.bat check` solo revisa que todo esté en orden, sin abrir nada.

Necesitás Node 22+ y Rust (con las dependencias de Tauri para Windows).

A mano:

```bash
cd src/backend && npm ci && cp .env.example .env && npm run dev   # backend
cd src/desktop && npm ci && npm run dev                            # app (otra terminal)
```

Más detalle, reglas del repo y pendientes en [`AGENTS.md`](AGENTS.md).

## Estructura

| Carpeta | Contenido |
|---|---|
| [`src/backend`](src/backend) | Harness del agente, persona, validación de acciones, API `/chat` |
| [`src/desktop`](src/desktop) | App Tauri: interfaz y núcleo Rust que lee y actúa sobre el sistema |
| [`src/prompts`](src/prompts) | Registro de interacciones con IA |
| [`docs`](docs) | Propuesta original y decisiones |

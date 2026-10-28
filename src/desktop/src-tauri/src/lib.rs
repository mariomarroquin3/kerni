//! Proceso nativo de Kerni.
//!
//! - Pone la ventana en la esquina inferior derecha de la pantalla.
//! - Deja pasar los clics por las zonas transparentes: la ventana solo
//!   "existe" donde están Kerni, su globo, el chat o las confirmaciones.
//!   Rust emite la posición física del cursor a JS cada 66 ms; JS usa
//!   `elementFromPoint` (coordenadas CSS, siempre correctas en cualquier DPI)
//!   y devuelve si el cursor está sobre una zona interactiva via `set_interactivo`.
//! - Ícono en la bandeja y menú con clic derecho para ocultar o cerrar.
//! - Los comandos que tocan el sistema viven en `sistema.rs`.

mod herramientas;
mod sistema;

#[cfg(target_os = "linux")]
mod linux;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow};

/// Margen entre Kerni y el borde de la pantalla, en píxeles lógicos.
const MARGEN: f64 = 16.0;

/// Posición del cursor relativa a la esquina superior izquierda del contenido
/// de la ventana, en píxeles físicos. Se emite a JS para que determine si
/// el cursor está sobre una zona interactiva.
#[derive(Clone, serde::Serialize)]
struct CursorPosicion {
    x: f64,
    y: f64,
}

/// Resultado que JS devuelve tras su comprobación con elementFromPoint.
struct CursorInteractivo(AtomicBool);

impl Default for CursorInteractivo {
    fn default() -> Self {
        // Al arrancar, se reciben eventos hasta que JS responda.
        CursorInteractivo(AtomicBool::new(true))
    }
}

/// El front llama este comando tras comprobar con elementFromPoint si el cursor
/// está sobre una zona interactiva (.zona). Sin conversión de coordenadas en
/// Rust: JS trabaja en CSS y siempre conoce su propio DPR.
#[tauri::command]
fn set_interactivo(interactivo: bool, estado: tauri::State<CursorInteractivo>) {
    estado.0.store(interactivo, Ordering::Relaxed);
}

fn crear_menu<R: Runtime, M: Manager<R>>(app: &M, texto_alternar: &str, texto_metricas: &str) -> tauri::Result<Menu<R>> {
    let alternar = MenuItem::with_id(app, "alternar", texto_alternar, true, None::<&str>)?;
    let metricas = MenuItem::with_id(app, "metricas", texto_metricas, true, None::<&str>)?;
    let pesados = MenuItem::with_id(app, "pesados", "Archivos pesados sin uso…", true, None::<&str>)?;
    let limpiar = MenuItem::with_id(app, "limpiar", "Limpiar temporales…", true, None::<&str>)?;
    let salir = MenuItem::with_id(app, "salir", "Cerrar Kerni", true, None::<&str>)?;
    let equipo = MenuItem::with_id(app, "equipo", "Información del equipo", true, None::<&str>)?;
    let inicio = MenuItem::with_id(app, "inicio", "Programas de inicio", true, None::<&str>)?;
    let espacio = MenuItem::with_id(app, "espacio", "Espacio por carpeta", true, None::<&str>)?;
    let red = MenuItem::with_id(app, "red", "Estado de la red", true, None::<&str>)?;
    let actualizaciones = MenuItem::with_id(app, "actualizaciones", "Actualizaciones de Windows", true, None::<&str>)?;
    let papelera = MenuItem::with_id(app, "papelera", "Vaciar la papelera…", true, None::<&str>)?;
    let herramientas = Submenu::with_items(app, "Más herramientas", true, &[&equipo, &inicio, &espacio, &red, &actualizaciones, &papelera])?;
    Menu::with_items(app, &[&alternar, &metricas, &pesados, &limpiar, &herramientas, &salir])
}

/// Avisa a la interfaz de una opción del menú. Las métricas están ocultas por defecto y se ven desde aquí;
/// "limpiar" solo abre la tarjeta de confirmación: nada se borra sin que la persona apruebe.
fn avisar_a_kerni(app: &AppHandle, evento: &str) {
    if let Some(ventana) = app.get_webview_window("kerni") {
        let _ = ventana.emit(evento, ());
    }
}

fn al_elegir(app: &AppHandle, id: &str) {
    match id {
        "alternar" => {
            if let Some(ventana) = app.get_webview_window("kerni") {
                if ventana.is_visible().unwrap_or(true) {
                    let _ = ventana.hide();
                } else {
                    let _ = ventana.show();
                }
            }
        }
        "metricas" => avisar_a_kerni(app, "alternar-metricas"),
        "pesados" => avisar_a_kerni(app, "pedir-archivos"),
        "limpiar" => avisar_a_kerni(app, "pedir-limpiar"),
        "equipo" => avisar_a_kerni(app, "pedir-equipo"),
        "inicio" => avisar_a_kerni(app, "pedir-inicio"),
        "espacio" => avisar_a_kerni(app, "pedir-espacio"),
        "red" => avisar_a_kerni(app, "pedir-red"),
        "actualizaciones" => avisar_a_kerni(app, "pedir-actualizaciones"),
        "papelera" => avisar_a_kerni(app, "pedir-papelera"),
        "salir" => app.exit(0),
        _ => {}
    }
}

/// Clic derecho sobre Kerni (en el touchpad, clic con dos dedos): abre el menú nativo en la posición del cursor.
/// `metricas_visibles` solo decide si la opción dice "Ver" u "Ocultar".
#[tauri::command]
fn menu_contextual(ventana: WebviewWindow, metricas_visibles: Option<bool>) -> Result<(), String> {
    let texto_metricas = if metricas_visibles.unwrap_or(false) { "Ocultar métricas" } else { "Ver métricas" };
    let menu = crear_menu(&ventana, "Ocultar a Kerni", texto_metricas).map_err(|e| e.to_string())?;
    ventana.popup_menu(&menu).map_err(|e| e.to_string())
}

/// Coloca la ventana en la esquina inferior derecha del área útil
/// (sin tapar la barra de tareas).
fn a_la_esquina(ventana: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = ventana.current_monitor()?.or(ventana.primary_monitor()?) else {
        return Ok(());
    };
    let area = monitor.work_area();
    let escala = monitor.scale_factor();
    let tamano = ventana.outer_size()?;
    let margen = (MARGEN * escala) as i32;
    let x = area.position.x + area.size.width as i32 - tamano.width as i32 - margen;
    let y = area.position.y + area.size.height as i32 - tamano.height as i32 - margen;
    ventana.set_position(PhysicalPosition::new(x, y))
}

/// Emite la posición física del cursor relativa al contenido de la ventana.
/// JS divide por devicePixelRatio para obtener coordenadas CSS y usa
/// elementFromPoint, que es DPI-agnóstico por definición.
fn emitir_cursor(ventana: &WebviewWindow) {
    let Ok(cursor) = ventana.cursor_position() else { return };
    let Ok(origen) = ventana.inner_position() else { return };
    // Ambos en píxeles físicos; la diferencia es la posición relativa a la ventana.
    let pos = CursorPosicion {
        x: cursor.x - origen.x as f64,
        y: cursor.y - origen.y as f64,
    };
    let _ = ventana.emit("cursor-movio", pos);
}

/// Handler de comandos: en Linux la limpieza de temporales vive en `linux.rs`.
#[cfg(target_os = "linux")]
fn crear_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        set_interactivo,
        menu_contextual,
        sistema::metricas,
        sistema::terminar_proceso,
        sistema::archivos_pesados,
        sistema::mostrar_en_carpeta,
        sistema::espacio_por_carpeta,
        herramientas::info_equipo,
        herramientas::programas_inicio,
        herramientas::cambiar_inicio,
        herramientas::estado_red,
        herramientas::actualizaciones_windows,
        herramientas::papelera,
        herramientas::vaciar_papelera,
        herramientas::abrir_ajuste,
        linux::limpiar_temporales,
    ]
}

#[cfg(not(target_os = "linux"))]
fn crear_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        set_interactivo,
        menu_contextual,
        sistema::metricas,
        sistema::terminar_proceso,
        sistema::archivos_pesados,
        sistema::mostrar_en_carpeta,
        sistema::espacio_por_carpeta,
        herramientas::info_equipo,
        herramientas::programas_inicio,
        herramientas::cambiar_inicio,
        herramientas::estado_red,
        herramientas::actualizaciones_windows,
        herramientas::papelera,
        herramientas::vaciar_papelera,
        herramientas::abrir_ajuste,
        sistema::limpiar_temporales,
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CursorInteractivo::default())
        .manage(sistema::Monitor::default())
        .invoke_handler(crear_handler())
        .on_menu_event(|app, evento| al_elegir(app, evento.id().as_ref()))
        .setup(|app| {
            // La ventana no tiene bordes ni aparece en la barra de tareas:
            // la bandeja es la salida segura.
            let menu = crear_menu(app, "Mostrar u ocultar", "Ver u ocultar métricas")?;
            let mut bandeja = TrayIconBuilder::with_id("kerni").tooltip("Kerni").menu(&menu);
            if let Some(icono) = app.default_window_icon() {
                bandeja = bandeja.icon(icono.clone());
            }
            bandeja.build(app)?;

            let ventana = app.get_webview_window("kerni").expect("falta la ventana kerni");
            a_la_esquina(&ventana)?;
            ventana.show()?;
            #[cfg(target_os = "linux")]
            ventana.set_focus()?;

            // En Linux, set_ignore_cursor_events deshabilita de forma permanente los clics
            // en compositores Wayland/X11. Por defecto se deshabilita en Linux y solo se
            // activa si la variable de entorno KERNI_CLICK_THROUGH es "1" o "true".
            #[cfg(target_os = "linux")]
            let activar_click_through = std::env::var("KERNI_CLICK_THROUGH")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            #[cfg(not(target_os = "linux"))]
            let activar_click_through = true;

            if activar_click_through {
                // Revisa el cursor unas 15 veces por segundo:
                // 1. Emite la posición física a JS para que compruebe con elementFromPoint.
                // 2. Lee la respuesta de JS (set_interactivo) y actualiza los eventos del cursor.
                // Al separar la detección en JS se evitan todos los problemas de escala
                // DPI entre Rust (píxeles físicos) y WebView (píxeles CSS).
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut ignorando: Option<bool> = None;
                    loop {
                        std::thread::sleep(Duration::from_millis(66));
                        let Some(ventana) = handle.get_webview_window("kerni") else { break };
                        // Emitir posición del cursor para que JS determine la zona.
                        emitir_cursor(&ventana);
                        // Leer el resultado que JS envió en la iteración anterior.
                        let interactivo = handle.state::<CursorInteractivo>().0.load(Ordering::Relaxed);
                        if ignorando != Some(!interactivo) {
                            let _ = ventana.set_ignore_cursor_events(!interactivo);
                            ignorando = Some(!interactivo);
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar Kerni");
}

//! Proceso nativo de Kerni.
//!
//! - Pone la ventana en la esquina inferior derecha de la pantalla.
//! - Deja pasar los clics por las zonas transparentes: la ventana solo
//!   "existe" donde están Kerni, su globo, el chat o las confirmaciones. El
//!   front avisa dónde están con el comando `zonas_interactivas`.
//! - Ícono en la bandeja y menú con clic derecho para ocultar o cerrar.
//! - Los comandos que tocan el sistema viven en `sistema.rs`.

mod almacen;
mod sistema;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewWindow};

/// Margen entre Kerni y el borde de la pantalla, en píxeles lógicos.
const MARGEN: f64 = 16.0;

/// Rectángulo en píxeles CSS (lógicos), relativo a la ventana.
#[derive(Clone, Copy, serde::Deserialize)]
struct Zona {
    x: f64,
    y: f64,
    ancho: f64,
    alto: f64,
}

#[derive(Default)]
struct Zonas(Mutex<Vec<Zona>>);

#[tauri::command]
fn zonas_interactivas(zonas: Vec<Zona>, estado: tauri::State<Zonas>) {
    *estado.0.lock().unwrap() = zonas;
}

fn crear_menu<R: Runtime, M: Manager<R>>(app: &M, texto_alternar: &str) -> tauri::Result<Menu<R>> {
    let alternar = MenuItem::with_id(app, "alternar", texto_alternar, true, None::<&str>)?;
    let salir = MenuItem::with_id(app, "salir", "Cerrar Kerni", true, None::<&str>)?;
    Menu::with_items(app, &[&alternar, &salir])
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
        "salir" => app.exit(0),
        _ => {}
    }
}

/// Clic derecho sobre Kerni: abre el menú nativo en la posición del cursor.
#[tauri::command]
fn menu_contextual(ventana: WebviewWindow) -> Result<(), String> {
    let menu = crear_menu(&ventana, "Ocultar a Kerni").map_err(|e| e.to_string())?;
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

/// ¿El cursor está sobre alguna zona interactiva?
fn sobre_zona(ventana: &WebviewWindow, zonas: &[Zona]) -> Option<bool> {
    let cursor = ventana.cursor_position().ok()?;
    let origen = ventana.inner_position().ok()?;
    let escala = ventana.scale_factor().ok()?;
    let x = (cursor.x - origen.x as f64) / escala;
    let y = (cursor.y - origen.y as f64) / escala;
    Some(
        zonas
            .iter()
            .any(|z| x >= z.x && x <= z.x + z.ancho && y >= z.y && y <= z.y + z.alto),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Zonas::default())
        .manage(sistema::Monitor::default())
        .invoke_handler(tauri::generate_handler![
            zonas_interactivas,
            menu_contextual,
            sistema::metricas,
            sistema::terminar_proceso,
            sistema::limpiar_temporales,
            almacen::registrar_evento,
            almacen::resumen_historial,
        ])
        .on_menu_event(|app, evento| al_elegir(app, evento.id().as_ref()))
        .setup(|app| {
            // El historial local (SQLite). Si la BD no se puede abrir, Kerni
            // sigue igual: el almacén queda desactivado y nada de esto hace panic.
            let almacen = match app.path().app_data_dir() {
                Ok(dir) => almacen::Almacen::abrir(&dir.join("kerni.db")),
                Err(err) => {
                    eprintln!(
                        "almacén: no sé dónde van los datos de la app: {err}; sigo sin historial"
                    );
                    almacen::Almacen::desactivado()
                }
            };
            app.manage(almacen);

            // La ventana no tiene bordes ni aparece en la barra de tareas:
            // la bandeja es la salida segura.
            let menu = crear_menu(app, "Mostrar u ocultar")?;
            let mut bandeja = TrayIconBuilder::with_id("kerni")
                .tooltip("Kerni")
                .menu(&menu);
            if let Some(icono) = app.default_window_icon() {
                bandeja = bandeja.icon(icono.clone());
            }
            bandeja.build(app)?;

            let ventana = app
                .get_webview_window("kerni")
                .expect("falta la ventana kerni");
            a_la_esquina(&ventana)?;
            ventana.show()?;

            // Revisa el cursor unas 15 veces por segundo y solo cambia el
            // modo de la ventana cuando el cursor entra o sale de una zona.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut ignorando: Option<bool> = None;
                loop {
                    std::thread::sleep(Duration::from_millis(66));
                    let Some(ventana) = handle.get_webview_window("kerni") else {
                        break;
                    };
                    let zonas = handle.state::<Zonas>().0.lock().unwrap().clone();
                    // Sin zonas todavía (el front no cargó): la ventana recibe clics.
                    let dentro = if zonas.is_empty() {
                        Some(true)
                    } else {
                        sobre_zona(&ventana, &zonas)
                    };
                    let Some(dentro) = dentro else { continue };
                    if ignorando != Some(!dentro) {
                        let _ = ventana.set_ignore_cursor_events(!dentro);
                        ignorando = Some(!dentro);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar Kerni");
}

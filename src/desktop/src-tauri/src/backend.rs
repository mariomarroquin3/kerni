//! El backend de Kerni (Node) viaja dentro del instalador y la app lo enciende sola.
//!
//! - `resources/node/node(.exe)` y `resources/backend/src/server.js` los pone `scripts/preparar-backend.mjs`.
//! - Si el puerto 8788 ya responde (por ejemplo `Kerni.bat` o `npm run dev` ya lo encendieron), no se arranca otro.
//! - En desarrollo no existen esos recursos y no se hace nada.
//! - Un vigilante lo vuelve a encender si se cae (hasta 5 veces) y se detiene al cerrar Kerni.
//! - La salida va a `backend.log` en la carpeta de datos de Kerni (nunca a una consola visible).

use std::fs::{self, OpenOptions};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};

pub const PUERTO: u16 = 8788;
const MAX_REINICIOS: u32 = 5;
const LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Default)]
pub struct Backend(Mutex<Option<Child>>);

#[derive(Debug, PartialEq, Eq)]
pub struct Rutas {
    pub node: PathBuf,
    pub script: PathBuf,
    pub cwd: PathBuf,
}

/// Windows entrega las rutas de recursos como `\\?\C:\...`; Node no siempre las acepta bien, así que se quita el prefijo.
pub fn sin_prefijo_unc(ruta: &Path) -> PathBuf {
    let texto = ruta.to_string_lossy();
    match texto.strip_prefix(r"\\?\") {
        Some(resto) if resto.chars().nth(1) == Some(':') => PathBuf::from(resto),
        _ => ruta.to_path_buf(),
    }
}

/// Dónde están Node y el backend dentro de la carpeta de recursos. `None` si no viajan (desarrollo).
pub fn rutas(recursos: &Path) -> Option<Rutas> {
    let recursos = sin_prefijo_unc(recursos);
    let nombre = if cfg!(windows) { "node.exe" } else { "node" };
    let node = recursos.join("node").join(nombre);
    let cwd = recursos.join("backend");
    let script = cwd.join("src").join("server.js");
    (node.is_file() && script.is_file()).then_some(Rutas { node, script, cwd })
}

/// La misma carpeta de datos que usa el backend (`server.js`): %APPDATA%\Kerni en Windows, ~/.local/share/Kerni en Linux.
pub fn carpeta_datos() -> PathBuf {
    if let Some(d) = std::env::var_os("KERNI_DATA_DIR") {
        return PathBuf::from(d);
    }
    if cfg!(windows) {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("AppData").join("Roaming")))
            .unwrap_or_else(|| PathBuf::from("."));
        return base.join("Kerni");
    }
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Kerni")
}

/// ¿Ya hay algo escuchando en el puerto del backend?
pub fn puerto_en_uso(puerto: u16) -> bool {
    let direccion = SocketAddr::from(([127, 0, 0, 1], puerto));
    TcpStream::connect_timeout(&direccion, Duration::from_millis(300)).is_ok()
}

fn abrir_log() -> Option<fs::File> {
    let dir = carpeta_datos();
    fs::create_dir_all(&dir).ok()?;
    let ruta = dir.join("backend.log");
    // Un registro que crece para siempre no le sirve a nadie: se reinicia pasados 2 MB.
    if fs::metadata(&ruta).map(|m| m.len() > LOG_MAX_BYTES).unwrap_or(false) {
        let _ = fs::remove_file(&ruta);
    }
    OpenOptions::new().create(true).append(true).open(ruta).ok()
}

fn lanzar(r: &Rutas) -> std::io::Result<Child> {
    let mut cmd = Command::new(&r.node);
    cmd.arg(&r.script).current_dir(&r.cwd).stdin(Stdio::null());
    match abrir_log().map(|f| (f.try_clone(), f)) {
        Some((Ok(copia), f)) => {
            cmd.stdout(Stdio::from(f)).stderr(Stdio::from(copia));
        }
        _ => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: sin ventana de consola
    }
    cmd.spawn()
}

/// Enciende el backend si viaja en el instalador y nadie lo encendió ya. Nunca rompe el arranque de la app.
pub fn arrancar(app: &AppHandle) {
    let Ok(recursos) = app.path().resource_dir() else { return };
    let Some(r) = rutas(&recursos) else { return };
    if puerto_en_uso(PUERTO) {
        return;
    }
    match lanzar(&r) {
        Ok(hijo) => *app.state::<Backend>().0.lock().unwrap() = Some(hijo),
        Err(e) => eprintln!("[backend] no pude encender el backend: {e}"),
    }
    let app = app.clone();
    std::thread::spawn(move || vigilar(&app, &r));
}

/// Si el proceso se cae, lo vuelve a encender unas pocas veces; si Kerni se está cerrando (`detener`), termina.
fn vigilar(app: &AppHandle, r: &Rutas) {
    let mut reinicios = 0;
    loop {
        std::thread::sleep(Duration::from_secs(5));
        let estado = app.state::<Backend>();
        let mut guardia = estado.0.lock().unwrap();
        let Some(hijo) = guardia.as_mut() else { return };
        if matches!(hijo.try_wait(), Ok(None)) {
            continue;
        }
        if reinicios >= MAX_REINICIOS {
            eprintln!("[backend] se cayó {MAX_REINICIOS} veces; no lo reinicio más (mira backend.log)");
            *guardia = None;
            return;
        }
        reinicios += 1;
        match lanzar(r) {
            Ok(nuevo) => *guardia = Some(nuevo),
            Err(e) => {
                eprintln!("[backend] no pude reiniciarlo: {e}");
                *guardia = None;
                return;
            }
        }
    }
}

/// Apaga el backend que encendió esta app (si lo encendió).
pub fn detener(app: &AppHandle) {
    if let Some(mut hijo) = app.state::<Backend>().0.lock().unwrap().take() {
        let _ = hijo.kill();
        let _ = hijo.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn carpeta_temporal(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("kerni-test-{nombre}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn quita_el_prefijo_de_rutas_largas_de_windows() {
        assert_eq!(sin_prefijo_unc(Path::new(r"\\?\C:\Kerni\resources")), PathBuf::from(r"C:\Kerni\resources"));
        // Una ruta de red (UNC) no es una letra de unidad: se deja como está.
        assert_eq!(sin_prefijo_unc(Path::new(r"\\?\UNC\servidor\carpeta")), PathBuf::from(r"\\?\UNC\servidor\carpeta"));
        assert_eq!(sin_prefijo_unc(Path::new("/opt/kerni")), PathBuf::from("/opt/kerni"));
    }

    #[test]
    fn sin_recursos_no_hay_backend_que_encender() {
        let d = carpeta_temporal("vacio");
        assert_eq!(rutas(&d), None);
        // Con solo la mitad tampoco: hace falta Node Y el script.
        let nombre = if cfg!(windows) { "node.exe" } else { "node" };
        fs::create_dir_all(d.join("node")).unwrap();
        fs::write(d.join("node").join(nombre), b"").unwrap();
        assert_eq!(rutas(&d), None);
    }

    #[test]
    fn con_node_y_script_arma_las_rutas() {
        let d = carpeta_temporal("completo");
        let nombre = if cfg!(windows) { "node.exe" } else { "node" };
        fs::create_dir_all(d.join("node")).unwrap();
        fs::create_dir_all(d.join("backend").join("src")).unwrap();
        fs::write(d.join("node").join(nombre), b"").unwrap();
        fs::write(d.join("backend").join("src").join("server.js"), b"").unwrap();
        let r = rutas(&d).expect("debería encontrar el backend");
        assert_eq!(r.cwd, d.join("backend"));
        assert!(r.script.ends_with("server.js") && r.node.ends_with(nombre));
    }

    #[test]
    fn detecta_si_el_puerto_ya_responde() {
        let escucha = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = escucha.local_addr().unwrap().port();
        assert!(puerto_en_uso(puerto));
        drop(escucha);
        assert!(!puerto_en_uso(puerto));
    }

    #[test]
    fn la_carpeta_de_datos_obedece_kerni_data_dir() {
        // Solo se lee: no se cambia el entorno para no pisar otras pruebas en paralelo.
        if let Some(d) = std::env::var_os("KERNI_DATA_DIR") {
            assert_eq!(carpeta_datos(), PathBuf::from(d));
        } else {
            assert!(carpeta_datos().ends_with("Kerni"));
        }
    }
}

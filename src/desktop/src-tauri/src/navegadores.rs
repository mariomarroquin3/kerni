//! Caché de Chrome y Edge. Solo borra las carpetas `Cache` y `Code Cache` de cada perfil, dentro de
//! `%LOCALAPPDATA%`. Nunca toca cookies, historial, contraseñas, marcadores, sesiones ni extensiones.
//! Se mide primero (solo lectura) para que la tarjeta diga cuántos MB hay. Si un archivo está en uso
//! (el navegador abierto), se salta y se cuenta. No sigue enlaces simbólicos y tiene el mismo tope de
//! entradas y de tiempo que la limpieza de temporales.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::Serialize;

use crate::sistema::{MAX_ENTRADAS, PROFUNDIDAD_MAXIMA, TIEMPO_MAXIMO};

const MB: f64 = 1024.0 * 1024.0;

/// Carpetas de datos de usuario de cada navegador, relativas a `%LOCALAPPDATA%`.
const DATOS_NAVEGADORES: &[&[&str]] = &[&["Google", "Chrome", "User Data"], &["Microsoft", "Edge", "User Data"]];
/// Lo único que se borra dentro de cada perfil: caché y caché de código compilado.
const CARPETAS_CACHE: &[&str] = &["Cache", "Code Cache"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MedidaCache {
    /// Archivos que se borrarían.
    pub archivos: u32,
    pub mb: f64,
    /// Carpetas de caché encontradas (perfil x tipo).
    pub carpetas: u32,
    /// `false` si se llegó al tope de entradas o de tiempo: la cifra puede quedarse corta.
    pub completa: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoCache {
    pub archivos: u32,
    pub liberado_mb: f64,
    /// Archivos que estaban en uso (navegador abierto) y se saltaron.
    pub saltados: u32,
    pub completa: bool,
}

#[derive(Default)]
struct Cuenta {
    archivos: u32,
    bytes: u64,
    saltados: u32,
    entradas: u32,
    completa: bool,
}

/// Las carpetas `Cache` y `Code Cache` de cada perfil de Chrome y Edge que existan bajo `base` (LOCALAPPDATA).
pub fn carpetas_cache(base: &Path) -> Vec<PathBuf> {
    let mut salida = Vec::new();
    for datos in DATOS_NAVEGADORES {
        let raiz = datos.iter().fold(base.to_path_buf(), |acc, parte| acc.join(parte));
        let Ok(perfiles) = fs::read_dir(&raiz) else { continue };
        for perfil in perfiles.flatten() {
            let ruta_perfil = perfil.path();
            let Ok(meta) = fs::symlink_metadata(&ruta_perfil) else { continue };
            if !meta.is_dir() || meta.file_type().is_symlink() {
                continue;
            }
            for carpeta in CARPETAS_CACHE {
                let ruta = ruta_perfil.join(carpeta);
                if fs::symlink_metadata(&ruta).is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink()) {
                    salida.push(ruta);
                }
            }
        }
    }
    salida
}

/// Recorre (y, si `borrar`, borra) lo que hay dentro de una carpeta de caché.
fn recorrer(dir: &Path, cuenta: &mut Cuenta, limite: Instant, borrar: bool, profundidad: u32) {
    if profundidad > PROFUNDIDAD_MAXIMA || Instant::now() > limite {
        cuenta.completa = false;
        return;
    }
    let Ok(entradas) = fs::read_dir(dir) else {
        cuenta.saltados += 1;
        return;
    };
    for entrada in entradas.flatten() {
        cuenta.entradas += 1;
        if cuenta.entradas > MAX_ENTRADAS || Instant::now() > limite {
            cuenta.completa = false;
            return;
        }
        let ruta = entrada.path();
        let Ok(meta) = fs::symlink_metadata(&ruta) else {
            cuenta.saltados += 1;
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            recorrer(&ruta, cuenta, limite, borrar, profundidad + 1);
            if borrar {
                let _ = fs::remove_dir(&ruta); // solo si quedó vacía
            }
        } else if !borrar {
            cuenta.archivos += 1;
            cuenta.bytes += meta.len();
        } else {
            match fs::remove_file(&ruta) {
                Ok(()) => {
                    cuenta.archivos += 1;
                    cuenta.bytes += meta.len();
                }
                // Un archivo en uso no se puede borrar: se deja y se cuenta.
                Err(_) => cuenta.saltados += 1,
            }
        }
    }
}

fn recorrer_todo(base: &Path, borrar: bool) -> (Cuenta, u32) {
    let carpetas = carpetas_cache(base);
    let limite = Instant::now() + TIEMPO_MAXIMO;
    let mut cuenta = Cuenta { completa: true, ..Cuenta::default() };
    for c in &carpetas {
        recorrer(c, &mut cuenta, limite, borrar, 0);
    }
    (cuenta, carpetas.len() as u32)
}

/// Mide cuánta caché hay (solo lectura).
pub fn medir_en(base: &Path) -> MedidaCache {
    let (cuenta, carpetas) = recorrer_todo(base, false);
    MedidaCache { archivos: cuenta.archivos, mb: cuenta.bytes as f64 / MB, carpetas, completa: cuenta.completa }
}

/// Borra la caché de los navegadores. Nada más.
pub fn limpiar_en(base: &Path) -> ResultadoCache {
    let (cuenta, _) = recorrer_todo(base, true);
    ResultadoCache { archivos: cuenta.archivos, liberado_mb: cuenta.bytes as f64 / MB, saltados: cuenta.saltados, completa: cuenta.completa }
}

fn local_app_data() -> PathBuf {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_default()
}

#[tauri::command]
pub async fn medir_cache_navegador() -> Result<MedidaCache, String> {
    tauri::async_runtime::spawn_blocking(|| medir_en(&local_app_data())).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn limpiar_cache_navegador() -> Result<ResultadoCache, String> {
    tauri::async_runtime::spawn_blocking(|| limpiar_en(&local_app_data())).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Carpeta temporal única para cada prueba (sin dependencias extra).
    fn raiz_de_prueba(nombre: &str) -> PathBuf {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("kerni-cache-{nombre}-{}-{n}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn escribir(ruta: &Path, bytes: usize) {
        fs::create_dir_all(ruta.parent().unwrap()).unwrap();
        fs::write(ruta, vec![0u8; bytes]).unwrap();
    }

    /// Un Chrome con dos perfiles y un Edge con uno, con caché y con datos que nunca se deben tocar.
    fn perfil_con_datos(base: &Path) {
        let chrome = base.join("Google").join("Chrome").join("User Data");
        escribir(&chrome.join("Default").join("Cache").join("Cache_Data").join("f1"), 1000);
        escribir(&chrome.join("Default").join("Code Cache").join("js").join("f2"), 500);
        escribir(&chrome.join("Default").join("Cookies"), 300);
        escribir(&chrome.join("Default").join("History"), 300);
        escribir(&chrome.join("Default").join("Login Data"), 300);
        escribir(&chrome.join("Profile 1").join("Cache").join("f3"), 200);
        let edge = base.join("Microsoft").join("Edge").join("User Data");
        escribir(&edge.join("Default").join("Cache").join("f4"), 100);
        escribir(&edge.join("Default").join("Extensions").join("ext").join("manifest.json"), 100);
        // Algo que no es un perfil de navegador no se mira.
        escribir(&chrome.join("ShaderCache").join("x"), 999);
    }

    #[test]
    fn mide_solo_la_cache_de_chrome_y_edge() {
        let base = raiz_de_prueba("medir");
        perfil_con_datos(&base);
        let m = medir_en(&base);
        assert_eq!(m.archivos, 4); // f1, f2, f3, f4
        assert_eq!(m.carpetas, 4); // Chrome Default/Cache y Code Cache, Profile 1/Cache, Edge Default/Cache
        assert!(m.completa);
        assert!((m.mb - 1800.0 / MB).abs() < 1e-9);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn limpia_la_cache_y_deja_cookies_historial_y_contrasenas() {
        let base = raiz_de_prueba("limpiar");
        perfil_con_datos(&base);
        let r = limpiar_en(&base);
        assert_eq!(r.archivos, 4);
        assert_eq!(r.saltados, 0);
        let chrome = base.join("Google").join("Chrome").join("User Data");
        assert!(chrome.join("Default").join("Cookies").exists());
        assert!(chrome.join("Default").join("History").exists());
        assert!(chrome.join("Default").join("Login Data").exists());
        assert!(base.join("Microsoft").join("Edge").join("User Data").join("Default").join("Extensions").join("ext").join("manifest.json").exists());
        assert!(!chrome.join("Default").join("Cache").join("Cache_Data").join("f1").exists());
        // Después de limpiar, la caché no tiene nada que medir.
        assert_eq!(medir_en(&base).archivos, 0);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn sin_navegadores_no_hay_nada_que_medir_ni_borrar() {
        let base = raiz_de_prueba("vacio");
        let m = medir_en(&base);
        assert_eq!((m.archivos, m.carpetas), (0, 0));
        assert_eq!(limpiar_en(&base).archivos, 0);
        let _ = fs::remove_dir_all(&base);
    }
}

//! Linux: comportamiento específico de Linux para Kerni.
//!
//! El núcleo que decide y ejecuta las acciones sobre el sistema vive en
//! `sistema.rs`; acá está lo que cambia en Linux: la carpeta temporal propia
//! de la app y su limpieza.

#[cfg(any(target_os = "linux", test))]
use std::path::{Path, PathBuf};
#[cfg(any(target_os = "linux", test))]
use std::time::{Duration, SystemTime};

#[cfg(target_os = "linux")]
use crate::sistema::ResultadoLimpieza;

/// Borra los temporales viejos (> 24 h) de la carpeta temporal propia de Kerni.
/// Nunca toca /tmp o /var/tmp completos: solo la carpeta que la app eligió.
#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn limpiar_temporales() -> Result<ResultadoLimpieza, String> {
    // Fuera del hilo principal: borrar muchos archivos no debe trancar la ventana.
    tauri::async_runtime::spawn_blocking(limpiar_temporales_ya).await.map_err(|e| e.to_string())?
}

#[cfg(target_os = "linux")]
fn limpiar_temporales_ya() -> Result<ResultadoLimpieza, String> {
    let Some(dir) = carpeta_temporales() else {
        return Err("No encuentro tu carpeta personal (HOME); no borré nada".into());
    };
    let _ = std::fs::create_dir_all(&dir);
    let limite = SystemTime::now() - Duration::from_secs(24 * 60 * 60);
    let (mut archivos, mut bytes) = (0u32, 0u64);
    limpiar_dir(&dir, limite, &mut archivos, &mut bytes);
    Ok(ResultadoLimpieza { archivos, liberado_mb: bytes as f64 / (1024.0 * 1024.0) })
}

/// Carpeta temporal propia de Kerni en Linux: `$XDG_CACHE_HOME/kerni/tmp`,
/// o `$HOME/.cache/kerni/tmp` si `XDG_CACHE_HOME` no está definida.
#[cfg(target_os = "linux")]
pub fn carpeta_temporales() -> Option<PathBuf> {
    ruta_temporales(std::env::var("XDG_CACHE_HOME").ok().as_deref(), std::env::var("HOME").ok().as_deref())
}

/// Ruta de la carpeta temporal a partir de las variables (separada para probarla en cualquier sistema).
/// Como manda la especificación XDG, una ruta relativa se ignora; sin HOME válido no hay carpeta:
/// nunca se usa una ruta relativa, porque limpiaría algo dentro de la carpeta actual.
#[cfg(any(target_os = "linux", test))]
pub fn ruta_temporales(xdg_cache_home: Option<&str>, home: Option<&str>) -> Option<PathBuf> {
    fn absoluta(s: &str) -> Option<&str> {
        let t = s.trim();
        t.starts_with('/').then_some(t)
    }
    let cache = match xdg_cache_home.and_then(absoluta) {
        Some(x) => PathBuf::from(x),
        None => PathBuf::from(home.and_then(absoluta)?).join(".cache"),
    };
    Some(cache.join("kerni").join("tmp"))
}

/// Borra archivos viejos y las carpetas que queden vacías. Una carpeta se borra solo si su propia fecha
/// de modificación (la de antes de vaciarla) es más vieja que el límite: una carpeta vacía de hoy se queda.
#[cfg(any(target_os = "linux", test))]
fn limpiar_dir(dir: &Path, limite: SystemTime, archivos: &mut u32, bytes: &mut u64) {
    let Ok(entradas) = std::fs::read_dir(dir) else { return };
    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let Ok(meta) = std::fs::symlink_metadata(&ruta) else { continue };
        if meta.file_type().is_symlink() { continue; }
        if meta.is_dir() {
            // Vaciar la carpeta cambia su fecha: se mira antes de recorrerla.
            let vieja = meta.modified().map_or(false, |m| m < limite);
            limpiar_dir(&ruta, limite, archivos, bytes);
            if vieja {
                let _ = std::fs::remove_dir(&ruta);
            }
        } else if meta.modified().map_or(false, |m| m < limite) && std::fs::remove_file(&ruta).is_ok() {
            *archivos += 1;
            *bytes += meta.len();
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn carpeta_de_prueba(nombre: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kerni-linux-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("crear carpeta de prueba");
        dir
    }

    #[test]
    fn la_carpeta_sigue_xdg_y_si_falta_usa_cache_dentro_de_home() {
        let esperada = PathBuf::from("/x/cache").join("kerni").join("tmp");
        assert_eq!(ruta_temporales(Some("/x/cache"), Some("/home/u")), Some(esperada));
        let desde_home = PathBuf::from("/home/u").join(".cache").join("kerni").join("tmp");
        assert_eq!(ruta_temporales(None, Some("/home/u")), Some(desde_home.clone()));
        assert_eq!(ruta_temporales(Some("   "), Some("/home/u")), Some(desde_home));
    }

    #[test]
    fn sin_home_ni_xdg_utilizables_no_inventa_una_ruta_relativa() {
        assert_eq!(ruta_temporales(None, None), None);
        assert_eq!(ruta_temporales(None, Some("relativa/casa")), None);
        assert_eq!(ruta_temporales(Some("relativa"), None), None);
    }

    #[test]
    fn una_carpeta_vacia_reciente_no_se_borra() {
        let dir = carpeta_de_prueba("reciente");
        std::fs::create_dir_all(dir.join("vacia")).unwrap();
        let limite = SystemTime::now() - Duration::from_secs(24 * 60 * 60);
        let (mut archivos, mut bytes) = (0u32, 0u64);
        limpiar_dir(&dir, limite, &mut archivos, &mut bytes);
        assert!(dir.join("vacia").is_dir(), "una carpeta vacía de hoy no debía borrarse");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn una_carpeta_vieja_que_queda_vacia_si_se_borra() {
        let dir = carpeta_de_prueba("vieja");
        std::fs::create_dir_all(dir.join("vacia")).unwrap();
        std::fs::write(dir.join("vacia").join("tmp.bin"), b"datos").unwrap();
        // Límite en el futuro: todo cuenta como viejo.
        let limite = SystemTime::now() + Duration::from_secs(60 * 60);
        let (mut archivos, mut bytes) = (0u32, 0u64);
        limpiar_dir(&dir, limite, &mut archivos, &mut bytes);
        assert_eq!(archivos, 1);
        assert!(!dir.join("vacia").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

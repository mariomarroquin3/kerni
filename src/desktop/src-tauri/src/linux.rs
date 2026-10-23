//! Linux: comportamiento específico de Linux para Kerni.
//!
//! El núcleo que decide y ejecuta las acciones sobre el sistema vive en
//! `sistema.rs`; acá está lo que cambia en Linux: la carpeta temporal propia
//! de la app y su limpieza.

#[cfg(target_os = "linux")]
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::time::{Duration, SystemTime};

use crate::sistema::ResultadoLimpieza;

/// Borra los temporales viejos (> 24 h) de la carpeta temporal propia de Kerni.
/// Nunca toca /tmp o /var/tmp completos: solo la carpeta que la app eligió.
#[cfg(target_os = "linux")]
#[tauri::command]
pub fn limpiar_temporales() -> Result<ResultadoLimpieza, String> {
    let dir = carpeta_temporales();
    let _ = std::fs::create_dir_all(&dir);
    let limite = SystemTime::now() - Duration::from_secs(24 * 60 * 60);
    let (mut archivos, mut bytes) = (0u32, 0u64);
    limpiar_dir(&dir, limite, &mut archivos, &mut bytes);
    Ok(ResultadoLimpieza { archivos, liberado_mb: bytes as f64 / (1024.0 * 1024.0) })
}

/// Carpeta temporal propia de Kerni en Linux: `$XDG_CACHE_HOME/kerni/tmp`,
/// o `$HOME/.cache/kerni/tmp` si `XDG_CACHE_HOME` no está definida.
#[cfg(target_os = "linux")]
pub fn carpeta_temporales() -> PathBuf {
    let base = std::env::var("XDG_CACHE_HOME")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| ".cache".to_string()));
    PathBuf::from(base).join("kerni").join("tmp")
}

#[cfg(target_os = "linux")]
fn limpiar_dir(dir: &std::path::Path, limite: SystemTime, archivos: &mut u32, bytes: &mut u64) {
    let Ok(entradas) = std::fs::read_dir(dir) else { return };
    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let Ok(meta) = std::fs::symlink_metadata(&ruta) else { continue };
        if meta.file_type().is_symlink() { continue; }
        if meta.is_dir() {
            limpiar_dir(&ruta, limite, archivos, bytes);
            let _ = std::fs::remove_dir(&ruta);
        } else if meta.modified().map_or(false, |m| m < limite) && std::fs::remove_file(&ruta).is_ok() {
            *archivos += 1;
            *bytes += meta.len();
        }
    }
}

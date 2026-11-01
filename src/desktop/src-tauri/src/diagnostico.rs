//! Diagnóstico de solo lectura: por qué tarda en arrancar, salud del disco, puntos de restauración, posibles duplicados,
//! programas instalados y consumo con batería.
//!
//! Ninguna función de este archivo cambia nada en la PC. Lo que pide a Windows son guiones fijos de PowerShell (`ps`),
//! nunca texto de la persona ni del modelo. Lo que devuelve Windows sobre nombres o rutas se limpia con `limpiar_texto`
//! y la interfaz lo pinta con `textContent`. Muchas lecturas piden administrador: cuando falta un dato, se dice por qué
//! y no se inventa nada.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::herramientas::{self, ps, texto};

// ---------- C1: por qué tarda en arrancar ----------

/// El último evento 100 del registro de rendimiento de arranque: trae el tiempo de arranque en milisegundos.
const GUION_ARRANQUE: &str = r#"$e=Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Diagnostics-Performance/Operational';Id=100} -MaxEvents 1 -ErrorAction Stop;$x=[xml]$e.ToXml();$b=($x.Event.EventData.Data|Where-Object{$_.Name -eq 'BootTime'}|Select-Object -First 1).'#text';[pscustomobject]@{ms=[int64]$b;fecha=$e.TimeCreated.ToString('yyyy-MM-ddTHH:mm:ss')}|ConvertTo-Json -Compress"#;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Arranque {
    /// Segundos que tardó el último arranque, si Windows lo registró.
    pub duracion_s: Option<f64>,
    /// Cuándo se registró ese arranque (hora local, sin zona).
    pub fecha: Option<String>,
    pub programas_activos: Option<u32>,
    pub programas_total: Option<u32>,
    /// Lo que se le dice a la persona: de dónde salió el dato, o por qué falta.
    pub nota: String,
}

/// Interpreta la salida del guion y el conteo de programas de inicio. Sin evento válido, no hay duración.
pub fn parsear_arranque(salida: &str, programas: Option<(u32, u32)>) -> Arranque {
    let valor: Option<Value> = serde_json::from_str(salida.trim().trim_start_matches('\u{feff}')).ok();
    let ms = valor.as_ref().and_then(|v| v.get("ms")).and_then(Value::as_f64).filter(|m| *m > 0.0);
    let fecha = valor.as_ref().map(|v| texto(v, "fecha", 30)).filter(|f| !f.is_empty());
    let nota = if ms.is_some() {
        "Lo tomé del último registro de arranque de Windows.".to_string()
    } else {
        "No encuentro el registro de tiempos de arranque de Windows. Puede que haga falta administrador para leerlo, o que Windows lo haya borrado.".to_string()
    };
    let (programas_activos, programas_total) = match programas {
        Some((activos, total)) => (Some(activos), Some(total)),
        None => (None, None),
    };
    Arranque { duracion_s: ms.map(|m| m / 1000.0), fecha, programas_activos, programas_total, nota }
}

/// ¿Por qué tarda en prender? Duración del último arranque (si Windows la registró) y cuántos programas se abren solos.
#[tauri::command]
pub async fn ver_arranque() -> Result<Arranque, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let evento = ps(GUION_ARRANQUE, Duration::from_secs(10)).unwrap_or_default();
        let programas = herramientas::leer_inicio().ok().map(|lista| {
            (lista.iter().filter(|p| p.activo).count() as u32, lista.len() as u32)
        });
        parsear_arranque(&evento, programas)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_la_duracion_del_arranque_y_los_programas() {
        let a = parsear_arranque(r#"{"ms":48250,"fecha":"2026-10-31T08:02:11"}"#, Some((7, 12)));
        assert_eq!(a.duracion_s, Some(48.25));
        assert_eq!(a.fecha.as_deref(), Some("2026-10-31T08:02:11"));
        assert_eq!((a.programas_activos, a.programas_total), (Some(7), Some(12)));
        assert!(a.nota.contains("último registro"));
    }

    #[test]
    fn sin_el_evento_lo_dice_y_no_inventa_una_duracion() {
        let a = parsear_arranque("", None);
        assert_eq!(a.duracion_s, None);
        assert_eq!(a.fecha, None);
        assert_eq!((a.programas_activos, a.programas_total), (None, None));
        assert!(a.nota.contains("No encuentro"));
        // un tiempo en cero o basura tampoco cuenta como arranque
        assert_eq!(parsear_arranque(r#"{"ms":0}"#, None).duracion_s, None);
        assert_eq!(parsear_arranque("no es json", None).duracion_s, None);
    }

    #[test]
    fn la_salida_con_marca_de_bytes_se_lee_igual() {
        let a = parsear_arranque("\u{feff}{\"ms\":12000}", Some((0, 0)));
        assert_eq!(a.duracion_s, Some(12.0));
        assert_eq!(a.programas_total, Some(0));
    }
}

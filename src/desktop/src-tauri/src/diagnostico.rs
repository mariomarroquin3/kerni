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

use crate::herramientas::{self, lista_json, numero, ps, texto};

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

// ---------- C2: salud del disco ----------

/// Salud de cada disco físico (Get-PhysicalDisk) y, si Windows la da, la de fiabilidad (Get-StorageReliabilityCounter).
/// Los contadores de fiabilidad suelen pedir administrador: si no vienen, la fila lo dice y no se inventa nada.
const GUION_DISCOS: &str = r#"$d=@(Get-PhysicalDisk -ErrorAction SilentlyContinue|ForEach-Object{$r=$null;try{$r=$_|Get-StorageReliabilityCounter -ErrorAction Stop}catch{};[pscustomobject]@{nombre=[string]$_.FriendlyName;tipo=[string]$_.MediaType;salud=[string]$_.HealthStatus;estado=[string]$_.OperationalStatus;gb=[math]::Round($_.Size/1GB);temperatura=$r.Temperature;desgaste=$r.Wear;erroresLectura=$r.ReadErrorsTotal}});if($d){@($d)|ConvertTo-Json -Compress}else{'[]'}"#;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoFisico {
    pub nombre: String,
    /// SSD, HDD o "Desconocido".
    pub tipo: String,
    pub gb: u64,
    /// "sin_alertas": Windows no reporta problemas (eso NO es garantía). "alerta": respaldar ya. "sin_datos": no hay salud.
    pub nivel: String,
    /// Motivos en español, cortos. Vacío si no hay alerta.
    pub motivos: Vec<String>,
    pub temperatura_c: Option<u32>,
    pub desgaste_pct: Option<u32>,
    pub errores_lectura: Option<u64>,
    /// Faltan contadores de fiabilidad (suele pedir administrador).
    pub datos_parciales: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaludDiscos {
    pub discos: Vec<DiscoFisico>,
    pub nota: String,
}

/// Reglas: Windows marca advertencia o "no saludable", el estado no es OK (por ejemplo, un fallo predicho),
/// desgaste de 90 % o más, temperatura de 70 °C o más, o hay errores de lectura registrados.
fn clasificar(salud: &str, estado: &str, desgaste: Option<u32>, temperatura: Option<u32>, errores: Option<u64>) -> (String, Vec<String>) {
    let mut motivos = Vec::new();
    if salud.eq_ignore_ascii_case("Warning") {
        motivos.push("Windows marca advertencia en la salud del disco".to_string());
    }
    if salud.eq_ignore_ascii_case("Unhealthy") {
        motivos.push("Windows marca el disco como no saludable".to_string());
    }
    let estado_normal = estado.is_empty() || estado.eq_ignore_ascii_case("OK") || estado.eq_ignore_ascii_case("Unknown");
    if !estado_normal {
        motivos.push(format!("estado de funcionamiento: {estado}"));
    }
    if let Some(d) = desgaste.filter(|d| *d >= 90) {
        motivos.push(format!("desgaste de {d} %"));
    }
    if let Some(t) = temperatura.filter(|t| *t >= 70) {
        motivos.push(format!("temperatura alta ({t} °C)"));
    }
    if errores.is_some_and(|e| e > 0) {
        motivos.push("tiene errores de lectura registrados".to_string());
    }
    let sin_salud = salud.is_empty() || salud.eq_ignore_ascii_case("Unknown");
    let nivel = if !motivos.is_empty() {
        "alerta"
    } else if sin_salud {
        "sin_datos"
    } else {
        "sin_alertas"
    };
    (nivel.to_string(), motivos)
}

/// Interpreta la salida del guion. Un valor en cero de temperatura significa "no lo sé", no "cero grados".
pub fn parsear_discos(salida: &str) -> Vec<DiscoFisico> {
    lista_json(salida)
        .iter()
        .map(|v| {
            let nombre = texto(v, "nombre", 80);
            let tipo = match texto(v, "tipo", 20).as_str() {
                "SSD" => "SSD".to_string(),
                "HDD" => "HDD".to_string(),
                _ => "Desconocido".to_string(),
            };
            let salud = texto(v, "salud", 30);
            let estado = texto(v, "estado", 40);
            let temperatura = v.get("temperatura").and_then(Value::as_f64).filter(|t| *t > 0.0).map(|t| t.round() as u32);
            let desgaste = v.get("desgaste").and_then(Value::as_f64).filter(|d| *d >= 0.0).map(|d| d.round() as u32);
            let errores = v.get("erroresLectura").and_then(Value::as_f64).filter(|e| *e >= 0.0).map(|e| e.round() as u64);
            let (nivel, motivos) = clasificar(&salud, &estado, desgaste, temperatura, errores);
            DiscoFisico {
                nombre: if nombre.is_empty() { "Disco sin nombre".to_string() } else { nombre },
                tipo,
                gb: numero(v, "gb").max(0.0) as u64,
                nivel,
                motivos,
                temperatura_c: temperatura,
                desgaste_pct: desgaste,
                errores_lectura: errores,
                datos_parciales: temperatura.is_none() && desgaste.is_none() && errores.is_none(),
            }
        })
        .collect()
}

fn nota_discos(discos: &[DiscoFisico]) -> String {
    if discos.is_empty() {
        return "Windows no me mostró ningún disco.".to_string();
    }
    if discos.iter().any(|d| d.datos_parciales) {
        return "Algunos datos de fiabilidad no vinieron: suele pasar sin permisos de administrador. Muestro lo que sí hay.".to_string();
    }
    String::new()
}

/// Salud de los discos de la PC. Solo lectura: no prueba, no repara y no borra nada.
#[tauri::command]
pub async fn ver_salud_disco() -> Result<SaludDiscos, String> {
    tauri::async_runtime::spawn_blocking(|| match ps(GUION_DISCOS, Duration::from_secs(15)) {
        Ok(salida) => {
            let discos = parsear_discos(&salida);
            let nota = nota_discos(&discos);
            SaludDiscos { discos, nota }
        }
        Err(e) => SaludDiscos { discos: Vec::new(), nota: format!("No pude leer los discos de esta PC: {e}") },
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

    #[test]
    fn disco_sin_problemas_se_marca_sin_alertas_con_datos_completos() {
        let d = parsear_discos(r#"[{"nombre":"Samsung SSD 870","tipo":"SSD","salud":"Healthy","estado":"OK","gb":476,"temperatura":34,"desgaste":3,"erroresLectura":0}]"#);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].tipo, "SSD");
        assert_eq!(d[0].nivel, "sin_alertas");
        assert!(d[0].motivos.is_empty());
        assert!(!d[0].datos_parciales);
        assert_eq!((d[0].temperatura_c, d[0].desgaste_pct, d[0].errores_lectura), (Some(34), Some(3), Some(0)));
    }

    #[test]
    fn advertencia_desgaste_errores_o_calor_son_alerta() {
        let advertencia = parsear_discos(r#"[{"nombre":"HDD","tipo":"HDD","salud":"Warning","estado":"OK","gb":1000}]"#);
        assert_eq!(advertencia[0].nivel, "alerta");
        let desgastado = parsear_discos(r#"[{"nombre":"SSD","tipo":"SSD","salud":"Healthy","estado":"OK","gb":256,"desgaste":95}]"#);
        assert_eq!(desgastado[0].nivel, "alerta");
        assert!(desgastado[0].motivos[0].contains("95"));
        let errores = parsear_discos(r#"[{"nombre":"SSD","tipo":"SSD","salud":"Healthy","estado":"OK","gb":256,"erroresLectura":3}]"#);
        assert_eq!(errores[0].nivel, "alerta");
        let caliente = parsear_discos(r#"[{"nombre":"HDD","tipo":"HDD","salud":"Healthy","estado":"OK","gb":500,"temperatura":72}]"#);
        assert_eq!(caliente[0].nivel, "alerta");
        let fallo = parsear_discos(r#"[{"nombre":"SSD","tipo":"SSD","salud":"Healthy","estado":"Predictive Failure","gb":256}]"#);
        assert_eq!(fallo[0].nivel, "alerta");
    }

    #[test]
    fn sin_contadores_se_dice_que_faltan_y_no_se_inventan() {
        let d = parsear_discos(r#"[{"nombre":"SSD","tipo":"SSD","salud":"Healthy","estado":"OK","gb":512,"temperatura":null,"desgaste":null,"erroresLectura":null}]"#);
        assert!(d[0].datos_parciales);
        assert_eq!((d[0].temperatura_c, d[0].desgaste_pct, d[0].errores_lectura), (None, None, None));
        // Sin contadores pero con salud buena, sigue sin alertas: no es lo mismo que "sano" y la nota lo aclara.
        assert_eq!(d[0].nivel, "sin_alertas");
        assert!(nota_discos(&d).contains("administrador"));
        // Temperatura en cero significa "no lo sé", no cero grados.
        let cero = parsear_discos(r#"[{"nombre":"SSD","tipo":"SSD","salud":"Healthy","estado":"OK","temperatura":0}]"#);
        assert_eq!(cero[0].temperatura_c, None);
    }

    #[test]
    fn salud_desconocida_no_se_dice_sin_alertas() {
        let d = parsear_discos(r#"[{"nombre":"Disco raro","tipo":"SCM","salud":"Unknown","estado":"","gb":64}]"#);
        assert_eq!(d[0].tipo, "Desconocido");
        assert_eq!(d[0].nivel, "sin_datos");
    }

    #[test]
    fn sin_discos_o_sin_salida_lo_dice() {
        assert!(parsear_discos("").is_empty());
        assert!(parsear_discos("[]").is_empty());
        assert!(nota_discos(&[]).contains("ningún disco"));
    }

    #[test]
    fn el_nombre_del_disco_se_limpia_antes_de_mostrarlo() {
        let d = parsear_discos("[{\"nombre\":\"SSD\\u0007 <b>x</b>\",\"tipo\":\"SSD\",\"salud\":\"Healthy\",\"estado\":\"OK\"}]");
        assert!(!d[0].nombre.contains('\u{7}'));
        assert!(d[0].nombre.starts_with("SSD"));
    }
}

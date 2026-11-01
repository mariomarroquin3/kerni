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

use std::path::Path;

use crate::herramientas::{self, lista_json, numero, ps, texto};
use crate::sistema;

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

// ---------- C5: programas instalados y cuándo se instalaron ----------

/// Programas de Windows (Uninstall del equipo, del equipo de 32 bits y del usuario). Solo la fecha de instalación:
/// cuándo se usó por última vez cada uno no se lee sin permisos de administrador, así que no se inventa.
const GUION_PROGRAMAS: &str = r#"$r=@(Get-ItemProperty -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue|Where-Object{$_.DisplayName -and $_.SystemComponent -ne 1 -and -not $_.ParentKeyName}|ForEach-Object{[pscustomobject]@{nombre=[string]$_.DisplayName;version=[string]$_.DisplayVersion;editor=[string]$_.Publisher;instalado=[string]$_.InstallDate}});if($r){@($r)|ConvertTo-Json -Compress}else{'[]'}"#;

const NOTA_USO_NO_DISPONIBLE: &str = "Windows no me dice cuándo usaste cada programa sin permisos de administrador, así que solo muestro cuándo se instaló.";
const MAX_PROGRAMAS_LISTADOS: usize = 60;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramaInstalado {
    pub nombre: String,
    pub version: String,
    pub editor: String,
    /// Fecha de instalación en formato AAAA-MM-DD, si Windows la tiene.
    pub instalado: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramasInstalados {
    /// Del que se instaló hace más tiempo al más nuevo; los que no tienen fecha van al final.
    pub programas: Vec<ProgramaInstalado>,
    /// Cuántos programas hay en total (la lista muestra solo los primeros).
    pub total: u32,
    /// Siempre `false` por ahora: el último uso no se puede leer sin administrador.
    pub uso_disponible: bool,
    pub nota: String,
}

/// "20240315" -> "2024-03-15". Cualquier otra cosa no es una fecha y se descarta.
fn fecha_de_instalacion(bruto: &str) -> Option<String> {
    let s = bruto.trim();
    if s.len() != 8 || !s.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let (anio, resto) = s.split_at(4);
    let (mes, dia) = resto.split_at(2);
    let m: u32 = mes.parse().ok()?;
    let d: u32 = dia.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(format!("{anio}-{mes}-{dia}"))
}

/// Interpreta la salida del guion: quita los nombres repetidos (sin mayúsculas) y ordena por fecha de instalación.
pub fn parsear_programas(salida: &str) -> Vec<ProgramaInstalado> {
    let mut vistos = std::collections::HashSet::new();
    let mut lista: Vec<ProgramaInstalado> = lista_json(salida)
        .iter()
        .filter_map(|v| {
            let nombre = texto(v, "nombre", 120);
            if nombre.is_empty() || !vistos.insert(nombre.to_lowercase()) {
                return None;
            }
            Some(ProgramaInstalado {
                nombre,
                version: texto(v, "version", 40),
                editor: texto(v, "editor", 80),
                instalado: fecha_de_instalacion(&texto(v, "instalado", 12)),
            })
        })
        .collect();
    lista.sort_by(|a, b| {
        use std::cmp::Ordering::{Equal, Greater, Less};
        let por_nombre = a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase());
        match (&a.instalado, &b.instalado) {
            (Some(x), Some(y)) => x.cmp(y).then(por_nombre),
            (Some(_), None) => Less,
            (None, Some(_)) => Greater,
            (None, None) => Equal.then(por_nombre),
        }
    });
    lista
}

/// Arma la respuesta con el total real y solo los primeros para mostrar.
fn resumen_programas(todos: Vec<ProgramaInstalado>) -> ProgramasInstalados {
    let total = todos.len() as u32;
    let programas = todos.into_iter().take(MAX_PROGRAMAS_LISTADOS).collect();
    ProgramasInstalados { programas, total, uso_disponible: false, nota: NOTA_USO_NO_DISPONIBLE.to_string() }
}

/// Programas instalados y la fecha en que se instalaron. Solo lectura: no desinstala nada.
#[tauri::command]
pub async fn ver_programas_sin_uso() -> Result<ProgramasInstalados, String> {
    tauri::async_runtime::spawn_blocking(|| match ps(GUION_PROGRAMAS, Duration::from_secs(20)) {
        Ok(salida) => resumen_programas(parsear_programas(&salida)),
        Err(_) => ProgramasInstalados {
            programas: Vec::new(),
            total: 0,
            uso_disponible: false,
            nota: "No pude leer la lista de programas instalados de esta PC.".to_string(),
        },
    })
    .await
    .map_err(|e| e.to_string())
}

// ---------- C4: posibles duplicados (solo nombre y tamaño) ----------

/// Solo se comparan nombre (sin mayúsculas) y tamaño exacto. Nunca se abre, lee ni compara el contenido de un archivo.
const MB_BYTES: f64 = 1024.0 * 1024.0;
/// Archivos más chicos que esto se ignoran: son mucho ruido (iconos, configuraciones) y casi nunca importan.
const MINIMO_BYTES_DUPLICADO: u64 = 1024 * 1024;
const MAX_GRUPOS_DUPLICADOS: usize = 25;

/// Un archivo listado: nombre, tamaño y dónde está. Solo metadatos.
#[derive(Clone, Debug, PartialEq)]
pub struct ArchivoListado {
    pub nombre: String,
    pub bytes: u64,
    /// Ruta completa: sirve para el botón "Ver" (mostrar_en_carpeta la vuelve a revisar contra las carpetas personales).
    pub ruta: String,
    /// Carpeta con `~` en lugar de la carpeta personal.
    pub carpeta: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CopiaDuplicada {
    pub ruta: String,
    pub carpeta: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GrupoDuplicados {
    pub nombre: String,
    pub tamano_mb: f64,
    pub cantidad: u32,
    /// Lo que ocupan todas las copias juntas.
    pub total_mb: f64,
    pub copias: Vec<CopiaDuplicada>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicadosPosibles {
    /// Del grupo que más ocupa al que menos.
    pub grupos: Vec<GrupoDuplicados>,
    /// `false` si se acabó el tiempo o el tope de entradas antes de revisar todo: puede haber más.
    pub completa: bool,
    pub nota: String,
}

/// Agrupa por nombre (sin mayúsculas) y tamaño exacto. Función pura: no toca el disco.
pub fn agrupar_duplicados(archivos: &[ArchivoListado], minimo_bytes: u64) -> Vec<GrupoDuplicados> {
    let mut mapa: std::collections::HashMap<(String, u64), Vec<&ArchivoListado>> = std::collections::HashMap::new();
    for a in archivos.iter().filter(|a| a.bytes >= minimo_bytes && !a.nombre.is_empty()) {
        mapa.entry((a.nombre.to_lowercase(), a.bytes)).or_default().push(a);
    }
    let mut grupos: Vec<GrupoDuplicados> = mapa
        .into_iter()
        .filter(|(_, v)| v.len() >= 2)
        .map(|((_, bytes), v)| {
            let cantidad = v.len() as u32;
            let tamano_mb = bytes as f64 / MB_BYTES;
            GrupoDuplicados {
                nombre: v[0].nombre.clone(),
                tamano_mb,
                cantidad,
                total_mb: tamano_mb * f64::from(cantidad),
                copias: v.iter().map(|a| CopiaDuplicada { ruta: a.ruta.clone(), carpeta: a.carpeta.clone() }).collect(),
            }
        })
        .collect();
    grupos.sort_by(|a, b| {
        b.total_mb
            .partial_cmp(&a.total_mb)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.nombre.cmp(&b.nombre))
    });
    grupos.truncate(MAX_GRUPOS_DUPLICADOS);
    grupos
}

/// Recorre una carpeta con las mismas reglas que archivos pesados: sin enlaces simbólicos, sin carpetas de dependencias
/// (node_modules, .git, target...), con tope de profundidad, de entradas y de tiempo. Devuelve `false` si algo no se pudo revisar.
fn listar_archivos(dir: &Path, casa: Option<&Path>, profundidad: u32, pres: &mut sistema::Presupuesto, salida: &mut Vec<ArchivoListado>) -> bool {
    if profundidad > sistema::PROFUNDIDAD_MAXIMA || pres.agotado() {
        return false;
    }
    let Ok(entradas) = std::fs::read_dir(dir) else {
        return false;
    };
    let mut completa = true;
    let proyecto_rust = dir.join("Cargo.toml").is_file();
    for entrada in entradas.flatten() {
        pres.entradas += 1;
        if pres.agotado() {
            return false;
        }
        let Ok(meta) = entrada.metadata() else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        let nombre = entrada.file_name().to_string_lossy().into_owned();
        let ruta = entrada.path();
        if meta.is_dir() {
            if sistema::es_carpeta_ajena(&nombre, proyecto_rust) {
                continue;
            }
            completa &= listar_archivos(&ruta, casa, profundidad + 1, pres, salida);
        } else if meta.is_file() {
            let carpeta = ruta.parent().map(|p| sistema::mostrar_ruta(p, casa)).unwrap_or_default();
            salida.push(ArchivoListado { nombre, bytes: meta.len(), ruta: ruta.display().to_string(), carpeta });
        }
    }
    completa
}

/// Una raíz por hilo, como en archivos pesados. Devuelve todo lo listado y si se revisó completo.
fn listar_en_raices(raices: &[std::path::PathBuf], casa: Option<&Path>) -> (Vec<ArchivoListado>, bool) {
    std::thread::scope(|s| {
        let hilos: Vec<_> = raices
            .iter()
            .map(|raiz| {
                s.spawn(move || {
                    let mut pres = sistema::Presupuesto::nuevo(sistema::MAX_ENTRADAS, sistema::TIEMPO_MAXIMO);
                    let mut salida = Vec::new();
                    let completa = listar_archivos(raiz, casa, 0, &mut pres, &mut salida);
                    (salida, completa)
                })
            })
            .collect();
        let mut todos = Vec::new();
        let mut completa = true;
        for hilo in hilos {
            let (salida, ok) = hilo.join().unwrap_or((Vec::new(), false));
            todos.extend(salida);
            completa &= ok;
        }
        (todos, completa)
    })
}

fn nota_duplicados(grupos: usize, completa: bool) -> String {
    let mut nota = String::new();
    if grupos == 0 {
        nota.push_str("No encontré archivos con el mismo nombre y tamaño (de más de 1 MB) en tus carpetas personales. ");
    }
    if !completa {
        nota.push_str("No alcancé a revisar todo: puede haber más. ");
    }
    nota.push_str("Mismo nombre y mismo tamaño no siempre es el mismo archivo: revisá antes de borrar.");
    nota
}

/// Posibles duplicados en las carpetas personales (las mismas que archivos pesados). Solo lectura: no borra ni mueve nada.
#[tauri::command]
pub async fn ver_duplicados_posibles() -> Result<DuplicadosPosibles, String> {
    let raices = sistema::raices_del_usuario();
    if raices.is_empty() {
        return Err("No encontré tus carpetas personales para revisar".to_string());
    }
    let casa = sistema::carpeta_personal()
        .and_then(|c| std::fs::canonicalize(c).ok())
        .map(|c| sistema::sin_prefijo_verbatim(&c));
    tauri::async_runtime::spawn_blocking(move || {
        let (archivos, completa) = listar_en_raices(&raices, casa.as_deref());
        let grupos = agrupar_duplicados(&archivos, MINIMO_BYTES_DUPLICADO);
        let nota = nota_duplicados(grupos.len(), completa);
        DuplicadosPosibles { grupos, completa, nota }
    })
    .await
    .map_err(|e| e.to_string())
}

// ---------- C3: puntos de restauración ----------

/// Lista los puntos de restauración que existen (solo lectura). No crea ni borra ninguno.
/// La fecha sale en formato WMI y se convierte con ManagementDateTimeConverter (Windows PowerShell 5.1, el que usa `ps`).
const GUION_PUNTOS: &str = r#"$p=@(Get-ComputerRestorePoint -ErrorAction Stop|ForEach-Object{$f='';try{$f=[System.Management.ManagementDateTimeConverter]::ToDateTime($_.CreationTime).ToString('yyyy-MM-ddTHH:mm:ss')}catch{};[pscustomobject]@{numero=[int]$_.SequenceNumber;descripcion=[string]$_.Description;fecha=$f;tipo=[int]$_.RestorePointType}});if($p){@($p)|ConvertTo-Json -Compress}else{'[]'}"#;

const NOTA_SIN_LECTURA: &str = "No pude leer los puntos de restauración. Puede que la restauración del sistema esté desactivada o que haga falta administrador.";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PuntoRestauracion {
    pub numero: u32,
    pub descripcion: String,
    /// Cuándo se creó (hora local, sin zona).
    pub fecha: Option<String>,
    /// Por qué se creó, en español (instalación de programa, controlador, cambio de configuración...).
    pub tipo: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PuntosRestauracion {
    /// Del más nuevo al más viejo.
    pub puntos: Vec<PuntoRestauracion>,
    pub nota: String,
}

/// Los códigos de RestorePointType de Windows, en palabras.
fn tipo_de_punto(codigo: i64) -> &'static str {
    match codigo {
        0 => "instalación de un programa",
        10 => "instalación de un controlador",
        12 => "cambio de configuración",
        13 => "operación cancelada",
        _ => "otro motivo",
    }
}

/// Interpreta la salida del guion. Las descripciones y fechas son datos del sistema: se limpian.
pub fn parsear_puntos(salida: &str) -> Vec<PuntoRestauracion> {
    lista_json(salida)
        .iter()
        .map(|v| {
            let descripcion = texto(v, "descripcion", 120);
            let fecha = texto(v, "fecha", 30);
            PuntoRestauracion {
                numero: numero(v, "numero").max(0.0) as u32,
                descripcion: if descripcion.is_empty() { "Sin descripción".to_string() } else { descripcion },
                fecha: (!fecha.is_empty()).then_some(fecha),
                tipo: tipo_de_punto(numero(v, "tipo") as i64).to_string(),
            }
        })
        .collect()
}

fn nota_puntos(cantidad: usize) -> String {
    if cantidad == 0 {
        "No hay puntos de restauración. Windows no los crea si la protección del sistema está desactivada.".to_string()
    } else {
        "Solo los listo: Kerni no crea ni borra puntos de restauración.".to_string()
    }
}

/// Puntos de restauración que existen en la PC. Solo lectura.
#[tauri::command]
pub async fn ver_puntos_restauracion() -> Result<PuntosRestauracion, String> {
    tauri::async_runtime::spawn_blocking(|| match ps(GUION_PUNTOS, Duration::from_secs(15)) {
        Ok(salida) => {
            let mut puntos = parsear_puntos(&salida);
            puntos.sort_by(|a, b| b.fecha.cmp(&a.fecha));
            let nota = nota_puntos(puntos.len());
            PuntosRestauracion { puntos, nota }
        }
        Err(_) => PuntosRestauracion { puntos: Vec::new(), nota: NOTA_SIN_LECTURA.to_string() },
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
    #[test]
    fn lee_los_puntos_y_los_traduce_el_motivo() {
        let p = parsear_puntos(r#"[{"numero":4,"descripcion":"Instalación de Office","fecha":"2026-10-20T09:15:00","tipo":0},{"numero":5,"descripcion":"Controlador GPU","fecha":"2026-10-28T18:01:00","tipo":10}]"#);
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].descripcion, "Instalación de Office");
        assert_eq!(p[0].tipo, "instalación de un programa");
        assert_eq!(p[1].tipo, "instalación de un controlador");
        assert_eq!(p[1].fecha.as_deref(), Some("2026-10-28T18:01:00"));
    }

    #[test]
    fn el_mas_nuevo_va_primero_y_un_motivo_raro_no_rompe_nada() {
        let mut p = parsear_puntos(r#"[{"numero":1,"descripcion":"viejo","fecha":"2026-01-02T10:00:00","tipo":99},{"numero":2,"descripcion":"nuevo","fecha":"2026-10-30T10:00:00","tipo":12}]"#);
        p.sort_by(|a, b| b.fecha.cmp(&a.fecha));
        assert_eq!(p[0].descripcion, "nuevo");
        assert_eq!(p[1].tipo, "otro motivo");
    }

    #[test]
    fn sin_fecha_o_descripcion_no_se_inventa_nada() {
        let p = parsear_puntos(r#"[{"numero":7,"descripcion":"","fecha":"","tipo":13}]"#);
        assert_eq!(p[0].fecha, None);
        assert_eq!(p[0].descripcion, "Sin descripción");
    }

    #[test]
    fn las_descripciones_se_limpian_antes_de_mostrarse() {
        let p = parsear_puntos("[{\"numero\":3,\"descripcion\":\"Punto\\u0007 <img src=x>\",\"tipo\":0}]");
        assert!(!p[0].descripcion.contains('\u{7}'));
        assert!(p[0].descripcion.starts_with("Punto"));
    }

    #[test]
    fn sin_puntos_o_sin_acceso_lo_dice() {
        assert!(parsear_puntos("").is_empty());
        assert!(nota_puntos(0).contains("No hay puntos"));
        assert!(NOTA_SIN_LECTURA.contains("administrador"));
        assert!(nota_puntos(2).contains("no crea ni borra"));
    }

    fn archivo(nombre: &str, bytes: u64, carpeta: &str) -> ArchivoListado {
        ArchivoListado { nombre: nombre.to_string(), bytes, ruta: format!("{carpeta}\\{nombre}"), carpeta: carpeta.to_string() }
    }

    #[test]
    fn agrupa_por_nombre_sin_mayusculas_y_tamano_exacto() {
        let archivos = vec![
            archivo("Foto.jpg", 2_000_000, "~\\Downloads"),
            archivo("foto.JPG", 2_000_000, "~\\Pictures"),
            archivo("foto.jpg", 2_000_001, "~\\Desktop"), // otro tamaño: no es el mismo
            archivo("otra.pdf", 2_000_000, "~\\Documents"),
        ];
        let grupos = agrupar_duplicados(&archivos, 1);
        assert_eq!(grupos.len(), 1);
        assert_eq!(grupos[0].cantidad, 2);
        assert_eq!(grupos[0].copias.len(), 2);
        assert!((grupos[0].total_mb - 2.0 * 2_000_000.0 / MB_BYTES).abs() < 1e-9);
    }

    #[test]
    fn los_archivos_chicos_y_los_unicos_no_son_grupo() {
        let archivos = vec![archivo("a.txt", 10, "~"), archivo("a.txt", 10, "~\\x"), archivo("b.bin", 5_000_000, "~")];
        assert!(agrupar_duplicados(&archivos, MINIMO_BYTES_DUPLICADO).is_empty());
        assert_eq!(agrupar_duplicados(&archivos, 1).len(), 1);
    }

    #[test]
    fn el_grupo_que_mas_ocupa_va_primero() {
        let archivos = vec![
            archivo("chico.zip", 3_000_000, "~"), archivo("chico.zip", 3_000_000, "~\\a"),
            archivo("grande.mp4", 900_000_000, "~"), archivo("grande.mp4", 900_000_000, "~\\b"),
        ];
        let grupos = agrupar_duplicados(&archivos, MINIMO_BYTES_DUPLICADO);
        assert_eq!(grupos[0].nombre, "grande.mp4");
    }

    #[test]
    fn la_nota_avisa_que_son_posibles_y_que_revise() {
        assert!(nota_duplicados(2, true).contains("revisá antes de borrar"));
        assert!(nota_duplicados(0, true).contains("No encontré"));
        assert!(nota_duplicados(1, false).contains("puede haber más"));
    }

    #[test]
    fn el_recorrido_salta_dependencias_y_lista_solo_metadatos() {
        let raiz = std::env::temp_dir().join(format!("kerni-dup-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
        std::fs::create_dir_all(raiz.join("sub")).unwrap();
        std::fs::create_dir_all(raiz.join("node_modules")).unwrap();
        std::fs::write(raiz.join("a.txt"), b"hola").unwrap();
        std::fs::write(raiz.join("sub").join("a.txt"), b"hola").unwrap();
        std::fs::write(raiz.join("node_modules").join("ignorado.js"), b"x").unwrap();
        let mut pres = sistema::Presupuesto::nuevo(1000, std::time::Duration::from_secs(10));
        let mut salida = Vec::new();
        let completa = listar_archivos(&raiz, None, 0, &mut pres, &mut salida);
        let _ = std::fs::remove_dir_all(&raiz);
        assert!(completa);
        assert_eq!(salida.len(), 2, "node_modules no se recorre");
        assert!(salida.iter().all(|a| a.nombre == "a.txt" && a.bytes == 4));
        // con dos iguales de 4 bytes y un mínimo de 1 byte, forman un grupo
        assert_eq!(agrupar_duplicados(&salida, 1).len(), 1);
    }

    #[test]
    fn un_tope_de_entradas_marca_la_lista_como_incompleta() {
        let raiz = std::env::temp_dir().join(format!("kerni-dup-tope-{}", std::process::id()));
        std::fs::create_dir_all(&raiz).unwrap();
        for i in 0..5 {
            std::fs::write(raiz.join(format!("f{i}.txt")), b"x").unwrap();
        }
        let mut pres = sistema::Presupuesto::nuevo(2, std::time::Duration::from_secs(10));
        let mut salida = Vec::new();
        let completa = listar_archivos(&raiz, None, 0, &mut pres, &mut salida);
        let _ = std::fs::remove_dir_all(&raiz);
        assert!(!completa);
        assert!(salida.len() < 5);
    }

    #[test]
    fn la_fecha_de_instalacion_se_lee_o_se_descarta() {
        assert_eq!(fecha_de_instalacion("20240315").as_deref(), Some("2024-03-15"));
        assert_eq!(fecha_de_instalacion("2024"), None);
        assert_eq!(fecha_de_instalacion("2024ab15"), None);
        assert_eq!(fecha_de_instalacion("20241340"), None);
        assert_eq!(fecha_de_instalacion(""), None);
    }

    #[test]
    fn quita_repetidos_sin_mayusculas_y_ordena_del_mas_viejo() {
        let p = parsear_programas(r#"[
            {"nombre":"Zoom","version":"6.0","editor":"Zoom","instalado":"20250110"},
            {"nombre":"Git","version":"2.4","editor":"Git","instalado":"20220301"},
            {"nombre":"git","version":"2.5","editor":"x","instalado":"20230101"},
            {"nombre":"Sin fecha","version":"","editor":"","instalado":""},
            {"nombre":"","version":"1","editor":"","instalado":"20200101"}
        ]"#);
        let nombres: Vec<&str> = p.iter().map(|x| x.nombre.as_str()).collect();
        assert_eq!(nombres, vec!["Git", "Zoom", "Sin fecha"]);
        assert_eq!(p[0].instalado.as_deref(), Some("2022-03-01"));
        assert_eq!(p[2].instalado, None);
    }

    #[test]
    fn el_resumen_dice_que_el_uso_no_esta_disponible_y_cuenta_el_total() {
        let muchos: Vec<ProgramaInstalado> = (0..70)
            .map(|i| ProgramaInstalado { nombre: format!("app {i}"), version: String::new(), editor: String::new(), instalado: None })
            .collect();
        let r = resumen_programas(muchos);
        assert_eq!(r.total, 70);
        assert_eq!(r.programas.len(), MAX_PROGRAMAS_LISTADOS);
        assert!(!r.uso_disponible);
        let json = serde_json::to_value(&r).unwrap();
        assert_eq!(json["usoDisponible"], serde_json::Value::Bool(false));
        assert!(r.nota.contains("administrador"));
    }

    #[test]
    fn sin_salida_no_hay_programas_inventados() {
        assert!(parsear_programas("").is_empty());
        assert!(parsear_programas("[]").is_empty());
    }

}

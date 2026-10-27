@echo off
rem ============================================================================
rem  Kerni - lanzador de un solo clic.
rem    Kerni.bat          enciende todo y abre la app ya compilada (rapido)
rem    Kerni.bat dev      modo desarrollo: recarga el codigo al editarlo (compila en debug)
rem    Kerni.bat build    fuerza recompilar la app final (release) antes de abrirla
rem    Kerni.bat check    solo revisa que todo este en orden (no abre ni compila nada)
rem
rem  Que hace, en orden: revisa herramientas, instala dependencias que falten,
rem  enciende Docker + la base de conocimiento (si ya la preparaste con
rem  supabase\local\preparar.mjs), enciende el backend (cerebro) y abre la app.
rem  La app final se compila UNA vez y se reutiliza; solo se recompila si el
rem  codigo cambio (por ejemplo despues de un git pull).
rem ============================================================================
setlocal EnableExtensions
title Kerni
cd /d "%~dp0"
set "RAIZ=%~dp0"
set "BACK=%~dp0src\backend"
set "APP=%~dp0src\desktop"
set "PUERTO=8788"
rem Target fuera de OneDrive: evita bloqueos de archivos (error 101) y se comparte entre dev y release.
if not defined CARGO_TARGET_DIR set "CARGO_TARGET_DIR=%LOCALAPPDATA%\kerni\target"
set "EXE=%CARGO_TARGET_DIR%\release\kerni.exe"
set "INICIE_BACKEND=0"
set "TIENE_LLAVE=0"
set "MODO=normal"
if /i "%~1"=="check" set "MODO=check"
if /i "%~1"=="dev" set "MODO=dev"
if /i "%~1"=="build" set "MODO=build"

echo.
echo  ===== Kerni =====
echo.

rem ---- 1. Herramientas ------------------------------------------------------
call :necesito node  "Node.js 22 o mas - https://nodejs.org"
if errorlevel 1 goto :fin_error
call :necesito npm   "npm, que viene con Node.js"
if errorlevel 1 goto :fin_error
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEV=%%v"
set "NODEV=%NODEV:v=%"
if %NODEV% LSS 22 (
  echo  [x] Tu Node.js es v%NODEV% y Kerni necesita la 22 o mas.
  goto :fin_error
)
echo  [ok] Node.js y npm encontrados

rem ---- 2. Que hay que compilar ----------------------------------------------
set "COMPILAR=0"
if "%MODO%"=="build" set "COMPILAR=1"
if "%MODO%"=="normal" if not exist "%EXE%" set "COMPILAR=1"
if "%MODO%"=="normal" if exist "%EXE%" call :codigo_cambio
if "%MODO%"=="check" (
  if exist "%EXE%" (echo  [ok] App compilada: %EXE%) else (echo  [!] App sin compilar: se compila la primera vez que abras Kerni)
)
if "%COMPILAR%"=="1" call :necesito cargo "Rust - https://rustup.rs"
if errorlevel 1 goto :fin_error
if "%MODO%"=="dev" call :necesito cargo "Rust - https://rustup.rs"
if errorlevel 1 goto :fin_error

rem ---- 3. Dependencias (solo la primera vez) --------------------------------
call :dependencias "%BACK%" "del backend"
if errorlevel 1 goto :fin_error
if "%COMPILAR%"=="1" call :dependencias "%APP%" "de la app"
if errorlevel 1 goto :fin_error
if "%MODO%"=="dev" call :dependencias "%APP%" "de la app"
if errorlevel 1 goto :fin_error
if "%MODO%"=="check" call :dependencias "%APP%" "de la app"

rem ---- 4. Llave del modelo (solo para el chat con IA) -----------------------
if not exist "%BACK%\.env" (
  if not "%MODO%"=="check" copy /y "%BACK%\.env.example" "%BACK%\.env" >nul
)
rem Sirve cualquiera de las tres: Anthropic, Gemini u OpenRouter (en .env o como variable de entorno).
if defined ANTHROPIC_API_KEY set "TIENE_LLAVE=1"
if defined GEMINI_API_KEY set "TIENE_LLAVE=1"
if defined GOOGLE_API_KEY set "TIENE_LLAVE=1"
if defined OPENROUTER_API_KEY set "TIENE_LLAVE=1"
if exist "%BACK%\.env" (
  findstr /r /c:"^ANTHROPIC_API_KEY=..*" /c:"^GEMINI_API_KEY=..*" /c:"^GOOGLE_API_KEY=..*" /c:"^OPENROUTER_API_KEY=..*" "%BACK%\.env" >nul 2>&1
  if not errorlevel 1 set "TIENE_LLAVE=1"
)
if "%TIENE_LLAVE%"=="1" (
  echo  [ok] Llave de modelo configurada: el chat con IA estara activo
) else (
  echo  [!] Sin llave de modelo: el chat con IA no funcionara.
  echo      Todo lo demas SI funciona sin ella ^(RAM, disco, panico, limpiar temporales^).
  echo      Para activarlo, pega UNA llave en src\backend\.env: ANTHROPIC_API_KEY=, GEMINI_API_KEY= u OPENROUTER_API_KEY=
)

rem ---- 5. Base de conocimiento (Supabase Cloud, o Docker) --------------------
rem Si SUPABASE_URL apunta a un proyecto de Supabase Cloud no se necesita Docker.
set "NUBE=0"
if exist "%BACK%\.env" (
  findstr /r /c:"^SUPABASE_URL=https://..*\.supabase\.co" "%BACK%\.env" >nul 2>&1
  if not errorlevel 1 set "NUBE=1"
)
if "%NUBE%"=="1" (
  echo  [ok] Base de conocimiento en Supabase Cloud ^(no hace falta Docker^)
  goto :fin_conocimiento
)
if exist "%RAIZ%supabase\local\.env" (
  if "%MODO%"=="check" (
    echo  [ok] Base de conocimiento preparada ^(se enciende con Docker al abrir^)
  ) else (
    call :encender_docker
  )
) else (
  echo  [i] Base de conocimiento sin preparar: Kerni funciona igual, solo sin los manuales.
  echo      Para activarla: node supabase\local\preparar.mjs
)
:fin_conocimiento

if "%MODO%"=="check" (
  echo.
  echo  Revision lista. No se abrio nada.
  exit /b 0
)

rem ---- 6. Cerebro (backend) -------------------------------------------------
if "%TIENE_LLAVE%"=="1" call :encender_backend

rem ---- 7. La app ------------------------------------------------------------
echo.
if "%MODO%"=="dev" goto :abrir_dev
if "%COMPILAR%"=="1" call :compilar
if errorlevel 1 goto :fin_error_backend
echo  [..] Abriendo Kerni. Aparece en la esquina inferior derecha.
echo       Para cerrarlo: clic con dos dedos ^(clic derecho^) sobre el, o su icono en la bandeja.
echo       ^(Esta ventana se cierra sola cuando Kerni se cierra.^)
echo.
start "" /wait "%EXE%"
set "CODIGO=%errorlevel%"
goto :cerrar

:abrir_dev
echo  [..] Modo desarrollo. La PRIMERA vez compila Rust y puede tardar varios minutos.
echo       ^(Esta ventana se cierra sola cuando Kerni se cierra.^)
echo.
cd /d "%APP%"
call npm run dev
set "CODIGO=%errorlevel%"

:cerrar
rem ---- 8. Al cerrar: apagar el backend que encendimos -----------------------
if "%INICIE_BACKEND%"=="1" call :apagar_backend
if not "%CODIGO%"=="0" (
  echo.
  echo  [x] Kerni se cerro con un error ^(codigo %CODIGO%^). Revisa los mensajes de arriba.
  goto :fin_error
)
exit /b 0

rem ============================================================================
:necesito
where %1 >nul 2>&1
if errorlevel 1 (
  echo  [x] Falta %~2
  exit /b 1
)
exit /b 0

:dependencias
if exist "%~1\node_modules" (
  echo  [ok] Dependencias %~2
  exit /b 0
)
if "%MODO%"=="check" (
  echo  [!] Faltan las dependencias %~2 ^(se instalan al abrir^)
  exit /b 0
)
echo  [..] Instalando dependencias %~2, un momento...
pushd "%~1"
call npm install --no-audit --no-fund
set "R=%errorlevel%"
popd
exit /b %R%

:codigo_cambio
rem Compara la fecha del exe con la del codigo de la app: si el codigo es mas nuevo, hay que recompilar.
powershell -NoProfile -Command "$e=(Get-Item '%EXE%').LastWriteTime; $n=Get-ChildItem '%APP%\web','%APP%\src-tauri\src','%APP%\src-tauri\tauri.conf.json','%APP%\src-tauri\Cargo.toml' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($n.LastWriteTime -gt $e) { exit 1 } else { exit 0 }" >nul 2>&1
if errorlevel 1 (
  echo  [i] El codigo de la app cambio desde la ultima compilacion: se recompila.
  set "COMPILAR=1"
) else (
  echo  [ok] App compilada y al dia
)
exit /b 0

:compilar
echo  [..] Compilando la app final. Solo la primera vez ^(o si el codigo cambio^) tarda varios minutos...
pushd "%APP%"
call npm run build -- --no-bundle
set "R=%errorlevel%"
popd
if not "%R%"=="0" (
  echo  [x] No se pudo compilar la app ^(codigo %R%^).
  exit /b 1
)
if not exist "%EXE%" (
  echo  [x] La compilacion termino pero no encuentro %EXE%
  exit /b 1
)
echo  [ok] App compilada
exit /b 0

:docker_responde
rem Docker Desktop a veces queda colgado: se le da un maximo de 15 segundos para contestar.
powershell -NoProfile -Command "$j=Start-Job { docker info *> $null; $LASTEXITCODE }; if (Wait-Job $j -Timeout 15) { exit [int](Receive-Job $j) } else { Stop-Job $j; exit 99 }" >nul 2>&1
exit /b %errorlevel%

:encender_docker
where docker >nul 2>&1
if errorlevel 1 (
  echo  [!] Docker no esta instalado: sigo sin la base de conocimiento.
  exit /b 0
)
call :docker_responde
if not errorlevel 1 goto :docker_listo
tasklist /fi "imagename eq Docker Desktop.exe" 2>nul | find /i "Docker Desktop.exe" >nul
if errorlevel 1 (
  echo  [..] Abriendo Docker Desktop...
  if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" (
    start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
  ) else (
    echo  [!] No encuentro Docker Desktop: sigo sin la base de conocimiento.
    exit /b 0
  )
) else (
  echo  [..] Esperando a que Docker responda...
)
set /a ESPERAS=0
:esperar_docker
call :docker_responde
if not errorlevel 1 goto :docker_listo
set /a ESPERAS+=1
if %ESPERAS% GEQ 18 (
  echo  [!] Docker no respondio a tiempo: sigo sin la base de conocimiento.
  echo      Si Docker quedo colgado, reinicialo o reinicia la PC y vuelve a abrir Kerni.
  exit /b 0
)
ping -n 6 127.0.0.1 >nul
goto :esperar_docker
:docker_listo
docker compose -f "%RAIZ%supabase\local\docker-compose.yml" up -d >nul 2>&1
if errorlevel 1 (
  echo  [!] No pude encender la base de conocimiento: sigo sin ella.
  exit /b 0
)
echo  [ok] Base de conocimiento encendida
exit /b 0

:encender_backend
curl -s -o nul http://127.0.0.1:%PUERTO%/health >nul 2>&1
if not errorlevel 1 (
  echo  [ok] El backend ya estaba encendido
  exit /b 0
)
echo  [..] Encendiendo el backend...
set "INICIE_BACKEND=1"
start "Kerni backend" /min cmd /c "cd /d "%BACK%" && npm start"
set /a INTENTOS=0
:esperar_backend
curl -s -o nul http://127.0.0.1:%PUERTO%/health >nul 2>&1
if not errorlevel 1 (
  echo  [ok] Backend encendido en http://127.0.0.1:%PUERTO%
  curl -s http://127.0.0.1:%PUERTO%/health
  echo.
  exit /b 0
)
set /a INTENTOS+=1
if %INTENTOS% GEQ 20 (
  echo  [!] El backend no respondio; abro la app igual, sin chat con IA.
  exit /b 0
)
ping -n 2 127.0.0.1 >nul
goto :esperar_backend

:apagar_backend
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PUERTO% " ^| findstr LISTENING') do taskkill /pid %%p /t /f >nul 2>&1
echo  [ok] Backend apagado
exit /b 0

:fin_error_backend
if "%INICIE_BACKEND%"=="1" call :apagar_backend
:fin_error
echo.
pause
exit /b 1

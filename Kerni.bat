@echo off
rem ============================================================================
rem  Kerni - lanzador. Doble clic y listo.
rem    Kerni.bat          instala lo que falte, enciende el cerebro (backend) y abre la app
rem    Kerni.bat check    solo revisa que todo este en orden (no abre nada)
rem ============================================================================
setlocal EnableExtensions
title Kerni
cd /d "%~dp0"
set "BACK=%~dp0src\backend"
set "APP=%~dp0src\desktop"
set "PUERTO=8788"
rem Mover target fuera de OneDrive para evitar bloqueos de archivos (error 101 en indexmap/autocfg)
if not defined CARGO_TARGET_DIR set "CARGO_TARGET_DIR=%LOCALAPPDATA%\kerni\target"
set "INICIE_BACKEND=0"
set "TIENE_LLAVE=0"
set "SOLO_REVISAR=0"
if /i "%~1"=="check" set "SOLO_REVISAR=1"

echo.
echo  ===== Kerni =====
echo.

rem ---- 1. Herramientas ------------------------------------------------------
call :necesito node  "Node.js 22 o mas - https://nodejs.org"
if errorlevel 1 goto :fin_error
call :necesito npm   "npm, que viene con Node.js"
if errorlevel 1 goto :fin_error
call :necesito cargo "Rust - https://rustup.rs"
if errorlevel 1 goto :fin_error
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEV=%%v"
set "NODEV=%NODEV:v=%"
if %NODEV% LSS 22 (
  echo  [x] Tu Node.js es v%NODEV% y Kerni necesita la 22 o mas.
  goto :fin_error
)
echo  [ok] Node.js, npm y Rust encontrados

rem ---- 2. Dependencias (solo la primera vez) --------------------------------
call :dependencias "%BACK%" "del backend"
if errorlevel 1 goto :fin_error
call :dependencias "%APP%" "de la app"
if errorlevel 1 goto :fin_error

rem ---- 3. Llave del modelo (solo para el chat con IA) -----------------------
if not exist "%BACK%\.env" (
  if "%SOLO_REVISAR%"=="0" copy /y "%BACK%\.env.example" "%BACK%\.env" >nul
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

if "%SOLO_REVISAR%"=="1" (
  echo.
  echo  Revision lista. No se abrio nada.
  exit /b 0
)

rem ---- 4. Cerebro (backend) -------------------------------------------------
if "%TIENE_LLAVE%"=="1" call :encender_backend

rem ---- 5. La app ------------------------------------------------------------
echo.
echo  [..] Abriendo Kerni. La PRIMERA vez compila Rust y puede tardar varios minutos;
echo       despues abre en segundos. Kerni aparece en la esquina inferior derecha.
echo       Para cerrarlo: clic derecho sobre el, o su icono en la bandeja del sistema.
echo       ^(Esta ventana se cierra sola cuando Kerni se cierra.^)
echo.
cd /d "%APP%"
call npm run dev
set "CODIGO=%errorlevel%"

rem ---- 6. Al cerrar: apagar el backend que encendimos -----------------------
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
if "%SOLO_REVISAR%"=="1" (
  echo  [!] Faltan las dependencias %~2 ^(se instalan al abrir^)
  exit /b 0
)
echo  [..] Instalando dependencias %~2, un momento...
pushd "%~1"
call npm install --no-audit --no-fund
set "R=%errorlevel%"
popd
exit /b %R%

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

:fin_error
echo.
pause
exit /b 1

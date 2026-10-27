@echo off
rem ============================================================================
rem  Kerni con la base de conocimiento en Supabase Cloud.
rem    Kerni-nube.bat          revisa el proyecto de Supabase y abre Kerni (sin Docker)
rem    Kerni-nube.bat check    solo revisa
rem  Necesita SUPABASE_URL y SUPABASE_SECRET_KEY en src\backend\.env
rem  (guia: docs\supabase-cloud-setup.md). No enciende Docker.
rem ============================================================================
setlocal EnableExtensions
title Kerni (nube)
cd /d "%~dp0"
set "BACK=%~dp0src\backend"

where node >nul 2>&1
if errorlevel 1 (
  echo  [x] Falta Node.js 22 o mas - https://nodejs.org
  goto :error
)
if not exist "%BACK%\.env" goto :sin_nube
findstr /r /c:"^SUPABASE_URL=https://..*\.supabase\.co" "%BACK%\.env" >nul 2>&1
if errorlevel 1 goto :sin_nube
findstr /r /c:"^SUPABASE_SECRET_KEY=..*" "%BACK%\.env" >nul 2>&1
if errorlevel 1 goto :sin_nube

if not exist "%BACK%\node_modules" (
  echo  [..] Instalando dependencias del backend, un momento...
  pushd "%BACK%"
  call npm install --no-audit --no-fund
  popd
)

echo.
echo  ===== Revisando el proyecto de Supabase =====
echo.
pushd "%BACK%"
call npm run --silent probar-supabase
set "R=%errorlevel%"
popd
if not "%R%"=="0" (
  echo.
  echo  [x] El proyecto de Supabase no esta listo. Mira los mensajes de arriba.
  echo      Guia: docs\supabase-cloud-setup.md
  goto :error
)
if /i "%~1"=="check" exit /b 0

call "%~dp0Kerni.bat" %*
exit /b %errorlevel%

:sin_nube
echo  [x] Falta configurar Supabase Cloud en src\backend\.env:
echo        SUPABASE_URL=https://TU-PROYECTO.supabase.co
echo        SUPABASE_SECRET_KEY=sb_secret_...
echo      Guia: docs\supabase-cloud-setup.md
:error
echo.
pause
exit /b 1
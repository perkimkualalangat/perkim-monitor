@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ---------------------------------------------------------------
rem  PERKIM Monitor - dashboard pemantauan tempatan
rem  Guna:  start-monitor.bat          (audit pantas)
rem         start-monitor.bat --full   (termasuk Lighthouse)
rem ---------------------------------------------------------------

set "FULL="
if /i "%~1"=="--full" set "FULL=--lighthouse"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js tidak ditemui. Pasang Node.js 20 atau lebih baharu.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Memasang dependency sekali sahaja...
  call npm install
  if errorlevel 1 (
    echo Pemasangan dependency gagal.
    pause
    exit /b 1
  )
)

echo.
echo Menjalankan audit...
node tools\audit.mjs --site ..\perkim-web %FULL%
if errorlevel 1 (
  echo.
  echo Audit gagal. Dashboard akan dibuka dengan data terakhir jika ada.
  echo.
)

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8082'"
node tools\serve.mjs 8082

@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Derle.ps1" %*
if errorlevel 1 (
  echo.
  echo Derleme tamamlanamadi. Yukaridaki hata mesajini kontrol edin.
  pause
  exit /b 1
)
pause

@echo off
rem Double-click to restart the explainers site. Arguments pass through to start.ps1
rem (for example: start.cmd -Pull -Port 8080).
where pwsh >nul 2>&1
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
)
if errorlevel 1 pause

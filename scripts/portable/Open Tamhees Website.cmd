@echo off
setlocal
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Tamhees.ps1"
set "TamheesExit=%ERRORLEVEL%"
if not "%TamheesExit%"=="0" pause
exit /b %TamheesExit%
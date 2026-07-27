@echo off
cd /d "%~dp0"
title Woonpyung - Worker Autostart OFF
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0worker-autostart.ps1" -Off
echo.
pause
@echo off
cd /d "%~dp0"
title Woonpyung - Worker Autostart ON
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0worker-autostart.ps1"
echo.
pause
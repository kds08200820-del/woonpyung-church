@echo off
cd /d "%~dp0"
title Woonpyung - QT TTS Worker OFF (home PC)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0qt-tts-watchdog.ps1" -Off
echo.
pause

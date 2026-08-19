@echo off
cd /d "%~dp0"
title Woonpyung - QT TTS Worker STATUS
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0qt-tts-watchdog.ps1" -Status
echo.
pause

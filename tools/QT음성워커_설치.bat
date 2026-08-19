@echo off
cd /d "%~dp0"
title Woonpyung - QT TTS Worker INSTALL (church PC)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0qt-tts-watchdog.ps1" -Install
echo.
pause

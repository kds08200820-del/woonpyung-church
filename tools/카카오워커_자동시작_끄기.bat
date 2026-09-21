@echo off
cd /d "%~dp0"
title Woonpyung - KakaoTalk Worker Autostart OFF
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kakao-worker-autostart.ps1" -Off
echo.
pause

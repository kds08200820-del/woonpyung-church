@echo off
cd /d "%~dp0"
title Woonpyung - KakaoTalk Worker Autostart ON
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kakao-worker-autostart.ps1"
echo.
pause

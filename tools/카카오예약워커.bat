@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Woonpyung - KakaoTalk Reservation Worker
if "%KAKAO_WORKER_NAME%"=="" set "KAKAO_WORKER_NAME=%COMPUTERNAME%"
C:\qt-video\venv\Scripts\python.exe kakao_worker.py --watch
echo.
pause

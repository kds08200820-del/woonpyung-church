@echo off
cd /d "%~dp0"
title Woonpyung - Sunday Material Worker
if "%WORSHIP_WORKER_NAME%"=="" set "WORSHIP_WORKER_NAME=home-pc"
python worship_worker.py --watch
echo.
pause
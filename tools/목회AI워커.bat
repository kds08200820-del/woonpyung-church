@echo off
cd /d "%~dp0"
title Woonpyung - Homepage AI Worker (Claude CLI)
if "%AI_WORKER_NAME%"=="" set "AI_WORKER_NAME=church-pc"
python ai_worker.py --watch
echo.
echo (Worker stopped. Close this window or press a key to exit.)
pause

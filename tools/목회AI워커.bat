@echo off
cd /d "%~dp0"
title Woonpyung - Homepage AI Worker (Claude CLI)
if "%AI_WORKER_NAME%"=="" set "AI_WORKER_NAME=church-pc"

rem If the worker ever exits (crash, transient error), restart it automatically.
rem 2026-08-22: the worker silently died between 08-18 and 08-21 and questions
rem piled up unanswered for a day - this loop makes sure it comes back on its own.
:loop
python ai_worker.py --watch
echo.
echo (%date% %time%) Worker exited - restarting in 15 seconds. Close this window to stop.
timeout /t 15 /nobreak >nul
goto loop

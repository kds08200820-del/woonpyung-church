@echo off
chcp 65001 > nul
setlocal EnableExtensions

rem ---------------------------------------------------------------
rem  Send today's QT to the KakaoTalk group chat.
rem  (This file is ASCII-only on purpose: a non-ASCII batch combined
rem   with "chcp 65001" corrupts cmd's parser. Korean messages come
rem   from the Python script, which prints UTF-8.)
rem
rem    kakao send .bat                -> send
rem    kakao send .bat --preview      -> show message only
rem    kakao send .bat --dry-run      -> stop right before sending
rem    kakao send .bat --force        -> allow resend on the same day
rem    kakao send .bat --scheduled    -> used by Task Scheduler (no pause)
rem ---------------------------------------------------------------

set "PY=C:\qt-video\venv\Scripts\python.exe"
set "QUIET=0"
set "ARGS="

:parse
if "%~1"=="" goto run
if /i "%~1"=="--scheduled" (
  set "QUIET=1"
) else (
  set "ARGS=%ARGS% %~1"
)
shift
goto parse

:run
if not exist "%PY%" (
  echo [ERROR] Python not found: %PY%
  if "%QUIET%"=="0" pause
  exit /b 1
)

"%PY%" "%~dp0kakao_qt_send.py"%ARGS%
set "RC=%ERRORLEVEL%"

if "%RC%"=="2" echo [INFO] No QT for today on the website - skipped.
if not "%RC%"=="0" if not "%RC%"=="2" echo [ERROR] Send failed - see tools\logs\kakao_qt.log

if "%QUIET%"=="0" if not "%RC%"=="0" if not "%RC%"=="2" pause
exit /b %RC%

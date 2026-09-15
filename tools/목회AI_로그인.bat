@echo off
cd /d "%~dp0"
title Woonpyung - Claude CLI login (for Homepage AI Worker)

rem Re-login the church PC's Claude CLI when the homepage says the Claude login
rem expired, or the worker window shows "!! claude CLI ...".
rem Subscription login (NOT an API key). Keep this file ASCII-only (code page).

set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
if not exist "%CLAUDE%" set "CLAUDE=claude"

echo.
echo  A browser window will open. Sign in with the church's Claude account,
echo  then come back to this window.
echo.
"%CLAUDE%" auth login
echo.
echo  ---- login status ----
"%CLAUDE%" auth status
echo.
echo  If  "loggedIn": true  is shown above, the homepage AI works again right away.
echo  (No need to restart the AI worker window.)
echo.
pause

@echo off
cd /d "%~dp0"
title Woonpyung - Claude long-lived token for the church PC workers

rem ONE-TIME setup (valid about 1 year). Keep this file ASCII-only (code page).
rem Why: several programs on this PC share one Claude login and refresh it at the
rem same time, which wipes the login every few days (9/16, 9/23 ...). The workers
rem (homepage AI, worship materials) now use their OWN long-lived token instead,
rem saved in %USERPROFILE%\.woonpyung\claude-token.txt  (see tools\claude_auth.py).
rem If the token ever fails, the workers fall back to the shared login automatically.

set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
if not exist "%CLAUDE%" set "CLAUDE=claude"

echo.
echo  STEP 1. A browser window will open. Sign in with the church's Claude account
echo          and approve. This window will then print a long token (sk-ant-oat...).
echo.
pause
"%CLAUDE%" setup-token
echo.
echo  STEP 2. Copy the whole token printed above (starts with sk-ant-), then paste it
echo          below and press Enter. (It is hidden while you paste - that is normal.)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = Read-Host 'Token' -AsSecureString;" ^
  "$t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim();" ^
  "if (-not $t.StartsWith('sk-ant-')) { Write-Host ''; Write-Host '  That does not look like a token (it should start with sk-ant-). Nothing saved - run this file again.' -ForegroundColor Red; exit 1 }" ^
  "$d = Join-Path $env:USERPROFILE '.woonpyung'; New-Item -ItemType Directory -Force $d | Out-Null;" ^
  "[IO.File]::WriteAllText((Join-Path $d 'claude-token.txt'), $t);" ^
  "Write-Host ''; Write-Host '  Saved.' -ForegroundColor Green"
if errorlevel 1 goto end

echo.
echo  STEP 3. Checking the token with a tiny test request ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$env:CLAUDE_CODE_OAUTH_TOKEN = (Get-Content -Raw (Join-Path $env:USERPROFILE '.woonpyung\claude-token.txt')).Trim();" ^
  "$r = 'Reply with exactly: OK' | & '%CLAUDE%' -p --model haiku --no-session-persistence 2>&1 | Out-String;" ^
  "Write-Host ('  answer: ' + $r.Trim());" ^
  "if ($r -cmatch '(^|[^A-Za-z])OK([^A-Za-z]|$)') { Write-Host ''; Write-Host '  SUCCESS - the homepage AI works again, and this login will not drop again.' -ForegroundColor Green; Write-Host '  (No need to restart the worker windows.)' } else { Write-Host ''; Write-Host '  The test did not answer OK. Run this file again, or tell the developer.' -ForegroundColor Red }"

:end
echo.
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 운평장로교회 - 주일 자료 워커
rem ── 주일 자료 일괄 생성 워커 ─────────────────────────────────
rem  홈페이지 설교 매니저의 "주일 자료 일괄 생성" 버튼이 넣은 작업을
rem  가져와 Claude Code 로 예배 자료를 만들고 홈페이지에 올립니다.
rem
rem  · 켜기 : 이 파일을 더블클릭. 창을 켜둔 채로 두세요.
rem  · 끄기 : 창에서 Ctrl+C 를 누르거나 창을 닫으세요.
rem
rem  키는 이 파일에 적지 않습니다. 한 번만 아래를 실행해 두면 됩니다.
rem    setx SUPABASE_SERVICE_ROLE_KEY "복사한키"
rem  (공개 저장소에 올라가는 파일이라 키를 넣으면 위험합니다)
rem ─────────────────────────────────────────────────────────────

if "%SUPABASE_SERVICE_ROLE_KEY%"=="" (
  echo.
  echo   [설정 필요] SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.
  echo.
  echo   PowerShell 을 열어 아래를 한 번 실행한 뒤,
  echo   창을 닫았다 다시 열고 이 파일을 실행하세요.
  echo.
  echo     setx SUPABASE_SERVICE_ROLE_KEY "복사한키"
  echo.
  echo   키는 Supabase 대시보드에서 확인합니다.
  echo     Project Settings - API - service_role - Reveal
  echo.
  pause
  exit /b 1
)

rem 워커 이름 — 집 PC 와 교회 PC 를 구분합니다. 교회 PC 에서는 church-pc 로 바꾸세요.
if "%WORSHIP_WORKER_NAME%"=="" set "WORSHIP_WORKER_NAME=home-pc"

echo.
echo   주일 자료 워커를 시작합니다. (%WORSHIP_WORKER_NAME%)
echo   창을 닫으면 꺼집니다. 생성 중에는 켜두세요.
echo.
python worship_worker.py --watch

echo.
echo   워커가 종료되었습니다.
pause

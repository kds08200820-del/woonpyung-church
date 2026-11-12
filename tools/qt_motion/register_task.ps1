# 매일 QT 모션 영상 — Windows 작업 스케줄러에 '매일 01:00' 으로 등록한다.
#   등록:  powershell -ExecutionPolicy Bypass -File register_task.ps1
#   해제:  powershell -ExecutionPolicy Bypass -File register_task.ps1 -Remove
param([switch]$Remove, [string]$At = '01:00')
$name = 'WoonpyungQtMotionDaily'
if ($Remove) {
  schtasks /delete /tn $name /f | Out-Null
  Write-Host "예약을 지웠습니다: $name"
  exit 0
}
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = 'C:\qt-video\motion\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
# 창 없이 돌리고, 날짜별 기록 파일을 남긴다
$run = Join-Path 'C:\qt-video\motion' 'run_daily.cmd'
$py = (Get-Command python).Source
@"
@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd')"') do set D=%%d
"$py" -u "$here\qt_motion.py" >> "$logDir\%D%.log" 2>&1
"@ | Out-File -FilePath $run -Encoding ascii
schtasks /create /tn $name /tr "cmd /c `"$run`"" /sc daily /st $At /f | Out-Null
Write-Host "등록했습니다: 매일 $At — $name"
Write-Host "기록: $logDir\<날짜>.log"
Write-Host "PC 가 그 시각에 켜져 있고 로그인되어 있어야 돕니다."

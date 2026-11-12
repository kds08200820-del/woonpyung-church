# 매일 QT 모션 영상 — Windows 작업 스케줄러에 '15분마다' 로 등록한다.
#   15분마다 qt_motion.py --auto 가 돈다(창 없이). 하는 일:
#     · 목회행정 매니저 'QT 영상 관리 > 영상 만들기' 로 들어온 제작 요청을 차례로 만든다
#     · 새벽 1시가 지났고 내일 것이 아직 없으면 만든다(원고가 늦게 들어오면 들어온 뒤에)
#   이미 제작이 돌고 있으면 아무것도 하지 않고 끝난다(한 번에 하나만).
#   등록:  powershell -ExecutionPolicy Bypass -File register_task.ps1
#   해제:  powershell -ExecutionPolicy Bypass -File register_task.ps1 -Remove
param([switch]$Remove, [int]$Every = 15)
$name = 'WoonpyungQtMotionDaily'
if ($Remove) {
  schtasks /delete /tn $name /f | Out-Null
  Write-Host "예약을 지웠습니다: $name"
  exit 0
}
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# 설치.bat 이 만들어 둔 사본(C:\qt-video\motion\app)이 있으면 그것으로 돈다 — OneDrive 안의 저장소 폴더에 기대지 않게
$appCopy = 'C:\qt-video\motion\app\qt_motion'
if (Test-Path (Join-Path $appCopy 'qt_motion.py')) { $here = $appCopy }
$logDir = 'C:\qt-video\motion\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
# 날짜별 기록 파일을 남긴다(할 일이 없으면 아무것도 적지 않는다)
$run = Join-Path 'C:\qt-video\motion' 'run_daily.cmd'
$py = (Get-Command python).Source
@"
@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd')"') do set D=%%d
"$py" -u "$here\qt_motion.py" --auto >> "$logDir\%D%.log" 2>&1
"@ | Out-File -FilePath $run -Encoding ascii
# 창이 뜨지 않게 감싸는 파일
$vbs = Join-Path 'C:\qt-video\motion' 'run_hidden.vbs'
'CreateObject("WScript.Shell").Run "cmd /c ""C:\qt-video\motion\run_daily.cmd""", 0, False' | Out-File -FilePath $vbs -Encoding ascii
schtasks /create /tn $name /tr "wscript.exe `"$vbs`"" /sc minute /mo $Every /f | Out-Null
Write-Host "등록했습니다: $Every 분마다 — $name"
Write-Host "기록: $logDir\<날짜>.log"
Write-Host "PC 가 켜져 있고 로그인되어 있어야 돕니다."

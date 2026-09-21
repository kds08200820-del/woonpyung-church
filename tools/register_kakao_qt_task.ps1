<#
  운평장로교회 — 오늘의 QT 카카오톡 자동 발송 작업 등록
  매일 오전 6:00에 tools\카카오QT_발송.bat 을 실행하도록 Windows 작업 스케줄러에 등록합니다.

  사용법 (관리자 권한 필요 없음):
    powershell -ExecutionPolicy Bypass -File "tools\register_kakao_qt_task.ps1"

  시간을 바꾸려면:
    powershell -ExecutionPolicy Bypass -File "tools\register_kakao_qt_task.ps1" -Time "05:40"

  등록 해제:
    powershell -ExecutionPolicy Bypass -File "tools\register_kakao_qt_task.ps1" -Unregister
#>
param(
    [string]$Time = "06:00",
    [string]$TaskName = "운평 QT 카카오톡 발송",
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat  = Join-Path $here "카카오QT_발송.bat"

if ($Unregister) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "등록 해제 완료: $TaskName"
    } else {
        Write-Host "등록된 작업이 없습니다: $TaskName"
    }
    exit 0
}

if (-not (Test-Path $bat)) { throw "발송 배치 파일을 찾지 못했습니다: $bat" }

# 카카오톡 PC 조작은 로그인된 대화형 세션에서만 가능하므로
# '사용자가 로그온했을 때만 실행' + '숨김'으로 등록한다.
$action = New-ScheduledTaskAction -Execute "cmd.exe" `
    -Argument "/c `"`"$bat`" --scheduled`"" -WorkingDirectory $here

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -DontStopOnIdleEnd `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description "매일 $Time 에 홈페이지 오늘의 QT를 카카오톡 '에클레시아 운평' 단톡방으로 발송합니다." | Out-Null

Write-Host ""
Write-Host "등록 완료: $TaskName  (매일 $Time)"
Write-Host "  실행 대상 : $bat"
Write-Host "  로그      : $(Join-Path $here 'logs\kakao_qt.log')"
Write-Host ""
Write-Host "지금 바로 한 번 시험하려면:"
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host ""
Write-Host "[확인 필요] 오전 $Time 에 PC가 켜져(또는 절전) 있고 카카오톡이 자동 로그인돼 있어야 합니다."

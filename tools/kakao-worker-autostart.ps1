# 운평장로교회 — 카카오톡 예약 발송 워커 자동시작 등록/해제
#
#   .\kakao-worker-autostart.ps1          로그인 시 자동 실행 등록
#   .\kakao-worker-autostart.ps1 -Off     해제
#
# 관리자 권한이 필요 없습니다. 시작프로그램 폴더에 바로가기만 만듭니다.
# (배치 파일에 한글을 넣으면 코드페이지 문제로 깨지므로 로직을 여기 둡니다)

param([switch]$Off)

$ErrorActionPreference = 'Stop'

$LinkName = '운평 카카오 예약 워커.lnk'
$Startup  = [Environment]::GetFolderPath('Startup')
$LinkPath = Join-Path $Startup $LinkName
$Target   = Join-Path $PSScriptRoot '카카오예약워커.bat'

# 워커가 도중에 꺼져도 15분 안에 다시 켜 주는 감시 작업 (kakao-worker-watchdog.ps1)
$TaskName = '운평 카카오 예약 워커 감시'
$Watchdog = Join-Path $PSScriptRoot 'kakao-worker-watchdog.ps1'

if ($Off) {
    if (Test-Path $LinkPath) {
        Remove-Item $LinkPath -Force
        Write-Host "  해제 완료 — 다음 로그인부터 자동 실행되지 않습니다." -ForegroundColor Green
    } else {
        Write-Host "  등록되어 있지 않습니다." -ForegroundColor Yellow
    }
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "  감시 작업도 해제했습니다." -ForegroundColor Green
    }
    Write-Host "  이미 켜져 있는 워커 창은 그대로입니다. 끄려면 창을 닫으세요."
    return
}

if (-not (Test-Path $Target)) {
    Write-Host "  [실패] 워커 실행 파일을 찾을 수 없습니다:" -ForegroundColor Red
    Write-Host "         $Target"
    exit 1
}

$sh = New-Object -ComObject WScript.Shell
$sc = $sh.CreateShortcut($LinkPath)
$sc.TargetPath       = $Target
$sc.WorkingDirectory = $PSScriptRoot
$sc.Description      = '운평장로교회 카카오톡 예약 발송 워커'
$sc.Save()

Write-Host "  등록 완료" -ForegroundColor Green
Write-Host "    바로가기  : $LinkPath"
Write-Host "    실행 대상 : $Target"
Write-Host ""
Write-Host "  이제 윈도우에 로그인할 때마다 예약 발송 워커가 자동으로 켜집니다."
Write-Host "  지금 바로 켜려면 '카카오예약워커.bat' 을 더블클릭하세요."

# 감시 작업: 로그인 때 + 15분마다. 창 없이(conhost --headless) 돌고, 워커가 없을 때만 켠다.
# 발송 작업('운평 QT 카카오톡 발송')과는 별개 — 이것은 아무것도 보내지 않는다.
$act = New-ScheduledTaskAction -Execute 'conhost.exe' `
    -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Watchdog`"" `
    -WorkingDirectory $PSScriptRoot
$every = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15)
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$who   = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
$set   = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $TaskName -Action $act -Trigger $every, $logon `
    -Principal $who -Settings $set -Force | Out-Null
Write-Host "  감시 작업 등록 — '$TaskName' (15분마다, 워커가 꺼져 있으면 다시 켬)" -ForegroundColor Green

# 로그인 때 조용히 실패하는 것을 막기 위해 미리 점검한다.
if (-not [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')) {
    Write-Host ""
    Write-Host "  [주의] SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다." -ForegroundColor Yellow
    Write-Host "         아래를 한 번 실행해 두어야 워커가 동작합니다."
    Write-Host '         setx SUPABASE_SERVICE_ROLE_KEY "복사한키"'
}

$cfg = Join-Path $PSScriptRoot 'kakao_qt_config.json'
if (-not (Test-Path $cfg)) {
    Write-Host ""
    Write-Host "  [주의] kakao_qt_config.json 이 없습니다." -ForegroundColor Yellow
    Write-Host "         매일 자동 발송을 쓰려면 kakao_qt_config.example.json 을 복사해"
    Write-Host "         room_name 을 채워 주세요. (예약 발송만 쓸 거면 없어도 됩니다)"
}

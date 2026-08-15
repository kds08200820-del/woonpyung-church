# 운평장로교회 — 홈페이지 AI 워커 자동시작 등록/해제
#
#   .\ai-worker-autostart.ps1          로그인 시 자동 실행 등록
#   .\ai-worker-autostart.ps1 -Off     해제
#
# 교회 컴퓨터에 한 번만 등록해 두면, 윈도우가 재부팅돼도 로그인과 함께
# 말씀지기·기도문 AI 워커가 다시 켜집니다.
#
# 관리자 권한이 필요 없습니다. 시작프로그램 폴더에 바로가기만 만듭니다.
# 배치 파일에 한글을 넣으면 코드페이지 문제로 깨지므로 로직을 여기 둡니다.

param([switch]$Off)

$ErrorActionPreference = 'Stop'

$LinkName = '운평 홈페이지 AI 워커.lnk'
$Startup  = [Environment]::GetFolderPath('Startup')
$LinkPath = Join-Path $Startup $LinkName
$Target   = Join-Path $PSScriptRoot '목회AI워커.bat'

if ($Off) {
    if (Test-Path $LinkPath) {
        Remove-Item $LinkPath -Force
        Write-Host "  해제 완료 — 다음 로그인부터 자동 실행되지 않습니다." -ForegroundColor Green
    } else {
        Write-Host "  등록되어 있지 않습니다." -ForegroundColor Yellow
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
$sc.Description      = '운평장로교회 홈페이지 AI 워커 (말씀지기·기도문)'
$sc.Save()

Write-Host "  등록 완료" -ForegroundColor Green
Write-Host "    바로가기 : $LinkPath"
Write-Host "    실행 대상 : $Target"
Write-Host ""
Write-Host "  이제 윈도우에 로그인할 때마다 워커가 자동으로 켜집니다."
Write-Host "  지금 바로 켜려면 '목회AI워커.bat' 을 더블클릭하세요."

# 이 워커는 service_role 키 하나만 있으면 됩니다(R2 업로드 키는 필요 없음).
if (-not [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')) {
    Write-Host ""
    Write-Host "  [주의] SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다." -ForegroundColor Yellow
    Write-Host "         아래를 한 번 실행해 두어야 워커가 동작합니다."
    Write-Host '         setx SUPABASE_SERVICE_ROLE_KEY "복사한키"'
}

# claude CLI 가 로그인돼 있는지도 미리 확인 — 안 되어 있으면 모든 답변이 실패합니다.
$claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
if (-not (Test-Path $claude)) {
    $found = Get-Command claude -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Host ""
        Write-Host "  [주의] claude CLI 를 찾을 수 없습니다." -ForegroundColor Yellow
        Write-Host "         교회 PC 에 Claude Code 를 설치하고 한 번 로그인해 두세요."
    }
}

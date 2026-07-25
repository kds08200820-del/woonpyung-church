# 교회PC 원격화면(Chrome 원격 데스크톱) 호스트 설치 스크립트
# 교회 컴퓨터에서 PowerShell을 "관리자 권한"으로 열고 이 파일을 실행하세요:
#   powershell -ExecutionPolicy Bypass -File "이 파일 경로"
# 설치 후에는 크롬에서 승인(핀 설정) 단계가 남습니다 — 원격화면_설정안내.txt 3단계 참고.

$ErrorActionPreference = "Stop"
Write-Host "=== Chrome 원격 데스크톱 호스트 설치 ===" -ForegroundColor Cyan

# 이미 설치되어 있으면 종료
$installed = Test-Path "C:\Program Files (x86)\Google\Chrome Remote Desktop"
if ($installed) {
    Write-Host "이미 설치되어 있습니다. 크롬에서 remotedesktop.google.com/access 를 열어 '원격 액세스 설정'만 진행하세요." -ForegroundColor Green
    exit 0
}

# 구글 공식 배포 MSI 다운로드
$msi = "$env:TEMP\chromeremotedesktophost.msi"
Write-Host "1) 설치 파일 다운로드 중… (구글 공식 서버)"
Invoke-WebRequest -Uri "https://dl.google.com/dist/chrome-remote-desktop/chromeremotedesktophost.msi" -OutFile $msi

Write-Host "2) 설치 중…"
Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait

# 절전 방지: 원격 접속하려면 PC가 깨어 있어야 함 (모니터만 끄고 PC는 안 잠들게)
Write-Host "3) 절전 끄기(원격 접속 유지용)…"
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 30

Write-Host ""
Write-Host "=== 설치 완료! ===" -ForegroundColor Green
Write-Host "이제 크롬을 열고 kds08200820@gmail.com 으로 로그인한 뒤" -ForegroundColor Yellow
Write-Host "https://remotedesktop.google.com/access 에서 '원격 액세스 설정' → 이름/PIN을 정하면 끝." -ForegroundColor Yellow
Write-Host "(자세한 순서는 같은 폴더의 원격화면_설정안내.txt 3단계 참고)"

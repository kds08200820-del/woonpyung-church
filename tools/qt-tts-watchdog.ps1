# 운평장로교회 — QT 음성('오늘의 말씀 듣기') 워커 지킴이
#
# 홈페이지에서 '오늘의 말씀 듣기'를 누르면 tts_requests 에 요청이 쌓이고,
# 이 PC의 두 워커가 GPT-SoVITS 로 음성을 만들어 R2 에 올립니다.
#   · qt_request_worker.mjs  요청이 들어오면 즉시 생성 (20초마다 확인)
#   · qt_tts_loop.mjs        새 QT 가 올라오면 미리 생성 (15분마다 확인)
#
# 두 워커는 창 없이 도는 node 프로세스라, 누가 node 를 종료하면 조용히 멈춥니다.
# (실제로 2026-08-16 저녁에 멈춰 사흘간 집 PC 가 대신 만들고 있었습니다.)
# 그래서 이 지킴이를 10분마다 돌려, 꺼져 있으면 자동으로 다시 켭니다.
#
#   .\qt-tts-watchdog.ps1 -Install   교회 PC 에 설치 (자동시작 등록 + 지금 켜기)
#   .\qt-tts-watchdog.ps1 -Status    지금 도는지 확인
#   .\qt-tts-watchdog.ps1 -Off       이 PC 에서 QT 음성 작업 중단 (집 PC 에서 사용)
#   .\qt-tts-watchdog.ps1            (인수 없음) 꺼진 워커만 다시 켜기 — 작업 스케줄러가 호출

param([switch]$Install, [switch]$Status, [switch]$Off)

$ErrorActionPreference = 'Stop'

$DIR      = 'C:\qt-video\qt-tts-daily'
$TASK     = 'QT-TTS-Watchdog'
$LOG      = Join-Path $DIR 'watchdog.log'
$VBS      = Join-Path $DIR 'qt_tts_watchdog.vbs'
$PS1      = Join-Path $DIR 'qt-tts-watchdog.ps1'
$STARTUP  = [Environment]::GetFolderPath('Startup')
$OLDLINKS = @('운평QT요청워커.vbs', '운평QT음성.vbs')   # 예전 방식(로그인 때 한 번만 실행) — 지킴이로 대체
$LOGONVBS = '운평QT음성지킴이.vbs'                       # 로그인하자마자 한 번 점검 (시작프로그램)

$WORKERS = @(
    @{ Label = '요청 워커(누르면 즉시 생성)'; Script = 'qt_request_worker.mjs'; Log = 'request.log' },
    @{ Label = '상시 루프(새 QT 미리 생성)'; Script = 'qt_tts_loop.mjs';     Log = 'daily.log'   }
)

function Write-Log([string]$msg) {
    try { "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg | Out-File -FilePath $LOG -Append -Encoding utf8 } catch { }
}

# node 프로세스 중 이 스크립트를 돌리는 것만 찾는다 (다른 node 프로그램은 건드리지 않음)
function Get-WorkerProcess([string]$script) {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$script*" }
}

function Start-WorkerIfDown($w) {
    $p = @(Get-WorkerProcess $w.Script)
    if ($p.Count -gt 0) { return "  [정상] $($w.Label)  PID $($p[0].ProcessId)" }
    if (-not (Test-Path (Join-Path $DIR $w.Script))) { return "  [없음] $($w.Label) — $DIR 에 $($w.Script) 가 없습니다" }
    $sh = New-Object -ComObject WScript.Shell
    $sh.Run("cmd /c cd /d $DIR && node $($w.Script) >> $($w.Log) 2>&1", 0, $false) | Out-Null
    Write-Log "다시 켬: $($w.Script)"
    return "  [다시 켬] $($w.Label)"
}

function Stop-Workers {
    $killed = 0
    foreach ($s in @('qt_request_worker.mjs', 'qt_tts_loop.mjs', 'qt_tts_daily.mjs')) {
        foreach ($p in @(Get-WorkerProcess $s)) {
            try { Stop-Process -Id $p.ProcessId -Force; $killed++ } catch { }
        }
    }
    return $killed
}

# ── 설치 (교회 PC) ────────────────────────────────────────────────
if ($Install) {
    if (-not (Test-Path (Join-Path $DIR 'qt_request_worker.mjs'))) {
        Write-Host "  [실패] 이 PC 에는 QT 음성 폴더가 없습니다: $DIR" -ForegroundColor Red
        Write-Host "         GPT-SoVITS 와 qt-tts-daily 가 설치된 PC(교회 당회실 PC)에서 실행하세요."
        exit 1
    }

    # 1) 지킴이 스크립트를 로컬(C:\qt-video)로 복사 — OneDrive 폴더에서 직접 돌리면 동기화 중 실패할 수 있음
    if ((Resolve-Path $PSCommandPath).Path -ne $PS1) { Copy-Item $PSCommandPath $PS1 -Force }

    # 2) 창 없이 지킴이를 부르는 vbs (작업 스케줄러가 10분마다 이걸 실행)
    #    ⚠ vbs 는 BOM 이 붙으면 "유효하지 않은 문자입니다" 로 실행이 막힌다.
    #      그래서 한글을 넣지 않고(ASCII), BOM 없이 저장한다. (Set-Content -Encoding UTF8 은 BOM 을 붙임)
    $vbsBody = @"
' Woonpyung QT TTS worker keeper - starts the workers hidden if they are down.
' Called by Task Scheduler (every 10 min) and by the Startup folder (at logon).
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""$PS1""", 0, False
"@
    [System.IO.File]::WriteAllText($VBS, $vbsBody, [System.Text.Encoding]::ASCII)

    # 3) 예전 시작프로그램(로그인 때 한 번만 실행)은 지킴이와 겹치므로 치워 둔다
    $bak = Join-Path $DIR '_old_startup'
    foreach ($n in $OLDLINKS) {
        $src = Join-Path $STARTUP $n
        if (Test-Path $src) {
            if (-not (Test-Path $bak)) { New-Item -ItemType Directory -Path $bak | Out-Null }
            Move-Item $src (Join-Path $bak $n) -Force
            Write-Host "  예전 시작프로그램 치움: $n  →  $bak"
        }
    }

    # 4) 자동 확인 등록 — 10분마다 + 로그인할 때
    #    Register-ScheduledTask 는 이 PC 에서 관리자 권한을 요구해 실패한다(Access is denied).
    #    schtasks 는 관리자 권한 없이도 등록되므로 이쪽을 쓴다.
    $tr = "wscript.exe $VBS"            # 경로에 공백이 없어 따옴표가 필요 없다
    $regOk = $true
    & schtasks /create /tn $TASK /tr $tr /sc minute /mo 10 /f | Out-Null
    if ($LASTEXITCODE -ne 0) { $regOk = $false }
    # 로그인 직후에도 바로 점검하도록 시작프로그램에 지킴이를 둔다.
    # (작업 스케줄러의 '로그인할 때' 유형은 관리자 권한을 요구해 여기서는 쓰지 않는다)
    Copy-Item $VBS (Join-Path $STARTUP $LOGONVBS) -Force
    if ($regOk) {
        Write-Host "  자동 확인 등록 완료 — 10분마다, 그리고 로그인할 때마다 점검합니다." -ForegroundColor Green
    } else {
        Write-Host "  [주의] 자동 확인 등록에 실패했습니다. 워커는 지금 켜지지만," -ForegroundColor Yellow
        Write-Host "         꺼졌을 때 자동으로 되살아나지 않습니다. 이 창을 목사님께 보여 주세요." -ForegroundColor Yellow
    }

    # 5) 지금 바로 켜기
    Write-Host ""
    foreach ($w in $WORKERS) { Write-Host (Start-WorkerIfDown $w) }
    Write-Log "설치 완료 ($env:COMPUTERNAME)"
    Write-Host ""
    Write-Host "  이제 이 PC 가 '오늘의 말씀 듣기' 음성을 만듭니다." -ForegroundColor Green
    Write-Host "  집 PC 에서는 'QT음성워커_끄기.bat' 을 한 번 더블클릭해 주세요."
    return
}

# ── 상태 확인 ─────────────────────────────────────────────────────
if ($Status) {
    Write-Host "  PC 이름 : $env:COMPUTERNAME"
    foreach ($w in $WORKERS) {
        $p = @(Get-WorkerProcess $w.Script)
        if ($p.Count -gt 0) { Write-Host "  [정상] $($w.Label)  PID $($p[0].ProcessId)" -ForegroundColor Green }
        else                { Write-Host "  [꺼짐] $($w.Label)" -ForegroundColor Yellow }
    }
    $t = Get-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue
    if ($t) { Write-Host "  [정상] 지킴이 등록됨 (10분마다 확인)" -ForegroundColor Green }
    else    { Write-Host "  [없음] 지킴이가 등록돼 있지 않습니다 — QT음성워커_설치.bat 을 실행하세요" -ForegroundColor Yellow }
    $sovits = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -and $_.CommandLine -like '*api_v2.py*' })
    if ($sovits.Count -gt 0) { Write-Host "  [정상] GPT-SoVITS 음성 엔진 실행 중" -ForegroundColor Green }
    else                     { Write-Host "  [꺼짐] GPT-SoVITS 음성 엔진 — 켜야 음성이 만들어집니다" -ForegroundColor Yellow }
    return
}

# ── 중단 (집 PC) ──────────────────────────────────────────────────
if ($Off) {
    $n = Stop-Workers
    Write-Host "  실행 중이던 QT 음성 워커 $n 개를 종료했습니다."
    foreach ($t in @($TASK)) {
        if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
            & schtasks /delete /tn $t /f | Out-Null
            Write-Host "  자동 확인($t)을 해제했습니다."
        }
    }
    foreach ($n2 in ($OLDLINKS + $LOGONVBS)) {
        $src = Join-Path $STARTUP $n2
        if (Test-Path $src) {
            $bak = Join-Path $env:LOCALAPPDATA 'qt-tts-off'
            if (-not (Test-Path $bak)) { New-Item -ItemType Directory -Path $bak | Out-Null }
            Move-Item $src (Join-Path $bak $n2) -Force
            Write-Host "  시작프로그램에서 뺐습니다: $n2  (되돌릴 파일: $bak)"
        }
    }
    Write-Log "중단 ($env:COMPUTERNAME)"
    Write-Host ""
    Write-Host "  이 PC 는 더 이상 QT 음성을 만들지 않습니다. (교회 PC 가 만듭니다)" -ForegroundColor Green
    return
}

# ── 기본: 꺼진 워커만 다시 켜기 (작업 스케줄러가 10분마다 호출) ──
# 로그인 직후엔 '10분마다' 와 '로그인할 때' 가 겹쳐 두 번 불릴 수 있다.
# 그때 워커가 두 개씩 뜨지 않도록 한 번에 하나만 점검하게 잠근다.
$mutex = New-Object System.Threading.Mutex($false, 'Local\QT-TTS-Watchdog')
if (-not $mutex.WaitOne(5000)) { return }
try   { foreach ($w in $WORKERS) { Write-Host (Start-WorkerIfDown $w) } }
finally { $mutex.ReleaseMutex() }

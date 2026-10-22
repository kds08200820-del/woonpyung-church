# 운평장로교회 — 카카오톡 예약 발송 워커 감시
#
# 작업 스케줄러 '운평 카카오 예약 워커 감시'가 15분마다(그리고 로그인 때) 이 파일을 실행한다.
# 워커(kakao_worker.py --watch)가 꺼져 있으면 '카카오예약워커.bat' 로 다시 켠다.
#
# 왜 필요한가: 시작프로그램 바로가기는 로그인할 때 한 번만 켠다. 그 뒤 워커 창이
# 닫히거나(사람 손, 원격 세션 종료 등) 프로세스가 죽으면 다음 재부팅까지 아무도 켜지
# 않아 예약이 pending 으로 남는다(2026-09-24 새벽 QT 미발송).
#
# 발송은 하지 않는다 — 워커만 켠다. 워커는 한 개만 돌도록 스스로 막는다(뮤텍스).
# 너무 늦은 예약(기본 6시간 초과)은 워커가 보내지 않고 오류로 남긴다.
#
# 2026-10-14 목사님 요청: 워커는 오전 6~7시에만 돈다 ("그 외 시간에는 필요 없습니다").
#   6시대(06:00~06:59)에는 꺼져 있으면 켜고, 그 밖의 시각에는 켜져 있으면 끈다(워커와 그 창까지).
#   이 감시 작업이 15분마다 돌므로 06:00 에 켜지고 07:00 에 꺼진다. 시간을 바꾸려면 아래 두 값만 고친다.
$StartHour = 6      # 이 시각부터
$EndHour   = 7      # 이 시각 전까지

$ErrorActionPreference = 'Stop'

$Bat = Join-Path $PSScriptRoot '카카오예약워커.bat'
$Log = Join-Path $PSScriptRoot 'logs\kakao_qt.log'

function Write-Log($msg) {
    $line = "[{0:yyyy-MM-dd HH:mm:ss}] [감시] {1}`n" -f (Get-Date), $msg
    try { [IO.File]::AppendAllText($Log, $line, (New-Object Text.UTF8Encoding $false)) } catch {}
}

$running = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -match 'kakao_worker\.py' -and $_.CommandLine -match '--watch' })
$hour = (Get-Date).Hour
$inWindow = ($hour -ge $StartHour -and $hour -lt $EndHour)

if (-not $inWindow) {
    if ($running.Count) {
        # 워커와 그 창(카카오예약워커.bat 를 돌리는 cmd)까지 끈다 — python 만 끄면 bat 의 'pause' 창이 남는다
        $all = Get-CimInstance Win32_Process
        $ids = New-Object System.Collections.Generic.HashSet[int]
        foreach ($r in $running) {
            [void]$ids.Add([int]$r.ProcessId)
            $parent = $all | Where-Object { $_.ProcessId -eq $r.ParentProcessId }
            while ($parent -and ($parent.Name -in @('python.exe', 'cmd.exe'))) {
                if ($parent.Name -eq 'cmd.exe' -and $parent.CommandLine -notmatch '카카오예약워커') { break }
                [void]$ids.Add([int]$parent.ProcessId)
                $pp = $parent.ParentProcessId
                $parent = $all | Where-Object { $_.ProcessId -eq $pp }
            }
        }
        foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
        Write-Log ("워커는 {0}~{1}시에만 돕니다 — 지금 {2}시라 껐습니다." -f $StartHour, $EndHour, $hour)
    }
    return
}
if ($running.Count) { return }

if (-not (Test-Path $Bat)) {
    Write-Log "워커 실행 파일이 없습니다: $Bat"
    exit 1
}

# explorer 를 부모로 띄워 이 감시 작업이 끝나도 워커 창은 남게 한다.
Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$Bat`""
Write-Log "워커가 꺼져 있어 다시 켰습니다."

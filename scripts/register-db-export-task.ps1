# 운평장로교회 — DB 주간 내려받기(scripts/db-export.mjs)를 작업 스케줄러에 등록한다 (2026-11-25)
#   이 PC 에서 한 번만 실행:  powershell -ExecutionPolicy Bypass -File scripts\register-db-export-task.ps1
#   매주 주일 새벽 3시에 돈다(PC 가 꺼져 있었으면 켜진 뒤 한 번). 로그인한 사용자 권한으로 돌아
#   사용자 환경변수 SUPABASE_SERVICE_ROLE_KEY 를 그대로 쓴다.
#   지우기:  Unregister-ScheduledTask -TaskName "WoonpyungDbExport" -Confirm:$false
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $repo "scripts\db-export.mjs"
$logDir = if ($env:WP_BACKUP_DIR) { $env:WP_BACKUP_DIR } else { "C:\woonpyung-backups" }
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "db-export.log"
$arg = "/c `"`"$node`" `"$script`" >> `"$log`" 2>&1`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $arg -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "WoonpyungDbExport" -Action $action -Trigger $trigger -Settings $settings -Description "운평장로교회 DB 주간 내려받기 (scripts/db-export.mjs)" -Force | Out-Null
Write-Host "등록했습니다: 매주 주일 03:00 — 기록 $log"
Write-Host "지금 한 번 돌려 보려면: Start-ScheduledTask -TaskName WoonpyungDbExport"

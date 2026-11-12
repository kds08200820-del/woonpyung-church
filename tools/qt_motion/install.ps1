# 매일 QT 모션 영상 — 영상 도구를 C:\qt-video\motion 에 받는다 (한 번만).
#   github.com/kstost/script-to-motion (MIT) 의 정해 둔 판을 받아, Windows 에서 돌도록 두 줄을 고친다.
$ErrorActionPreference = 'Stop'
$home2 = 'C:\qt-video\motion'
$skill = Join-Path $home2 'script-to-motion'
$commit = 'b791213792c13de1dbbbf180deffc2e8adf0d0c9'   # 2026-11-10, 시험해 본 판
New-Item -ItemType Directory -Force $home2, (Join-Path $home2 'work'), (Join-Path $home2 'out') | Out-Null

if (-not (Test-Path (Join-Path $skill '.git'))) {
  git clone https://github.com/kstost/script-to-motion $skill
}
git -C $skill fetch --quiet origin
git -C $skill checkout --quiet --force $commit

# 고침 1: Windows 에서 절대 경로를 import 하면 실패한다 → file:// 주소로
$f = Join-Path $skill 'scripts\setup_browser.mjs'
$t = [IO.File]::ReadAllText($f)
$old = "await import(path.join(here, 'node_modules', 'playwright-core', 'index.mjs'))"
$new = "await import((await import('node:url')).pathToFileURL(path.join(here, 'node_modules', 'playwright-core', 'index.mjs')).href)"
if ($t.Contains($old)) { [IO.File]::WriteAllText($f, $t.Replace($old, $new)) }

# 고침 2: 음성 주소를 바꿀 수 있게(교회 QT 목소리로 돌리는 연결 — sovits_bridge.mjs)
$f = Join-Path $skill 'scripts\tts.mjs'
$t = [IO.File]::ReadAllText($f)
$old = "const API = 'https://api.fish.audio/v1/tts';"
$new = "const API = process.env.FISH_API_URL || 'https://api.fish.audio/v1/tts';"
if ($t.Contains($old)) { [IO.File]::WriteAllText($f, $t.Replace($old, $new)) }

Push-Location (Join-Path $skill 'scripts')
npm install --ignore-scripts --no-audit --no-fund
node setup_browser.mjs
Pop-Location
python -m pip install --quiet pillow

Write-Host ''
Write-Host '영상 도구 설치를 마쳤습니다. 이어서 점검.bat 을 눌러 주세요.'

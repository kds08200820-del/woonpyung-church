# js/vendor/prosemirror.min.js 다시 만들기 (설교 매니저 편집기 엔진)
#
#   powershell -ExecutionPolicy Bypass -File tools\build-prosemirror.ps1
#
# 임시 폴더에 고정 버전의 ProseMirror 패키지를 설치하고 esbuild 로 한 파일(IIFE, 전역 PM)로 묶는다.
# 홈페이지는 빌드 도구가 없으므로 묶인 결과물만 저장소에 넣는다. 버전을 올릴 때는 아래 목록만 고친다.
$ErrorActionPreference = 'Stop'
$pkgs = @(
  'prosemirror-model@1.25.1', 'prosemirror-state@1.4.3', 'prosemirror-view@1.40.0', 'prosemirror-transform@1.10.4',
  'prosemirror-commands@1.7.1', 'prosemirror-history@1.4.1', 'prosemirror-keymap@1.2.3', 'prosemirror-inputrules@1.5.0',
  'prosemirror-schema-list@1.5.1', 'prosemirror-tables@1.7.1', 'prosemirror-gapcursor@1.3.2', 'prosemirror-dropcursor@1.8.2',
  'prosemirror-search@1.1.0', 'esbuild@0.25.5'
)
$root = Split-Path -Parent $PSScriptRoot
$work = Join-Path $env:TEMP 'wp-pm-build'
New-Item -ItemType Directory -Force $work | Out-Null
Set-Location $work
'{ "name": "wp-pm-build", "private": true }' | Out-File -Encoding utf8 package.json
npm install --no-audit --no-fund --loglevel=error @pkgs
@'
import * as model from 'prosemirror-model';
import * as state from 'prosemirror-state';
import * as view from 'prosemirror-view';
import * as transform from 'prosemirror-transform';
import * as commands from 'prosemirror-commands';
import * as history from 'prosemirror-history';
import * as keymap from 'prosemirror-keymap';
import * as inputrules from 'prosemirror-inputrules';
import * as schemaList from 'prosemirror-schema-list';
import * as tables from 'prosemirror-tables';
import * as gapcursor from 'prosemirror-gapcursor';
import * as dropcursor from 'prosemirror-dropcursor';
import * as search from 'prosemirror-search';
export { model, state, view, transform, commands, history, keymap, inputrules, schemaList, tables, gapcursor, dropcursor, search };
'@ | Out-File -Encoding utf8 entry.js
function V($p) { node -p "require('./node_modules/$p/package.json').version" }
$banner = "/*! ProseMirror bundle for 운평장로교회 설교 매니저 — MIT (Marijn Haverbeke et al.). model $(V prosemirror-model) · state $(V prosemirror-state) · view $(V prosemirror-view) · transform $(V prosemirror-transform) · commands $(V prosemirror-commands) · history $(V prosemirror-history) · keymap $(V prosemirror-keymap) · inputrules $(V prosemirror-inputrules) · schema-list $(V prosemirror-schema-list) · tables $(V prosemirror-tables) · gapcursor $(V prosemirror-gapcursor) · dropcursor $(V prosemirror-dropcursor) · search $(V prosemirror-search). 재빌드: tools/build-prosemirror.ps1 */"
$out = Join-Path $root 'js\vendor\prosemirror.min.js'
npx esbuild entry.js --bundle --minify --format=iife --global-name=PM --target=es2017 --legal-comments=none "--banner:js=$banner" "--outfile=$out"
Write-Host "완료: $out"

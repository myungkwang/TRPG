$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root 'frontend_src'
$static = Join-Path $root 'static'

if (-not (Test-Path (Join-Path $frontend 'package.json'))) {
  throw "frontend_src/package.json not found under $root"
}

Push-Location $frontend
try {
  & npm.cmd run build
}
finally {
  Pop-Location
}

# frontend_src/vite.config 의 outDir 이 '../static' 이라, vite 가 index.html 과 assets 를
# static/ 에 직접 빌드한다. 과거엔 여기서 frontend_src/dist 를 static 으로 복사했지만,
# outDir 변경 후 dist 는 stale 가 되어 방금 빌드한 static/index.html 을 옛 해시로 덮어쓰는
# 버그를 일으켰다. 그래서 복사 단계를 제거한다. (vite 가 직접 배포하므로 복사 불필요)
if (-not (Test-Path (Join-Path $static 'index.html'))) {
  throw "build did not produce static/index.html — check frontend_src/vite.config outDir (should be '../static')"
}

Write-Host "Frontend built and deployed to $static"
Select-String -Path (Join-Path $static 'index.html') -Pattern 'assets/index-.*(js|css)'

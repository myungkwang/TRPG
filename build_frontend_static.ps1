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

New-Item -ItemType Directory -Force -Path (Join-Path $static 'assets') | Out-Null
Copy-Item -LiteralPath (Join-Path $frontend 'dist\index.html') -Destination (Join-Path $static 'index.html') -Force
Copy-Item -Path (Join-Path $frontend 'dist\assets\*') -Destination (Join-Path $static 'assets') -Force

Write-Host "Frontend built and deployed to $static"
Select-String -Path (Join-Path $static 'index.html') -Pattern 'assets/index-.*(js|css)'

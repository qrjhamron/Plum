# Siapkan bundle engine untuk build Windows Tauri.
# Hasil: src-tauri/resources/engine/node.exe + app/ (server.js, lib, package.json)
# Jalankan dari root proyek di Windows PowerShell sebelum: npm run desktop:build
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$engine = Join-Path $root 'src-tauri\resources\engine'
$appDir = Join-Path $engine 'app'
$nodeVersion = 'v22.14.0'
$zip = Join-Path $env:TEMP "node-$nodeVersion-win-x64.zip"

if (-not (Test-Path (Join-Path $engine 'node.exe'))) {
  Write-Host "Mengunduh Node $nodeVersion (win-x64)..."
  Invoke-WebRequest "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile $zip
  $tmp = Join-Path $env:TEMP "node-$nodeVersion-extract"
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip -DestinationPath $tmp
  Copy-Item (Join-Path $tmp "node-$nodeVersion-win-x64\node.exe") (Join-Path $engine 'node.exe')
}

New-Item -ItemType Directory -Force $appDir | Out-Null
Copy-Item (Join-Path $root 'server.js') $appDir -Force
Copy-Item (Join-Path $root 'package.json') $appDir -Force
if (Test-Path (Join-Path $appDir 'lib')) { Remove-Item (Join-Path $appDir 'lib') -Recurse -Force }
Copy-Item (Join-Path $root 'lib') $appDir -Recurse -Force

# PlumClient JAR (bila sudah dibangun) agar launcher paket bisa memasang mod tanpa Gradle.
$jar = Join-Path $root 'client-mod\build\libs\plumclient-1.0.0.jar'
if (Test-Path $jar) {
  $dest = Join-Path $appDir 'client-mod\build\libs'
  New-Item -ItemType Directory -Force $dest | Out-Null
  Copy-Item $jar $dest -Force
  Write-Host 'PlumClient JAR ikut dibundel.'
} else {
  Write-Warning 'PlumClient JAR belum ada: build dulu di client-mod (gradle build), lalu jalankan ulang skrip ini bila ingin JAR dibundel.'
}
Write-Host 'Engine siap di src-tauri/resources/engine'

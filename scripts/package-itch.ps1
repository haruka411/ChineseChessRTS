$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$zip = Join-Path $root "chinese-chess-rts-itch.zip"

if (-not (Test-Path $dist)) {
  throw "dist directory not found. Run npm run build first."
}

if (Test-Path $zip) {
  Remove-Item -LiteralPath $zip -Force
}

Compress-Archive -Path (Join-Path $dist "*") -DestinationPath $zip -Force
Write-Output "Created $zip"

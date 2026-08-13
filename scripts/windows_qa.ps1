$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

node --version
npm --version
rustc --version --verbose
cargo --version --verbose
npm ci
npm run check
npm run tauri:build

$Bundles = Get-ChildItem -Path "apps/desktop/src-tauri/target/release/bundle" -Recurse -File |
  Where-Object { $_.Extension -in ".msi", ".exe" }
if (-not $Bundles) {
  throw "No Windows installer bundle was produced."
}

$Bundles | ForEach-Object {
  $Hash = Get-FileHash -Algorithm SHA256 $_.FullName
  [PSCustomObject]@{ Path = $_.FullName; SHA256 = $Hash.Hash }
} | Format-Table -AutoSize

Write-Host "Installer production PASS. Manual keyboard, screen-reader, reduced-motion, cancellation and clean-install checks remain required."

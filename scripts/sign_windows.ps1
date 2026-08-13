param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$CertificateThumbprint,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)
$ErrorActionPreference = "Stop"
if (-not $env:DCA_SIGNING_APPROVED) { throw "DCA_SIGNING_APPROVED is required after exact release approval." }
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) { throw "Installer does not exist." }
$Resolved = (Resolve-Path -LiteralPath $Installer).Path
if ([IO.Path]::GetExtension($Resolved) -notin ".msi", ".exe") { throw "Only MSI or EXE installers may be signed." }
$Signtool = Get-Command signtool.exe -ErrorAction Stop
& $Signtool.Source sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $Resolved
if ($LASTEXITCODE -ne 0) { throw "signtool failed." }
& $Signtool.Source verify /pa /all $Resolved
if ($LASTEXITCODE -ne 0) { throw "signature verification failed." }
Get-FileHash -Algorithm SHA256 -LiteralPath $Resolved

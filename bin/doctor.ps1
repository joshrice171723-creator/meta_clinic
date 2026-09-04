[CmdletBinding()]
param()

# Compatibility shim. The canonical lifecycle is ruby bin/dev status.
$root = Split-Path -Parent $PSScriptRoot
Write-Warning "bin/doctor.ps1 is deprecated; use ruby bin/dev status."
& ruby (Join-Path $root "bin\dev") status
exit $LASTEXITCODE

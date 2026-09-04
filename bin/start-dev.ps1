[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$NoDockerStart,
  [switch]$Seed,
  [switch]$RefreshSeed
)

# Compatibility shim. The canonical lifecycle is ruby bin/dev.
$root = Split-Path -Parent $PSScriptRoot
$canonical = Join-Path $root "bin\dev"
Write-Warning "bin/start-dev.ps1 is deprecated; use ruby bin/dev start."

if ($Seed -or $RefreshSeed) {
  & ruby $canonical reset-data --yes
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$arguments = @($canonical, "start")
if ($NoBrowser) { $arguments += "--no-browser" }
if ($NoDockerStart) { $arguments += "--no-docker-start" }
& ruby @arguments
exit $LASTEXITCODE

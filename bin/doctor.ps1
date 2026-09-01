[CmdletBinding()]
param()
$root = Split-Path -Parent $PSScriptRoot
$container = if ($env:APPLY_POSTGRES_CONTAINER) { $env:APPLY_POSTGRES_CONTAINER } else { "apply-postgres-development" }
function Check([string]$Name, [bool]$Ok, [string]$Detail) { $mark = if ($Ok) { "OK" } else { "FAIL" }; $color = if ($Ok) { "Green" } else { "Red" }; Write-Host ("[{0}] {1}: {2}" -f $mark, $Name, $Detail) -ForegroundColor $color }
$node = Get-Command node -ErrorAction SilentlyContinue; Check "Node" ([bool]$node) ($(if ($node) { node --version } else { "not found" }))
$npm = Get-Command npm -ErrorAction SilentlyContinue; Check "npm" ([bool]$npm) ($(if ($npm) { npm --version } else { "not found" }))
$ruby = Get-Command ruby -ErrorAction SilentlyContinue; Check "Ruby" ([bool]$ruby) ($(if ($ruby) { ruby --version } else { "not found" }))
$bundle = Get-Command bundle -ErrorAction SilentlyContinue; Check "Bundler" ([bool]$bundle) ($(if ($bundle) { bundle --version } else { "not found" }))
$dockerOk = $false; try { docker info *> $null; $dockerOk = ($LASTEXITCODE -eq 0) } catch {}
Check "Docker engine" $dockerOk ($(if ($dockerOk) { docker info --format '{{.ServerVersion}}' } else { "Docker Desktop is not running" }))
$containerRunning = $false
if ($dockerOk) { try { $containerRunning = ((docker inspect --format '{{.State.Running}}' $container 2>$null) -eq "true") } catch {} }
Check "PostgreSQL container" $containerRunning ($(if ($containerRunning) { $container } else { "not running" }))
$pgOk = $false; if ($containerRunning) { docker exec $container pg_isready -U postgres -d postgres *> $null; $pgOk = ($LASTEXITCODE -eq 0) }
Check "PostgreSQL readiness" $pgOk ($(if ($pgOk) { "accepting connections" } else { "not ready" }))
foreach ($port in 3000, 3001) { $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue; Check "Port $port" ([bool]$listener) ($(if ($listener) { "in use by PID $($listener[0].OwningProcess)" } else { "available" })) }
$webOk = $false; try { $webOk = ((Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/login -TimeoutSec 3).StatusCode -eq 200) } catch {}
$apiOk = $false; try { $apiOk = ((Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/up -TimeoutSec 3).StatusCode -eq 200) } catch {}
Check "Frontend" $webOk "http://127.0.0.1:3000/login"
Check "API" $apiOk "http://127.0.0.1:3001/up"
Write-Host "`nRecommended command: .\bin\start-dev.ps1"
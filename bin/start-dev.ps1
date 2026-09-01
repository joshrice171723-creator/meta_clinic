[CmdletBinding()]
param(
  [switch]$NoDockerStart,
  [switch]$Seed,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $root "apps\api"
$webRoot = Join-Path $root "apps\web"
$runtimeRoot = Join-Path $root "tmp\dev"
$logRoot = Join-Path $runtimeRoot "logs"
$pidRoot = Join-Path $runtimeRoot "pids"
$postgresContainer = if ($env:APPLY_POSTGRES_CONTAINER) { $env:APPLY_POSTGRES_CONTAINER } else { "apply-postgres-development" }

function Fail([string]$Message) { Write-Error $Message; exit 1 }
function Test-Port([int]$Port) { return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) }
function Test-ManagedProcess([string]$PidPath) {
  if (-not (Test-Path $PidPath)) { return $false }
  $processId = 0
  if (-not [int]::TryParse((Get-Content $PidPath -Raw).Trim(), [ref]$processId)) { return $false }
  return [bool](Get-Process -Id $processId -ErrorAction SilentlyContinue)
}
function Require-ManagedOrAvailablePort([int]$Port, [string]$PidPath) {
  if ((Test-Port $Port) -and -not (Test-ManagedProcess $PidPath)) {
    Fail "Port $Port is already in use by a process not managed by this APPly checkout. Stop or relocate that process, then retry."
  }
}
function Wait-Http([string]$Url, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try { $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3; if ($response.StatusCode -eq 200) { return $true } } catch { Start-Sleep -Milliseconds 500 }
  } while ((Get-Date) -lt $deadline)
  return $false
}
function Find-DockerDesktop {
  @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe", "$env:LOCALAPPDATA\Docker\Docker Desktop.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}

New-Item -ItemType Directory -Force -Path $logRoot, $pidRoot | Out-Null
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker CLI was not found on PATH. Install Docker Desktop, then reopen PowerShell." }

$dockerReady = $false
try { docker info *> $null; $dockerReady = ($LASTEXITCODE -eq 0) } catch { $dockerReady = $false }
if (-not $dockerReady -and -not $NoDockerStart) {
  $desktop = Find-DockerDesktop
  if ($desktop) { Write-Host "Starting Docker Desktop..."; Start-Process -FilePath $desktop | Out-Null }
  else { Fail "Docker Desktop is not running and its executable was not found. Start Docker Desktop, then retry." }
}
if (-not $dockerReady -and $NoDockerStart) { Fail "Docker Desktop is not running. Start Docker Desktop or omit -NoDockerStart to let this script launch it." }
if (-not $dockerReady) {
  Write-Host "Waiting for Docker Desktop Linux engine..."
  $deadline = (Get-Date).AddSeconds(90)
  do { Start-Sleep -Seconds 2; try { docker info *> $null; $dockerReady = ($LASTEXITCODE -eq 0) } catch { $dockerReady = $false } } while (-not $dockerReady -and (Get-Date) -lt $deadline)
}
if (-not $dockerReady) { Fail "Docker Desktop did not become ready within 90 seconds." }

Require-ManagedOrAvailablePort 3001 (Join-Path $pidRoot "api.pid")
Require-ManagedOrAvailablePort 3000 (Join-Path $pidRoot "web.pid")

$containerExists = $false
try { docker container inspect $postgresContainer *> $null; $containerExists = ($LASTEXITCODE -eq 0) } catch { $containerExists = $false }
if (-not $containerExists) {
  Push-Location $apiRoot
  try { ruby bin/postgres start } finally { Pop-Location }
} elseif ((docker inspect --format '{{.State.Running}}' $postgresContainer 2>$null) -ne "true") {
  Write-Host "Starting the existing local PostgreSQL container..."
  docker start $postgresContainer | Out-Null
}

Write-Host "Waiting for PostgreSQL..."
$deadline = (Get-Date).AddSeconds(45)
$databaseReady = $false
do { try { docker exec $postgresContainer pg_isready -U postgres -d postgres *> $null; $databaseReady = ($LASTEXITCODE -eq 0) } catch { $databaseReady = $false }; if (-not $databaseReady) { Start-Sleep -Seconds 1 } } while (-not $databaseReady -and (Get-Date) -lt $deadline)
if (-not $databaseReady) { Fail "PostgreSQL did not become ready. Check: docker logs $postgresContainer" }

Write-Host "Preparing the development database..."
Push-Location $apiRoot
try { ruby bin/postgres exec bundle exec rails db:prepare; if ($Seed) { ruby bin/postgres exec bundle exec rails db:seed } } finally { Pop-Location }

if (-not (Test-Port 3001)) {
  Write-Host "Starting Rails API on 127.0.0.1:3001..."
  $env:APP_DEVELOPMENT_LOGIN = "1"
  $api = Start-Process -FilePath "ruby" -ArgumentList @("bin/postgres", "exec", "bundle", "exec", "rails", "server", "-b", "127.0.0.1", "-p", "3001") -WorkingDirectory $apiRoot -RedirectStandardOutput (Join-Path $logRoot "api.out.log") -RedirectStandardError (Join-Path $logRoot "api.err.log") -PassThru
  Set-Content -Path (Join-Path $pidRoot "api.pid") -Value $api.Id
}
if (-not (Test-Port 3000)) {
  Write-Host "Starting Vite frontend on 127.0.0.1:3000..."
  $web = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") -WorkingDirectory $webRoot -RedirectStandardOutput (Join-Path $logRoot "web.out.log") -RedirectStandardError (Join-Path $logRoot "web.err.log") -PassThru
  Set-Content -Path (Join-Path $pidRoot "web.pid") -Value $web.Id
}

if (-not (Wait-Http "http://127.0.0.1:3001/up" 45)) { Write-Host "API failed readiness. See $logRoot\api.err.log" -ForegroundColor Yellow; exit 1 }
if (-not (Wait-Http "http://127.0.0.1:3000/login" 60)) { Write-Host "Frontend failed readiness. See $logRoot\web.err.log" -ForegroundColor Yellow; exit 1 }
Write-Host "APPly is ready: http://127.0.0.1:3000/login" -ForegroundColor Green
Write-Host "API health: http://127.0.0.1:3001/up"
Write-Host "Logs: $logRoot"
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:3000/login" }

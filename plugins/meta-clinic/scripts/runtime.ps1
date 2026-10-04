param([ValidateSet('start','stop','status','seed','prewarm')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$env:APPLY_POSTGRES_CONTAINER = 'apply-codex-plugin'
$env:PGPORT = '54408'
$env:APPLY_DEVELOPMENT_DATABASE = 'apply_codex_plugin_development'
$env:APPLY_WEB_PORT = '3310'
$env:APPLY_API_PORT = '3311'
$env:RAILS_ENV = 'development'
Push-Location $repo
try {
  if ($Action -eq 'seed') {
    $env:APP_SYNTHETIC_SEEDS = '1'
    Push-Location 'apps/api'
    try { & ruby bin/postgres exec bin/rails db:seed; if ($LASTEXITCODE -ne 0) { throw 'Clinic fixture provisioning failed.' } }
    finally { Pop-Location }
  } else {
    & ruby bin/dev $Action --no-browser
    if ($LASTEXITCODE -ne 0) { throw "Clinic runtime $Action failed." }
  }
} finally { Pop-Location }

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
  if ($Action -eq 'stop') {
    $panelStatePath = Join-Path $env:LOCALAPPDATA 'MetaClinicCodex/connection-3320.json'
    if (Test-Path -LiteralPath $panelStatePath) {
      $panelState = Get-Content -Raw -LiteralPath $panelStatePath | ConvertFrom-Json
      $panelProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$panelState.pid)"
      if ($panelProcess) {
        $localBundle = Join-Path $repo 'plugins/meta-clinic/dist/server.mjs'
        $pluginCache = Join-Path $env:USERPROFILE '.codex/plugins/cache/meta-clinic-local/meta-clinic/'
        $command = $panelProcess.CommandLine.Replace('\', '/')
        $ownedBundle = $command.Contains($localBundle.Replace('\', '/')) -or $command.Contains($pluginCache.Replace('\', '/'))
        if (!$ownedBundle -or !$command.Contains('server.mjs') -or !$command.Contains('--daemon')) { throw 'Panel ownership could not be confirmed; no process was stopped.' }
        Stop-Process -Id ([int]$panelState.pid)
      }
      Remove-Item -LiteralPath $panelStatePath
    }
  }
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

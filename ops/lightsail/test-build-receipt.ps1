# Focused synthetic checks; never connects to or changes a host.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-receipt.ps1')
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
$testRoot = Join-Path $env:TEMP "meta-clinic-receipt-test-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
  $receiptPath = Join-Path $testRoot 'receipt.json'
  $revision = 'a' * 40
  $receipt = @{ schema = 1; revision = $revision; fingerprint = 'checked-source';
    api_id = 'sha256:api'; web_id = 'sha256:web'; built_at = [DateTimeOffset]::UtcNow.ToString('o') }
  $receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath
  Assert (Test-ReleaseBuildReceipt $receiptPath $revision 'checked-source' 'sha256:api' 'sha256:web') 'Unchanged retry should reuse.'
  Assert (-not (Test-ReleaseBuildReceipt $receiptPath ('b' * 40) 'checked-source' 'sha256:api' 'sha256:web')) 'Changed revision reused.'
  Assert (-not (Test-ReleaseBuildReceipt $receiptPath $revision 'changed-source' 'sha256:api' 'sha256:web')) 'Changed inputs reused.'
  Assert (-not (Test-ReleaseBuildReceipt $receiptPath $revision 'checked-source' 'sha256:replacement' 'sha256:web')) 'Retagged image reused.'
  Assert (-not (Test-ReleaseBuildReceipt $receiptPath $revision 'checked-source' '' 'sha256:web')) 'Missing image reused.'
  Assert (-not (Test-ReleaseBuildReceipt (Join-Path $testRoot 'missing.json') $revision 'checked-source' 'sha256:api' 'sha256:web')) 'Missing receipt reused.'
  $receipt.built_at = [DateTimeOffset]::UtcNow.AddDays(-2).ToString('o')
  $receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath
  Assert (-not (Test-ReleaseBuildReceipt $receiptPath $revision 'checked-source' 'sha256:api' 'sha256:web')) 'Expired receipt reused.'
  'invalid json' | Set-Content -LiteralPath $receiptPath
  Assert (-not (Test-ReleaseBuildReceipt $receiptPath $revision 'checked-source' 'sha256:api' 'sha256:web')) 'Invalid receipt reused.'

  function docker { $global:LASTEXITCODE = 0; '[{"Id":"sha256:api","Os":"linux","Architecture":"amd64","Config":{"Labels":{"org.opencontainers.image.revision":"wrong"}}}]' }
  Assert (-not (Get-ReleaseImageIdentity 'synthetic:api' $revision)) 'Wrong image label accepted.'
  New-Item -ItemType Directory -Path (Join-Path $testRoot 'apps/api'), (Join-Path $testRoot 'apps/web/node_modules/synthetic') -Force | Out-Null
  $sourcePath = Join-Path $testRoot 'apps/api/source.rb'
  'synthetic source' | Set-Content -LiteralPath $sourcePath
  function git { $global:LASTEXITCODE = 0; 'apps/api/source.rb' }
  $identity = Get-ReleaseBuildIdentity $testRoot $revision $true
  Assert ($identity -eq (Get-ReleaseBuildIdentity $testRoot $revision $true)) 'Unchanged input identity drifted.'
  Assert ($identity -ne (Get-ReleaseBuildIdentity $testRoot $revision $false)) 'Changed build mode did not invalidate.'
  'changed synthetic source' | Set-Content -LiteralPath $sourcePath
  Assert ($identity -ne (Get-ReleaseBuildIdentity $testRoot $revision $true)) 'Source edit did not invalidate.'
  $identity = Get-ReleaseBuildIdentity $testRoot $revision $true
  'VITE_SYNTHETIC=changed' | Set-Content -LiteralPath (Join-Path $testRoot 'apps/web/.env.local')
  Assert ($identity -ne (Get-ReleaseBuildIdentity $testRoot $revision $true)) 'Ignored Vite input did not invalidate.'
  $identity = Get-ReleaseBuildIdentity $testRoot $revision $true
  'changed installed dependency' | Set-Content -LiteralPath (Join-Path $testRoot 'apps/web/node_modules/synthetic/index.js')
  Assert ($identity -ne (Get-ReleaseBuildIdentity $testRoot $revision $true)) 'Installed dependency edit did not invalidate.'
  $identity = Get-ReleaseBuildIdentity $testRoot $revision $true
  $previousValue = [Environment]::GetEnvironmentVariable('VITE_CHURN_SYNTHETIC')
  try {
    $env:VITE_CHURN_SYNTHETIC = 'changed synthetic build configuration'
    Assert ($identity -ne (Get-ReleaseBuildIdentity $testRoot $revision $true)) 'Exported Vite configuration did not invalidate.'
  } finally { [Environment]::SetEnvironmentVariable('VITE_CHURN_SYNTHETIC', $previousValue) }
  function git {
    $global:LASTEXITCODE = 0
    switch ($args[0]) { 'branch' { 'main' }; 'rev-parse' { 'a' * 40 } }
  }
  function ssh { $global:LASTEXITCODE = 1 }
  function docker { throw 'Docker must not run after failed SSH preflight.' }
  $keyPath = Join-Path $testRoot 'synthetic-key'
  'not a real key' | Set-Content -LiteralPath $keyPath
  $blocked = $false
  try { & (Join-Path $PSScriptRoot 'release.ps1') -KeyPath $keyPath -RecoveryDirectory $testRoot -Server 'synthetic.invalid' }
  catch { $blocked = $_.Exception.Message -like 'Release SSH preflight failed*' }
  Assert $blocked 'Failed SSH did not stop before image construction.'
  Write-Output 'PASS: retry identity, invalidation, expiry, image label and early SSH denial (no host access).'
} finally {
  # The GUID test directory is created under TEMP and removed in this shell only.
  $resolved = [IO.Path]::GetFullPath($testRoot)
  $tempBoundary = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($tempBoundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test cleanup escaped TEMP.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

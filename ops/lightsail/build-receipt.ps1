# Reuse immutable image artifacts, never recovery, migration or hosted evidence.
function Get-ReleaseFileHash {
  param([string]$Path)
  $stream = [IO.File]::OpenRead($Path)
  try { return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) }
  finally { $stream.Dispose() }
}

function Get-ReleaseBuildIdentity {
  param([string]$Root, [string]$Revision, [bool]$BuildWebOnHost)
  $budget = [Diagnostics.Stopwatch]::StartNew()
  $entries = [System.Collections.Generic.List[string]]::new()
  $entries.Add("revision=$Revision;hostWeb=$BuildWebOnHost")
  foreach ($dependencyPath in @('apps/web/node_modules', 'apps/api/vendor')) {
    $directory = Get-Item -LiteralPath (Join-Path $Root $dependencyPath) -ErrorAction SilentlyContinue
    if ($directory -and $directory.LinkType) { return $null }
  }
  Push-Location $Root
  try {
    $paths = @(git -c core.quotepath=false ls-files --cached --others --exclude-standard -- apps/api apps/web)
    if ($LASTEXITCODE -ne 0) { throw 'Could not identify build inputs.' }
    foreach ($relative in $paths) {
      if ($budget.Elapsed.TotalSeconds -gt 10) { return $null }
      $path = Join-Path $Root $relative
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing build input: $relative" }
      if (([IO.FileInfo]::new($path)).Length -gt 128MB) { return $null }
      $entries.Add("$relative=$(Get-ReleaseFileHash $path)")
    }
    # Vite also consumes ignored environment files and exported VITE_* settings.
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $Root 'apps/web') -Filter '.env*' -File -Force) {
      $entries.Add("web-env/$($file.Name)=$(Get-ReleaseFileHash $file.FullName)")
    }
    foreach ($variable in Get-ChildItem Env: | Where-Object { $_.Name -like 'VITE_*' -or $_.Name -eq 'NODE_ENV' }) {
      $entries.Add("env/$($variable.Name)=$($variable.Value)")
    }
    # Hash ignored build inputs too, including installed dependencies/vendor.
    # Do not reuse from a dependency junction into another owner's worktree.
    foreach ($directory in @('apps/api', 'apps/web')) {
      $enumeration = [IO.EnumerationOptions]::new()
      $enumeration.RecurseSubdirectories = $true
      $enumeration.AttributesToSkip = [IO.FileAttributes]::ReparsePoint
      $enumeration.IgnoreInaccessible = $false
      foreach ($path in [IO.Directory]::EnumerateFiles((Join-Path $Root $directory), '*', $enumeration)) {
        if ($budget.Elapsed.TotalSeconds -gt 10 -or ([IO.FileInfo]::new($path)).Length -gt 128MB) { return $null }
        $relative = [IO.Path]::GetRelativePath($Root, $path).Replace('\', '/')
        if ($relative -match '^apps/(api/(tmp|log|storage)|web/(dist|coverage|outputs))/') { continue }
        if ($relative -match '^apps/api/(\.env[^/]*|\.bundle/.*|config/(master\.key|credentials\.yml\.enc|credentials/[^/]*\.key))$') { continue }
        $entries.Add("local/$relative=$(Get-ReleaseFileHash $path)")
      }
    }
  } catch { return $null } finally { Pop-Location }
  $bytes = [Text.Encoding]::UTF8.GetBytes((($entries | Sort-Object) -join "`n"))
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Get-ReleaseImageIdentity {
  param([string]$Image, [string]$Revision)
  $raw = & docker image inspect $Image 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $imageInfo = @(($raw -join "`n") | ConvertFrom-Json)[0]
  if ($imageInfo.Config.Labels.'org.opencontainers.image.revision' -ne $Revision -or
      $imageInfo.Os -ne 'linux' -or $imageInfo.Architecture -ne 'amd64') { return $null }
  return $imageInfo.Id
}

function Test-ReleaseBuildReceipt {
  param([string]$Path, [string]$Revision, [string]$Fingerprint, [string]$ApiId, [string]$WebId)
  if (-not $Fingerprint -or -not $ApiId -or -not $WebId -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    $receipt = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    $age = [DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($receipt.built_at)
    return $receipt.schema -eq 1 -and $receipt.revision -eq $Revision -and
      $receipt.fingerprint -eq $Fingerprint -and $receipt.api_id -eq $ApiId -and
      $receipt.web_id -eq $WebId -and $age.TotalHours -ge 0 -and $age.TotalHours -le 24
  } catch { return $false }
}

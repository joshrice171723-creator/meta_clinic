param(
  [Parameter(Mandatory = $true)][string]$KeyPath,
  [string]$Server = 'ubuntu@aimetaclinic.com',
  [string]$RecoveryDirectory = (Join-Path $env:USERPROFILE 'Desktop\06 - Secure Files'),
  [ValidateSet('local', 'registry')][string]$ImageSource = 'local'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$key = (Resolve-Path -LiteralPath $KeyPath).Path
if (-not (Test-Path -LiteralPath $RecoveryDirectory -PathType Container)) {
  throw "Recovery directory does not exist: $RecoveryDirectory"
}

Push-Location $root
try {
  if ((git branch --show-current) -ne 'main') { throw 'Release from main only.' }
  if (git status --porcelain --untracked-files=no) { throw 'Commit tracked changes before release.' }
  git fetch origin main | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not fetch origin/main.' }
  $revision = (git rev-parse HEAD).Trim()
  $remoteRevision = (git rev-parse origin/main).Trim()
  if ($LASTEXITCODE -ne 0 -or $revision -ne $remoteRevision -or $revision -notmatch '^[0-9a-f]{40}$') {
    throw 'Local main must equal origin/main.'
  }
} finally {
  Pop-Location
}

$remoteScript = "/tmp/meta-clinic-release-$revision.sh"
$remoteVerify = "/tmp/meta-clinic-verify-$revision.py"
$remoteArchive = $null
$remoteImages = "/home/ubuntu/meta-clinic-images-$revision.tar"
$localImages = Join-Path $env:TEMP "meta-clinic-images-$revision.tar"
$plain = Join-Path $RecoveryDirectory "MetaClinic-recovery-$revision.tar.gz.partial"
$encrypted = Join-Path $RecoveryDirectory "MetaClinic-recovery-$revision.tar.gz.dpapi"
if (Test-Path -LiteralPath $plain) { throw "Remove or inspect existing partial download: $plain" }
if (Test-Path -LiteralPath $encrypted) { throw "An encrypted recovery archive already exists: $encrypted" }
if ($ImageSource -eq 'local' -and (Test-Path -LiteralPath $localImages)) {
  throw "Remove or inspect existing image archive: $localImages"
}

if ($ImageSource -eq 'local') {
  Push-Location $root
  try {
    $apiImage = "meta-clinic-api:$revision"
    $webImage = "meta-clinic-web:$revision"
    & docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$revision" -t $apiImage apps/api
    if ($LASTEXITCODE -ne 0) { throw 'API image build failed.' }
    & docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$revision" -t $webImage apps/web
    if ($LASTEXITCODE -ne 0) { throw 'Web image build failed.' }
    & docker save -o $localImages $apiImage $webImage
    if ($LASTEXITCODE -ne 0) { throw 'Could not save matched images.' }
  } finally {
    Pop-Location
  }
  try {
    & scp -o BatchMode=yes -i $key $localImages "${Server}:$remoteImages"
    if ($LASTEXITCODE -ne 0) { throw 'Could not transfer matched images.' }
    & ssh -o BatchMode=yes -i $key $Server "sudo docker load -i $remoteImages"
    if ($LASTEXITCODE -ne 0) { throw 'Could not load matched images on the host.' }
  } finally {
    if (Test-Path -LiteralPath $localImages) { Remove-Item -LiteralPath $localImages }
    & ssh -o BatchMode=yes -i $key $Server "rm -f $remoteImages" | Out-Null
  }
}

& scp -o BatchMode=yes -i $key (Join-Path $PSScriptRoot 'release.sh') "${Server}:$remoteScript"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the release script.' }
& scp -o BatchMode=yes -i $key (Join-Path $PSScriptRoot 'verify-demo.py') "${Server}:$remoteVerify"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the release verifier.' }

try {
  $prepared = & ssh -o BatchMode=yes -i $key $Server "sudo sed -i 's/\r$//' $remoteScript && sudo bash $remoteScript prepare $revision $ImageSource"
  if ($LASTEXITCODE -ne 0) { throw 'Host preparation failed; the current release remains active.' }
  $archiveLine = $prepared | Where-Object { $_ -match '^RECOVERY_ARCHIVE=' } | Select-Object -Last 1
  $hashLine = $prepared | Where-Object { $_ -match '^RECOVERY_SHA256=' } | Select-Object -Last 1
  if (-not $archiveLine -or -not $hashLine) { throw 'Host did not return recovery archive details.' }
  $remoteArchive = $archiveLine.Substring('RECOVERY_ARCHIVE='.Length)
  $expectedHash = $hashLine.Substring('RECOVERY_SHA256='.Length)
  if ($remoteArchive -ne "/home/ubuntu/meta-clinic-recovery-$revision.tar.gz" -or $expectedHash -notmatch '^[0-9a-f]{64}$') {
    throw 'Invalid recovery archive response.'
  }
  & scp -o BatchMode=yes -i $key "${Server}:$remoteArchive" $plain
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the recovery archive off the host.' }
  $actualHash = (Get-FileHash -LiteralPath $plain -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) { throw 'Recovery archive checksum mismatch.' }

  $bytes = [System.IO.File]::ReadAllBytes($plain)
  $protected = [System.Security.Cryptography.ProtectedData]::Protect(
    $bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  [System.IO.File]::WriteAllBytes($encrypted, $protected)
  $roundTrip = [System.Security.Cryptography.ProtectedData]::Unprotect(
    [System.IO.File]::ReadAllBytes($encrypted), $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  $hash = [System.Security.Cryptography.SHA256]::HashData($roundTrip)
  if ([Convert]::ToHexString($hash).ToLowerInvariant() -ne $expectedHash) {
    throw 'Encrypted recovery archive failed round-trip verification.'
  }
  $bytes = $null
  $roundTrip = $null
  Remove-Item -LiteralPath $plain

  & ssh -o BatchMode=yes -i $key $Server "sudo bash $remoteScript deploy $revision $expectedHash"
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed. Recovery archive: $encrypted" }
  Write-Output "Release $revision completed. Encrypted recovery archive: $encrypted"
} finally {
  if (Test-Path -LiteralPath $plain) { Remove-Item -LiteralPath $plain }
  $cleanupPaths = "$remoteScript $remoteVerify"
  if ($remoteArchive) { $cleanupPaths += " $remoteArchive" }
  & ssh -o BatchMode=yes -i $key $Server "rm -f $cleanupPaths" | Out-Null
}

[CmdletBinding()]
param(
  [switch]$IncludeOfflineRuntime
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $projectRoot 'references/upstream-lock.json'
$referenceRoot = Join-Path $projectRoot '.reference'
$targetPath = Join-Path $referenceRoot 'baye-fmj-app'
$lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
$repositoryUrl = [string]$lock.repository.url
$commit = [string]$lock.repository.commit
$git = (Get-Command git -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $referenceRoot)) {
  New-Item -ItemType Directory -Path $referenceRoot | Out-Null
}

if (-not (Test-Path -LiteralPath $targetPath)) {
  & $git clone --filter=blob:none --no-checkout $repositoryUrl $targetPath
  if ($LASTEXITCODE -ne 0) { throw 'Failed to clone the Baye reference repository.' }
} elseif (-not (Test-Path -LiteralPath (Join-Path $targetPath '.git'))) {
  throw "Reference target exists but is not a Git repository: $targetPath"
} else {
  $actualRemote = (& $git -C $targetPath remote get-url origin).Trim()
  if ($LASTEXITCODE -ne 0 -or $actualRemote -ne $repositoryUrl) {
    throw "Reference repository origin does not match lock file: $actualRemote"
  }
}

$paths = @($lock.referencePaths | ForEach-Object { [string]$_.path })

if ($IncludeOfflineRuntime) {
  Write-Warning 'The optional offline runtime is GPL-licensed and remains reference-only.'
  $paths += @(
    'Baye/baye_offline/index.html',
    'Baye/baye_offline/choose.html',
    'Baye/baye_offline/m.html',
    'Baye/baye_offline/pc.html',
    'Baye/baye_offline/css',
    'Baye/baye_offline/js'
  )
}

& $git -C $targetPath sparse-checkout init --no-cone
if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize sparse checkout.' }

$sparseArgs = @('-C', $targetPath, 'sparse-checkout', 'set', '--no-cone') + $paths
& $git @sparseArgs
if ($LASTEXITCODE -ne 0) { throw 'Failed to configure sparse checkout paths.' }

& $git -C $targetPath fetch --depth 1 origin $commit
if ($LASTEXITCODE -ne 0) { throw "Failed to fetch pinned commit: $commit" }

& $git -C $targetPath checkout --detach $commit
if ($LASTEXITCODE -ne 0) { throw "Failed to check out pinned commit: $commit" }

$actualCommit = (& $git -C $targetPath rev-parse HEAD).Trim()
if ($actualCommit -ne $commit) {
  throw "Reference checkout mismatch. Expected $commit, got $actualCommit"
}

Write-Output "Baye reference ready at $targetPath"
Write-Output "Pinned commit: $actualCommit"

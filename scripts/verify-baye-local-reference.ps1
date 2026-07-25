[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = (Resolve-Path -LiteralPath $SourcePath).Path
$manifestPath = Join-Path $projectRoot 'references/source-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$failures = [System.Collections.Generic.List[string]]::new()

foreach ($entry in $manifest.files) {
  $path = Join-Path $sourceRoot ([string]$entry.path)
  if (-not (Test-Path -LiteralPath $path)) {
    $failures.Add("missing: $($entry.path)")
    continue
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
  if ($actual -ne [string]$entry.sha256) {
    $failures.Add("hash mismatch: $($entry.path) expected=$($entry.sha256) actual=$actual")
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  throw "Local Baye reference verification failed for $($failures.Count) file(s)."
}

Write-Output "Verified $($manifest.files.Count) authority files under $sourceRoot"
Write-Warning 'The snapshot has no Git metadata; file hashes match, but the expected commit identity remains unverified.'

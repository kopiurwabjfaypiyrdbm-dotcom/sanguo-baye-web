[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [string]$OutputPath = 'references/fixtures/structure-layout.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = (Resolve-Path -LiteralPath $SourcePath).Path
$cRoot = Join-Path $sourceRoot 'baye_c/src'
$attributeFile = Join-Path $cRoot 'baye/attribute.h'
$typeFile = Join-Path $cRoot 'inc/dictsys.h'
$probeFile = Join-Path $projectRoot 'tools/reference/baye-structure-probe.c'
$lockPath = Join-Path $projectRoot 'references/upstream-lock.json'
$buildRoot = Join-Path $projectRoot '.reference/oracle'
$executable = Join-Path $buildRoot 'baye-structure-probe.exe'
$resolvedOutput = Join-Path $projectRoot $OutputPath

foreach ($requiredPath in @($attributeFile, $typeFile, $probeFile)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required structure source not found: $requiredPath" }
}

$compiler = (Get-Command gcc -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
& $compiler -std=c11 -Wall -Wextra -Werror -I $cRoot -I (Join-Path $cRoot 'inc') -I (Join-Path $cRoot 'baye') $probeFile -o $executable
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile the Baye structure probe.' }

$payloadText = (& $executable) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'The Baye structure probe failed.' }
$payload = $payloadText | ConvertFrom-Json
$lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json

$fixture = [ordered]@{
  schemaVersion = 1
  subject = 'baye-packed-structure-layout'
  authority = [ordered]@{
    repository = [string]$lock.repository.url
    expectedCommit = [string]$lock.repository.commit
    snapshotCommitVerified = $false
  }
  generator = [ordered]@{
    command = '.\scripts\collect-baye-structure-reference.ps1 -SourcePath <path-to-Baye>'
    sourceEntry = 'Baye/baye_c/src/inc/dictsys.h; Baye/baye_c/src/baye/attribute.h'
    sourceSha256 = [ordered]@{
      'Baye/baye_c/src/inc/dictsys.h' = (Get-FileHash -Algorithm SHA256 -LiteralPath $typeFile).Hash.ToLowerInvariant()
      'Baye/baye_c/src/baye/attribute.h' = (Get-FileHash -Algorithm SHA256 -LiteralPath $attributeFile).Hash.ToLowerInvariant()
    }
    probeSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $probeFile).Hash.ToLowerInvariant()
    compiler = (& $compiler --version | Select-Object -First 1)
  }
  results = $payload
}

$fixture | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
Write-Output "Wrote $resolvedOutput"

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [string]$OutputPath = 'references/fixtures/battle-c-oracle.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = (Resolve-Path -LiteralPath $SourcePath).Path
$sourceFile = Join-Path $sourceRoot 'baye_c/src/FgtCount.c'
$armsSourceFile = Join-Path $sourceRoot 'baye_c/src/tactic.c'
$oracleFile = Join-Path $projectRoot 'tools/reference/baye-battle-oracle.c'
$lockPath = Join-Path $projectRoot 'references/upstream-lock.json'
$buildRoot = Join-Path $projectRoot '.reference/oracle'
$executable = Join-Path $buildRoot 'baye-battle-oracle.exe'
$resolvedOutput = Join-Path $projectRoot $OutputPath

if (-not (Test-Path -LiteralPath $sourceFile)) {
  throw "Required reference source not found: $sourceFile"
}
if (-not (Test-Path -LiteralPath $armsSourceFile)) {
  throw "Required reference source not found: $armsSourceFile"
}

$compiler = (Get-Command gcc -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

& $compiler -std=c11 -O0 -Wall -Wextra -Werror $oracleFile -o $executable
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile the Baye battle oracle.' }

$payloadText = (& $executable) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'The Baye battle oracle failed.' }
$payload = $payloadText | ConvertFrom-Json
$lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json

$fixture = [ordered]@{
  schemaVersion = 1
  subject = 'baye-c-battle-formulas'
  authority = [ordered]@{
    repository = [string]$lock.repository.url
    expectedCommit = [string]$lock.repository.commit
    snapshotCommitVerified = $false
    limitation = 'The supplied ZIP snapshot has no Git metadata. The fixture verifies the checked C source formulas and compiler truncation semantics.'
  }
  generator = [ordered]@{
    command = '.\scripts\collect-baye-battle-reference.ps1 -SourcePath <path-to-Baye>'
    sourceEntry = 'Baye/baye_c/src/FgtCount.c:FgtCountWon/BuiltAtkAttr/CountAtkHurt; Baye/baye_c/src/tactic.c:GetArmType'
    sourceSha256 = [ordered]@{
      'Baye/baye_c/src/FgtCount.c' = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile).Hash.ToLowerInvariant()
      'Baye/baye_c/src/tactic.c' = (Get-FileHash -Algorithm SHA256 -LiteralPath $armsSourceFile).Hash.ToLowerInvariant()
    }
    oracleSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $oracleFile).Hash.ToLowerInvariant()
    compiler = (& $compiler --version | Select-Object -First 1)
  }
  results = $payload
}

$fixture | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
Write-Output "Wrote $resolvedOutput"

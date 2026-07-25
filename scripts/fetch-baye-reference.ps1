[CmdletBinding()]
param(
  [switch]$IncludeOfflineRuntime,
  [switch]$FullSource
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$arguments = @((Join-Path $PSScriptRoot 'fetch-baye-reference.mjs'))
if ($IncludeOfflineRuntime) { $arguments += '--include-offline-runtime' }
if ($FullSource) { $arguments += '--full-source' }

& node @arguments
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the Baye reference workspace.' }

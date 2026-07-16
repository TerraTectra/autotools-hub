[CmdletBinding()]
param(
    [ValidateSet('User', 'Project', 'Custom')]
    [string]$Scope = 'User',

    [string]$Target
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

switch ($Scope) {
    'User' {
        if (-not $Target) {
            $Target = Join-Path $HOME '.claude\skills\solana-devnet-reliability'
        }
    }
    'Project' {
        if (-not $Target) {
            $Target = Join-Path (Get-Location) '.claude\skills\solana-devnet-reliability'
        }
    }
    'Custom' {
        if (-not $Target) {
            throw 'Scope Custom requires -Target.'
        }
    }
}

$ResolvedTarget = [System.IO.Path]::GetFullPath($Target)
$RootPath = [System.IO.Path]::GetPathRoot($ResolvedTarget)
if ([string]::IsNullOrWhiteSpace($ResolvedTarget) -or $ResolvedTarget -eq $RootPath) {
    throw 'Refusing unsafe target path.'
}

New-Item -ItemType Directory -Path $ResolvedTarget -Force | Out-Null

foreach ($Directory in @('skill', 'commands', 'agents', 'scripts')) {
    $Source = Join-Path $ScriptRoot $Directory
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Missing source directory: $Source"
    }

    $Destination = Join-Path $ResolvedTarget $Directory
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $Source '*') -Destination $Destination -Recurse -Force
}

Copy-Item -LiteralPath (Join-Path $ScriptRoot 'README.md') -Destination (Join-Path $ResolvedTarget 'README.md') -Force
Copy-Item -LiteralPath (Join-Path $ScriptRoot 'package.json') -Destination (Join-Path $ResolvedTarget 'package.json') -Force

Write-Host 'Installed Solana Devnet Reliability Skill to:'
Write-Host "  $ResolvedTarget"
Write-Host ''
Write-Host 'Read-only doctor example:'
Write-Host "  node `"$(Join-Path $ResolvedTarget 'scripts\devnet-doctor.mjs')`" --address <PUBLIC_KEY> --json"

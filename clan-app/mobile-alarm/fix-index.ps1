<#
================================================================
  Repair index.js
================================================================

  Fixes a file where literal "\r\n" text was written instead of
  real line breaks, which makes Metro fail with:

      SyntaxError: Expecting Unicode escape sequence \uXXXX

  Cause: an earlier installer used a broken PowerShell escape.
  This script rewrites index.js from scratch - it is only 6 lines.

  Usage:
    .\fix-index.ps1
    .\fix-index.ps1 -ProjectPath "C:\bbbb\ClanApp"
================================================================
#>

param(
    [string]$ProjectPath = "C:\bbbb\ClanApp"
)

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Write-Host ""
Write-Host "==================================================" -ForegroundColor White
Write-Host "  REPAIR index.js" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor White
Write-Host ""

$indexPath = Join-Path $ProjectPath "index.js"
if (-not (Test-Path $indexPath)) {
    $alt = Join-Path $ProjectPath "index.tsx"
    if (Test-Path $alt) { $indexPath = $alt }
}

if (-not (Test-Path $indexPath)) {
    Write-Host "  index.js not found in $ProjectPath" -ForegroundColor Red
    exit 1
}

# -- Diagnose --

$content = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$realLines = ([regex]::Split($content, "\r?\n")).Count
$literalCount = ([regex]::Matches($content, '\\r\\n')).Count

Write-Host "  file:          $indexPath"
Write-Host "  real lines:    $realLines"
Write-Host "  literal \r\n:   $literalCount"
Write-Host ""

if ($literalCount -eq 0 -and $realLines -gt 3) {
    Write-Host "  OK   file looks healthy - nothing to repair" -ForegroundColor Green
    Write-Host ""
    Write-Host "  current content:" -ForegroundColor Gray
    Get-Content $indexPath | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    Write-Host ""
    exit 0
}

Write-Host "  DAMAGED - literal escape sequences found" -ForegroundColor Red
Write-Host ""

# -- Backup --

$backup = "$indexPath.broken"
if (-not (Test-Path $backup)) {
    Copy-Item $indexPath $backup
    Write-Host "  backup: $backup" -ForegroundColor Gray
}

# -- Find the app name --

$appName = "ClanApp"
$appJson = Join-Path $ProjectPath "app.json"
if (Test-Path $appJson) {
    try {
        $j = [System.IO.File]::ReadAllText($appJson, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($j.name) { $appName = $j.name }
    }
    catch { }
}

# -- Rewrite --

$nl = [Environment]::NewLine

$lines = @(
    "/**",
    " * @format",
    " */",
    "",
    "import {AppRegistry} from 'react-native';",
    "import App from './App';",
    "import {name as appName} from './app.json';",
    "",
    "AppRegistry.registerComponent(appName, () => App);",
    ""
)

$fixed = $lines -join $nl

[System.IO.File]::WriteAllText($indexPath, $fixed, $Utf8NoBom)

Write-Host "  REPAIRED" -ForegroundColor Green
Write-Host ""
Write-Host "  new content:" -ForegroundColor Gray

$check = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
foreach ($l in [regex]::Split($check, "\r?\n")) {
    Write-Host "    $l" -ForegroundColor DarkGray
}

$stillBad = ([regex]::Matches($check, '\\r\\n')).Count
Write-Host ""
if ($stillBad -eq 0) {
    Write-Host "  OK   no literal escapes remain" -ForegroundColor Green
}
else {
    Write-Host "  FAIL still $stillBad literal escapes" -ForegroundColor Red
}

# -- Also verify App.tsx while we are here --

Write-Host ""
Write-Host "  checking App entry file..." -ForegroundColor Gray

$appTsx = Join-Path $ProjectPath "App.tsx"
$appJs  = Join-Path $ProjectPath "App.js"

$appFile = $null
if (Test-Path $appTsx) { $appFile = $appTsx }
elseif (Test-Path $appJs) { $appFile = $appJs }

if ($appFile) {
    $appText = [System.IO.File]::ReadAllText($appFile, [System.Text.Encoding]::UTF8)
    $appBad = ([regex]::Matches($appText, '\\r\\n')).Count

    if ($appBad -gt 0) {
        Write-Host "  App file is also damaged - repairing" -ForegroundColor Yellow

        if (-not (Test-Path "$appFile.broken")) {
            Copy-Item $appFile "$appFile.broken"
        }

        $appLines = @(
            "import React from 'react';",
            "import TestScreen from './src/alarm/TestScreen';",
            "",
            "export default function App() {",
            "  return <TestScreen />;",
            "}",
            ""
        )
        [System.IO.File]::WriteAllText($appFile, ($appLines -join $nl), $Utf8NoBom)
        Write-Host "  OK   $(Split-Path $appFile -Leaf) repaired" -ForegroundColor Green
    }
    else {
        Write-Host "  OK   $(Split-Path $appFile -Leaf) is clean" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "  Next: press 'r' in the Metro window to reload" -ForegroundColor Cyan
Write-Host ""

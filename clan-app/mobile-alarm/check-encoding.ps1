<#
================================================================
  Check for mojibake damage from older installer versions
================================================================
  PowerShell 5.1 reads files as ANSI, not UTF-8. Older versions
  of install.ps1 used Get-Content -Raw, which corrupted every
  Arabic string in the Kotlin sources.

  Visible symptom: alarm notification shows garbage instead of
  Arabic, and update verification always fails.

  Usage:  .\check-encoding.ps1
================================================================
#>

param([string]$ProjectPath = "C:\bbbb\ClanApp")

Write-Host ""
Write-Host "==================================================" -ForegroundColor White
Write-Host "  ENCODING CHECK" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor White
Write-Host ""

$gradleFile = Join-Path $ProjectPath "android\app\build.gradle"
if (-not (Test-Path $gradleFile)) {
    Write-Host "  Project not found: $ProjectPath" -ForegroundColor Red
    exit 1
}

$gradleText = [System.IO.File]::ReadAllText($gradleFile, [System.Text.Encoding]::UTF8)
$pkg = $null
if ($gradleText -match 'applicationId\s+["\'']([^"\'']+)["\'']') { $pkg = $Matches[1] }
elseif ($gradleText -match 'namespace\s+["\'']([^"\'']+)["\'']')  { $pkg = $Matches[1] }

$alarmPkg = "$pkg.alarm"
$dir = Join-Path $ProjectPath ("android\app\src\main\java\" + ($alarmPkg -replace '\.', '\'))

if (-not (Test-Path $dir)) {
    Write-Host "  Alarm files not installed yet" -ForegroundColor Yellow
    exit 0
}

# Mojibake signature: UTF-8 Arabic read as CP1252 produces these
$markers = @([char]0x00D9, [char]0x00D8, [char]0x00C3, [char]0x0098, [char]0x0099)

$damaged = @()
$clean = 0

foreach ($f in Get-ChildItem (Join-Path $dir "*.kt")) {
    $text = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)

    $hits = 0
    foreach ($m in $markers) {
        $hits += ([regex]::Matches($text, [regex]::Escape($m))).Count
    }

    # Real Arabic files have zero of these; damaged ones have hundreds
    if ($hits -gt 20) {
        $damaged += [PSCustomObject]@{ Name = $f.Name; Hits = $hits }
    }
    else {
        $clean++
    }
}

if ($damaged.Count -eq 0) {
    Write-Host "  OK   All $clean files are clean UTF-8" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Notification text will display correctly." -ForegroundColor Gray
}
else {
    Write-Host "  DAMAGED FILES FOUND" -ForegroundColor Red
    Write-Host ""
    foreach ($d in $damaged) {
        Write-Host ("    {0,-24} {1} corrupt sequences" -f $d.Name, $d.Hits) -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  Cause: an older installer read files as ANSI." -ForegroundColor Yellow
    Write-Host "  Fix:   .\update.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "  The new installer reads UTF-8 explicitly." -ForegroundColor Gray
}

Write-Host ""

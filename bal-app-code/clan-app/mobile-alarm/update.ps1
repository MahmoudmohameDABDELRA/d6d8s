<#
================================================================
  UPDATE - copy new code, verify it arrived, rebuild, run
================================================================

  Answers the question: "how do I know the update actually landed?"

  It compares file hashes between source and project,
  then does a clean rebuild so no stale .class files survive.

  Usage:
    .\update.ps1
    .\update.ps1 -VerifyOnly    just check, change nothing
    .\update.ps1 -NoClean       faster, skips gradle clean
================================================================
#>

param(
    [string]$ProjectPath = "C:\bbbb\ClanApp",
    [switch]$VerifyOnly,
    [switch]$NoClean
)

$ErrorActionPreference = "Continue"
$SourceDir = $PSScriptRoot

function Say  { param($t) Write-Host "  $t" -ForegroundColor Gray }
function Good { param($t) Write-Host "  OK    $t" -ForegroundColor Green }
function Bad  { param($t) Write-Host "  FAIL  $t" -ForegroundColor Red }
function Warn { param($t) Write-Host "  !     $t" -ForegroundColor Yellow }
function Head { param($t) Write-Host "`n$t" -ForegroundColor Cyan }

Write-Host ""
Write-Host "==================================================" -ForegroundColor White
Write-Host "  UPDATE + VERIFY + RUN" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor White

# ================================================
#  Detect package name
# ================================================

$gradleFile = Join-Path $ProjectPath "android\app\build.gradle"
if (-not (Test-Path $gradleFile)) {
    Bad "not a React Native project: $ProjectPath"
    exit 1
}

$gradleText = Read-Utf8 $gradleFile
$PackageName = $null
if ($gradleText -match 'applicationId\s+["'']([^"'']+)["'']') { $PackageName = $Matches[1] }
elseif ($gradleText -match 'namespace\s+["'']([^"'']+)["'']')  { $PackageName = $Matches[1] }

if (-not $PackageName) { Bad "cannot read applicationId"; exit 1 }

$AlarmPackage = "$PackageName.alarm"
$kotlinDest = Join-Path $ProjectPath ("android\app\src\main\java\" + ($AlarmPackage -replace '\.', '\'))
$jsDest = Join-Path $ProjectPath "src\alarm"

# ================================================
#  1. Compare before copying
# ================================================

Head "[1] What changed"

$kotlinSource = Join-Path $SourceDir "android\java\com\clanapp\alarm"
$jsSource = Join-Path $SourceDir "js"

function Get-NormalizedHash {
    param([string]$Path, [string]$FromPkg, [string]$ToPkg)
    if (-not (Test-Path $Path)) { return $null }

# ================================================
#  UTF-8 safe file IO
# ================================================
#
#  CRITICAL: PowerShell 5.1 reads files using the system ANSI
#  codepage, NOT UTF-8. Any Arabic text in the source becomes
#  mojibake, and writing it back as UTF-8 double-encodes it.
#
#  Real symptom seen on a device: the alarm notification showed
#  Real symptom seen on a device: the alarm notification showed
#  mojibake instead of Arabic text, and file hashes never matched
#  so verification always failed.
#
#  Always use these helpers instead of Get-Content / Set-Content.

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8 {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8 {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, $script:Utf8NoBom)
}

function Read-Utf8FirstLine {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $reader = New-Object System.IO.StreamReader($Path, [System.Text.Encoding]::UTF8)
    try { return $reader.ReadLine() } finally { $reader.Close() }
}
    $text = Read-Utf8 $Path
    if ($FromPkg -and $ToPkg -and $FromPkg -ne $ToPkg) {
        $text = $text -replace [regex]::Escape($FromPkg), $ToPkg
    }
    # normalize line endings so CRLF/LF never causes a false diff
    $text = $text -replace "`r`n", "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "")
}

$changed = @()
$same = 0
$missing = @()

foreach ($f in Get-ChildItem (Join-Path $kotlinSource "*.kt")) {
    $target = Join-Path $kotlinDest $f.Name
    $srcHash = Get-NormalizedHash $f.FullName "com.clanapp.alarm" $AlarmPackage
    $dstHash = Get-NormalizedHash $target $null $null

    if (-not $dstHash) { $missing += $f.Name }
    elseif ($srcHash -ne $dstHash) { $changed += $f.Name }
    else { $same++ }
}

foreach ($f in Get-ChildItem (Join-Path $jsSource "*.js")) {
    $target = Join-Path $jsDest $f.Name
    $srcHash = Get-NormalizedHash $f.FullName $null $null
    $dstHash = Get-NormalizedHash $target $null $null

    if (-not $dstHash) { $missing += $f.Name }
    elseif ($srcHash -ne $dstHash) { $changed += $f.Name }
    else { $same++ }
}

# Files in project that no longer exist in source (deleted upstream)
$orphans = @()
if (Test-Path $jsDest) {
    foreach ($f in Get-ChildItem (Join-Path $jsDest "*.js")) {
        if (-not (Test-Path (Join-Path $jsSource $f.Name))) { $orphans += $f.Name }
    }
}

if ($missing.Count -gt 0) {
    Warn "new files: $($missing -join ', ')"
}
if ($changed.Count -gt 0) {
    Warn "modified: $($changed -join ', ')"
}
if ($orphans.Count -gt 0) {
    Warn "removed upstream: $($orphans -join ', ')"
}
if ($changed.Count -eq 0 -and $missing.Count -eq 0 -and $orphans.Count -eq 0) {
    Good "already up to date ($same files identical)"
}
else {
    Say "$same files unchanged"
}

if ($VerifyOnly) {
    Write-Host ""
    Say "verify only - nothing was changed"
    Write-Host ""
    exit 0
}

# ================================================
#  2. Delete orphans
# ================================================

if ($orphans.Count -gt 0) {
    Head "[2] Removing stale files"
    foreach ($o in $orphans) {
        Remove-Item (Join-Path $jsDest $o) -Force -EA SilentlyContinue
        Good "deleted $o"
    }
}

# ================================================
#  3. Run installer
# ================================================

Head "[3] Copying files"

$installer = Join-Path $SourceDir "install.ps1"
if (-not (Test-Path $installer)) {
    Bad "install.ps1 not found"
    exit 1
}

& $installer -ProjectPath $ProjectPath | Out-Null

if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Bad "installer reported a problem"
}

# ================================================
#  4. Verify the copy actually landed
# ================================================

Head "[4] Verify"

$verifyFail = @()

foreach ($f in Get-ChildItem (Join-Path $kotlinSource "*.kt")) {
    $target = Join-Path $kotlinDest $f.Name
    $srcHash = Get-NormalizedHash $f.FullName "com.clanapp.alarm" $AlarmPackage
    $dstHash = Get-NormalizedHash $target $null $null
    if ($srcHash -ne $dstHash) { $verifyFail += $f.Name }
}

foreach ($f in Get-ChildItem (Join-Path $jsSource "*.js")) {
    $target = Join-Path $jsDest $f.Name
    $srcHash = Get-NormalizedHash $f.FullName $null $null
    $dstHash = Get-NormalizedHash $target $null $null
    if ($srcHash -ne $dstHash) { $verifyFail += $f.Name }
}

if ($verifyFail.Count -gt 0) {
    Bad "these did NOT update: $($verifyFail -join ', ')"
    Say "possible cause: file locked by an editor or running app"
    exit 1
}

Good "all files match source"

# Spot-check a marker that only exists in the new version
$actPath = Join-Path $kotlinDest "AlarmActivity.kt"
if (Test-Path $actPath) {
    $actText = Read-Utf8 $actPath
    if ($actText -match 'ReactActivity\(\)') {
        Bad "AlarmActivity is still the OLD React version"
        exit 1
    }
    if ($actText -match ':\s*Activity\(\)') {
        Good "AlarmActivity is the new native version"
    }
    if ($actText -match 'onNewIntent') {
        Good "onNewIntent present (fixes repeated challenge)"
    }
}

# ================================================
#  5. Clean stale build output
# ================================================

if (-not $NoClean) {
    Head "[5] Clean"
    Say "removing stale build output..."

    $buildDirs = @(
        (Join-Path $ProjectPath "android\app\build"),
        (Join-Path $ProjectPath "android\.gradle")
    )
    foreach ($b in $buildDirs) {
        if (Test-Path $b) {
            Remove-Item $b -Recurse -Force -EA SilentlyContinue
        }
    }
    Good "build cache cleared"
    Say "next build will be slower but guaranteed fresh"
}

# ================================================
#  6. Build and run
# ================================================

Head "[6] Build and run"

$runner = Join-Path $SourceDir "run.ps1"
if (Test-Path $runner) {
    & $runner -ProjectPath $ProjectPath
}
else {
    Bad "run.ps1 not found - build manually:"
    Say "cd `"$ProjectPath\android`"; .\gradlew installDebug"
}

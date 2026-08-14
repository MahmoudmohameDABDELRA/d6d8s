<#
================================================================
  ONE COMMAND - fixes everything and runs the app
================================================================

  Solves permanently:
    - JAVA_HOME lost in new windows
    - ANDROID_HOME lost in new windows
    - adb reverse (port 8081) after every reconnect
    - Metro not running

  Usage:
    .\run.ps1              build + install + start metro
    .\run.ps1 -SkipBuild   only fix ports + start metro
    .\run.ps1 -PortOnly    only fix the port, nothing else
================================================================
#>

param(
    [string]$ProjectPath = "C:\bbbb\ClanApp",
    [switch]$SkipBuild,
    [switch]$PortOnly
)

$ErrorActionPreference = "Continue"

function Say  { param($t) Write-Host "  $t" -ForegroundColor Gray }
function Good { param($t) Write-Host "  OK   $t" -ForegroundColor Green }
function Bad  { param($t) Write-Host "  FAIL $t" -ForegroundColor Red }
function Head { param($t) Write-Host "`n$t" -ForegroundColor Cyan }

Write-Host ""
Write-Host "==================================================" -ForegroundColor White
Write-Host "  CLAN ALARM - RUN" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor White

# ================================================
#  1. JAVA - find and lock it permanently
# ================================================

Head "[1] Java"

$jdk = $null
$candidates = @(
    $env:JAVA_HOME,
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\Android\Android Studio\jre",
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
    "D:\AndroidDev\Android Studio\jbr",
    "D:\Android Studio\jbr"
)

foreach ($c in $candidates) {
    if ($c -and (Test-Path "$c\bin\java.exe")) { $jdk = $c; break }
}

if (-not $jdk) {
    Say "searching disks..."
    $roots = @("C:\Program Files", "D:\") | Where-Object { Test-Path $_ }
    foreach ($r in $roots) {
        $hit = Get-ChildItem $r -Filter "jbr" -Recurse -Depth 4 -Directory -EA SilentlyContinue |
               Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } |
               Select-Object -First 1
        if ($hit) { $jdk = $hit.FullName; break }
    }
}

if ($jdk) {
    $env:JAVA_HOME = $jdk
    $env:Path = "$jdk\bin;$env:Path"
    [Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk, "User")
    Good "JAVA_HOME = $jdk"

    # Lock it inside the project so Gradle always finds it
    $gp = Join-Path $ProjectPath "android\gradle.properties"
    if (Test-Path $gp) {
        $gpText = Get-Content $gp -Raw
        if ($gpText -notmatch 'org\.gradle\.java\.home') {
            $esc = $jdk.Replace('\', '\\')
            Add-Content $gp "`norg.gradle.java.home=$esc"
            Good "locked into gradle.properties"
        }
        else {
            Say "already in gradle.properties"
        }
    }
}
else {
    Bad "Java not found - install Android Studio"
    exit 1
}

# ================================================
#  2. ANDROID SDK
# ================================================

Head "[2] Android SDK"

$sdk = $null
foreach ($c in @(
    $env:ANDROID_HOME,
    "D:\AndroidDev\.android",
    "$env:LOCALAPPDATA\Android\Sdk",
    "D:\AndroidDev\Sdk"
)) {
    if ($c -and (Test-Path "$c\platform-tools\adb.exe")) { $sdk = $c; break }
}

if (-not $sdk) {
    $hit = Get-ChildItem "C:\", "D:\" -Filter "adb.exe" -Recurse -Depth 5 -EA SilentlyContinue |
           Select-Object -First 1
    if ($hit) { $sdk = Split-Path (Split-Path $hit.FullName) }
}

if ($sdk) {
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    $env:Path += ";$sdk\platform-tools"
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
    [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdk, "User")
    Good "ANDROID_HOME = $sdk"

    # local.properties so Gradle finds the SDK
    $lp = Join-Path $ProjectPath "android\local.properties"
    "sdk.dir=" + $sdk.Replace('\', '\\') | Set-Content $lp
    Good "local.properties written"
}
else {
    Bad "Android SDK not found"
    exit 1
}

$adb = "$sdk\platform-tools\adb.exe"

# ================================================
#  3. DEVICE
# ================================================

Head "[3] Device"

$devLines = & $adb devices 2>$null
$connected = $devLines | Select-String -Pattern "\tdevice$"
$unauth    = $devLines | Select-String -Pattern "unauthorized"

if ($connected) {
    Good "$($connected.Count) device(s) connected"
}
elseif ($unauth) {
    Bad "device unauthorized - check phone screen and tap Allow"
    exit 1
}
else {
    Bad "no device - connect USB and enable USB Debugging"
    exit 1
}

# ================================================
#  4. PORT 8081 - the annoying one
# ================================================

Head "[4] Port 8081"

# Kill anything already holding 8081 on the PC
$busy = Get-NetTCPConnection -LocalPort 8081 -State Listen -EA SilentlyContinue
if ($busy) {
    $procId = $busy[0].OwningProcess
    $proc = Get-Process -Id $procId -EA SilentlyContinue
    if ($proc -and $proc.ProcessName -match "node") {
        Say "killing old Metro (PID $procId)"
        Stop-Process -Id $procId -Force -EA SilentlyContinue
        Start-Sleep -Milliseconds 800
    }
}

# The fix that must be repeated after every USB reconnect
& $adb reverse --remove-all 2>$null
$rev = & $adb reverse tcp:8081 tcp:8081 2>&1

if ($LASTEXITCODE -eq 0) {
    Good "adb reverse tcp:8081 -> OK"
}
else {
    Bad "adb reverse failed: $rev"
}

if ($PortOnly) {
    Write-Host ""
    Good "Port fixed. Now press Reload on the phone."
    Write-Host ""
    exit 0
}

# ================================================
#  5. BUILD
# ================================================

if (-not $SkipBuild) {
    Head "[5] Build"
    Say "this can take several minutes..."
    Write-Host ""

    Push-Location (Join-Path $ProjectPath "android")
    & .\gradlew installDebug
    $buildOk = ($LASTEXITCODE -eq 0)
    Pop-Location

    Write-Host ""
    if ($buildOk) {
        Good "build + install succeeded"
    }
    else {
        Bad "build failed - see errors above"
        Write-Host ""
        Say "If it says INSTALL_FAILED_USER_RESTRICTED:"
        Say "  Phone > Developer options > Install via USB  = ON"
        Say "  Phone > Developer options > Verify apps over USB = OFF"
        exit 1
    }

    # reverse again - installing can reset it
    & $adb reverse tcp:8081 tcp:8081 2>$null | Out-Null
}

# ================================================
#  6. METRO
# ================================================

Head "[6] Metro"
Say "starting dev server - keep this window open"
Say "press Ctrl+C to stop"
Write-Host ""
Write-Host "  If the app shows a red screen, open a NEW window and run:" -ForegroundColor Yellow
Write-Host "    .\run.ps1 -PortOnly" -ForegroundColor Gray
Write-Host ""

Set-Location $ProjectPath
& npx react-native start

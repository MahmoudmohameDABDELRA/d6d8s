<#
================================================================
  Pre-Build Check
================================================================
  Checks everything that can break an Android build,
  BEFORE wasting 10 minutes on a failed build.

  Usage:
    .\precheck.ps1
    .\precheck.ps1 -ProjectPath "C:\bbbb\ClanApp"
================================================================
#>

param(
    [string]$ProjectPath = "C:\bbbb\ClanApp"
)

$pass = 0
$warn = 0
$fail = 0
$blockers = @()
$fixes = @()

function Test-Item {
    param(
        [string]$Name,
        [string]$Status,   # PASS / WARN / FAIL
        [string]$Detail,
        [string]$Fix = ""
    )

    $color = switch ($Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }

    $mark = switch ($Status) {
        "PASS" { "[ OK ]" }
        "WARN" { "[ !! ]" }
        "FAIL" { "[FAIL]" }
    }

    Write-Host ("{0} {1,-26} {2}" -f $mark, $Name, $Detail) -ForegroundColor $color

    switch ($Status) {
        "PASS" { $script:pass++ }
        "WARN" { $script:warn++; if ($Fix) { $script:fixes += $Fix } }
        "FAIL" { $script:fail++; $script:blockers += $Name; if ($Fix) { $script:fixes += $Fix } }
    }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor White
Write-Host "  PRE-BUILD CHECK" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor White
Write-Host ""

# ================================================
#  1. DISK SPACE - most common blocker
# ================================================

Write-Host "-- Disk --" -ForegroundColor Cyan

$freeGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)

if ($freeGB -ge 12) {
    Test-Item "Free space" "PASS" "$freeGB GB"
}
elseif ($freeGB -ge 8) {
    Test-Item "Free space" "WARN" "$freeGB GB (10+ recommended)" "powercfg /h off"
}
else {
    Test-Item "Free space" "FAIL" "$freeGB GB - build WILL fail" "Run as admin: powercfg /h off"
}

# Hibernation file - easy 4-8 GB win
$hiberPath = "C:\hiberfil.sys"
$hiber = Get-Item $hiberPath -Force -ErrorAction SilentlyContinue
if ($hiber) {
    $hiberGB = [math]::Round($hiber.Length / 1GB, 1)
    Test-Item "Hibernation file" "WARN" "$hiberGB GB wasted" "Run as admin: powercfg /h off"
}
else {
    Test-Item "Hibernation file" "PASS" "disabled"
}

Write-Host ""

# ================================================
#  2. JAVA
# ================================================

Write-Host "-- Java --" -ForegroundColor Cyan

$jdkCandidates = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\Android\Android Studio\jre",
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
    "$env:LOCALAPPDATA\Programs\Android Studio\jre"
)

$jdkPath = $null
foreach ($c in $jdkCandidates) {
    if (Test-Path "$c\bin\java.exe") { $jdkPath = $c; break }
}

if ($jdkPath) {
    $verOutput = & "$jdkPath\bin\java.exe" -version 2>&1 | Out-String
    $major = 0
    if ($verOutput -match '"(\d+)') { $major = [int]$Matches[1] }
    elseif ($verOutput -match '"1\.(\d+)') { $major = [int]$Matches[1] }

    if ($major -eq 17) {
        Test-Item "JDK version" "PASS" "Java $major (ideal)"
    }
    elseif ($major -ge 17 -and $major -le 20) {
        Test-Item "JDK version" "PASS" "Java $major (supported)"
    }
    elseif ($major -gt 20) {
        Test-Item "JDK version" "WARN" "Java $major (17 recommended)" ""
    }
    else {
        Test-Item "JDK version" "FAIL" "Java $major too old" "Install JDK 17"
    }

    if ($env:JAVA_HOME) {
        Test-Item "JAVA_HOME" "PASS" "set"
    }
    else {
        Test-Item "JAVA_HOME" "FAIL" "not set" "[Environment]::SetEnvironmentVariable('JAVA_HOME','$jdkPath','User')"
    }
}
else {
    Test-Item "JDK" "FAIL" "not found" "Install Android Studio"
}

Write-Host ""

# ================================================
#  3. ANDROID SDK
# ================================================

Write-Host "-- Android SDK --" -ForegroundColor Cyan

$sdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }

if (Test-Path $sdkPath) {
    Test-Item "SDK folder" "PASS" $sdkPath

    if ($env:ANDROID_HOME) {
        Test-Item "ANDROID_HOME" "PASS" "set"
    }
    else {
        Test-Item "ANDROID_HOME" "FAIL" "not set" "[Environment]::SetEnvironmentVariable('ANDROID_HOME','$sdkPath','User')"
    }

    # adb
    if (Test-Path "$sdkPath\platform-tools\adb.exe") {
        Test-Item "adb.exe" "PASS" "found"
    }
    else {
        Test-Item "adb.exe" "FAIL" "missing" "SDK Manager > SDK Tools > Android SDK Platform-Tools"
    }

    # Platform 36
    $platforms = Get-ChildItem "$sdkPath\platforms" -Directory -ErrorAction SilentlyContinue |
                 Select-Object -ExpandProperty Name
    if ($platforms -contains "android-36") {
        Test-Item "Platform android-36" "PASS" "installed"
    }
    else {
        $have = if ($platforms) { $platforms -join ", " } else { "none" }
        Test-Item "Platform android-36" "FAIL" "missing (have: $have)" "SDK Manager > Android 16 (API 36)"
    }

    # Build tools
    $bt = Get-ChildItem "$sdkPath\build-tools" -Directory -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty Name
    if ($bt) {
        Test-Item "Build tools" "PASS" ($bt | Select-Object -Last 1)
    }
    else {
        Test-Item "Build tools" "FAIL" "missing" "SDK Manager > SDK Tools > Android SDK Build-Tools"
    }

    # NDK - only needed by some libraries
    if (Test-Path "$sdkPath\ndk") {
        Test-Item "NDK" "PASS" "installed"
    }
    else {
        Test-Item "NDK" "WARN" "missing (usually fine)" ""
    }
}
else {
    Test-Item "Android SDK" "FAIL" "not found" "Open Android Studio once"
}

Write-Host ""

# ================================================
#  4. NODE
# ================================================

Write-Host "-- Node --" -ForegroundColor Cyan

$nodeVer = (& node --version 2>$null)
if ($nodeVer) {
    $nodeMajor = [int]($nodeVer -replace 'v(\d+).*','$1')
    if ($nodeMajor -ge 20) {
        Test-Item "Node.js" "PASS" $nodeVer
    }
    else {
        Test-Item "Node.js" "FAIL" "$nodeVer (need 20+)" "Install Node 20 LTS"
    }
}
else {
    Test-Item "Node.js" "FAIL" "not found" "Install Node 20 LTS"
}

Write-Host ""

# ================================================
#  5. PROJECT
# ================================================

Write-Host "-- Project --" -ForegroundColor Cyan

if (-not (Test-Path $ProjectPath)) {
    Test-Item "Project folder" "FAIL" "not found: $ProjectPath" ""
}
else {
    Test-Item "Project folder" "PASS" $ProjectPath

    # node_modules
    $nm = Join-Path $ProjectPath "node_modules"
    if (Test-Path $nm) {
        Test-Item "node_modules" "PASS" "present"
    }
    else {
        Test-Item "node_modules" "FAIL" "missing" "cd `"$ProjectPath`"; npm install"
    }

    # async-storage - the one required package
    $asyncStorage = Join-Path $nm "@react-native-async-storage\async-storage"
    if (Test-Path $asyncStorage) {
        Test-Item "async-storage" "PASS" "installed"
    }
    else {
        Test-Item "async-storage" "FAIL" "missing" "npm install @react-native-async-storage/async-storage"
    }

    # local.properties
    $localProps = Join-Path $ProjectPath "android\local.properties"
    if (Test-Path $localProps) {
        Test-Item "local.properties" "PASS" "present"
    }
    else {
        Test-Item "local.properties" "WARN" "missing (usually auto)" ""
    }

    # Gradle wrapper version
    $wrapper = Join-Path $ProjectPath "android\gradle\wrapper\gradle-wrapper.properties"
    if (Test-Path $wrapper) {
        $wText = Get-Content $wrapper -Raw
        if ($wText -match 'gradle-([\d.]+)-') {
            $gv = $Matches[1]
            Test-Item "Gradle version" "PASS" $gv
        }
    }

    # foojay fix - the IBM_SEMERU bug
    $foojay = Join-Path $nm "@react-native\gradle-plugin\settings.gradle.kts"
    if (Test-Path $foojay) {
        $fText = Get-Content $foojay -Raw
        if ($fText -match 'foojay-resolver-convention"\)[\s\.]*version\("?([\d.]+)') {
            $fv = $Matches[1]
            if ($fv -eq "0.5.0") {
                Test-Item "foojay plugin" "FAIL" "$fv (IBM_SEMERU bug)" "See fix below"
            }
            else {
                Test-Item "foojay plugin" "PASS" $fv
            }
        }
    }

    # Kotlin alarm files
    $alarmKt = Get-ChildItem (Join-Path $ProjectPath "android\app\src\main\java") -Recurse -Filter "Alarm*.kt" -ErrorAction SilentlyContinue
    if ($alarmKt.Count -eq 8) {
        Test-Item "Alarm Kotlin files" "PASS" "8 files"
    }
    elseif ($alarmKt.Count -gt 0) {
        Test-Item "Alarm Kotlin files" "WARN" "$($alarmKt.Count) of 8" "Re-run install.ps1"
    }
    else {
        Test-Item "Alarm Kotlin files" "FAIL" "missing" "Run install.ps1"
    }

    # JS files
    $alarmJs = Get-ChildItem (Join-Path $ProjectPath "src\alarm") -Filter "*.js" -ErrorAction SilentlyContinue
    if ($alarmJs.Count -ge 4) {
        Test-Item "Alarm JS files" "PASS" "$($alarmJs.Count) files"
    }
    else {
        Test-Item "Alarm JS files" "FAIL" "missing" "Run install.ps1"
    }

    # App entry - must be exactly one
    $appTsx = Test-Path (Join-Path $ProjectPath "App.tsx")
    $appJs  = Test-Path (Join-Path $ProjectPath "App.js")

    if ($appTsx -and $appJs) {
        Test-Item "App entry" "FAIL" "BOTH App.tsx and App.js exist" "Delete one of them"
    }
    elseif ($appTsx -or $appJs) {
        $which = if ($appTsx) { "App.tsx" } else { "App.js" }
        Test-Item "App entry" "PASS" $which
    }
    else {
        Test-Item "App entry" "FAIL" "no App file" ""
    }
}

Write-Host ""

# ================================================
#  6. DEVICE
# ================================================

Write-Host "-- Device --" -ForegroundColor Cyan

if (Test-Path "$sdkPath\platform-tools\adb.exe") {
    $devices = & "$sdkPath\platform-tools\adb.exe" devices 2>$null |
               Select-String -Pattern "\tdevice$"

    if ($devices) {
        Test-Item "Connected device" "PASS" "$($devices.Count) found"
    }
    else {
        $unauth = & "$sdkPath\platform-tools\adb.exe" devices 2>$null |
                  Select-String -Pattern "unauthorized"
        if ($unauth) {
            Test-Item "Connected device" "FAIL" "unauthorized" "Check phone screen - tap Allow"
        }
        else {
            Test-Item "Connected device" "FAIL" "none" "Connect USB + enable USB Debugging"
        }
    }
}

Write-Host ""

# ================================================
#  SUMMARY
# ================================================

Write-Host "==================================================" -ForegroundColor White
Write-Host ("  PASS: {0}   WARN: {1}   FAIL: {2}" -f $pass, $warn, $fail) -ForegroundColor White
Write-Host "==================================================" -ForegroundColor White
Write-Host ""

if ($fail -eq 0) {
    Write-Host "  READY TO BUILD" -ForegroundColor Green
    Write-Host ""
    Write-Host "  cd `"$ProjectPath\android`"" -ForegroundColor Gray
    Write-Host "  .\gradlew installDebug" -ForegroundColor Gray
}
else {
    Write-Host "  BLOCKERS - fix these first:" -ForegroundColor Red
    foreach ($b in $blockers) {
        Write-Host "    - $b" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  Suggested fixes:" -ForegroundColor Yellow
    foreach ($f in ($fixes | Select-Object -Unique)) {
        Write-Host "    $f" -ForegroundColor Gray
    }
}

Write-Host ""

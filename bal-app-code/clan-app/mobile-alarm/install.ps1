<#
================================================================
  Clan Alarm - Installer
================================================================

  Copies the alarm module into a React Native project
  and wires it up automatically.

  Usage:
    .\install.ps1 -ProjectPath "C:\bbbb\ClanApp"

  Preview without changing anything:
    .\install.ps1 -ProjectPath "C:\bbbb\ClanApp" -DryRun

  Notes:
    - Creates a .backup copy of every file it edits
    - Safe to run twice (detects existing changes)
    - English only: Windows PowerShell 5.1 cannot read UTF-8
      script files reliably, so Arabic text would break parsing
================================================================
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$script:StepNumber = 0
$script:Changes = @()
$script:Problems = @()

function Write-Step {
    param([string]$Text)
    $script:StepNumber++
    Write-Host ""
    Write-Host "[$script:StepNumber] $Text" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Text)
    Write-Host "    OK    $Text" -ForegroundColor Green
}

function Write-Skip {
    param([string]$Text)
    Write-Host "    --    $Text" -ForegroundColor DarkGray
}

function Write-Warn2 {
    param([string]$Text)
    Write-Host "    !     $Text" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Text)
    Write-Host "    FAIL  $Text" -ForegroundColor Red
}

function Backup-File {
    param([string]$Path)
    if ($DryRun) { return }

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
    $backup = $Path + ".backup"
    if (-not (Test-Path $backup)) {
        Copy-Item $Path $backup
    }
}

# ================================================
#  Header
# ================================================

Write-Host ""
Write-Host "==================================================" -ForegroundColor White
Write-Host "  Clan Alarm Installer" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor White

if ($DryRun) {
    Write-Host ""
    Write-Host "  DRY RUN - nothing will be modified" -ForegroundColor Yellow
}

$SourceDir = $PSScriptRoot

# ================================================
#  1. Validate project
# ================================================

Write-Step "Checking project"

if (-not (Test-Path $ProjectPath)) {
    Write-Fail "Path not found: $ProjectPath"
    Write-Host ""
    Write-Host "    Create the project first:" -ForegroundColor Yellow
    Write-Host "    cd C:\bbbb" -ForegroundColor White
    Write-Host "    npx @react-native-community/cli@latest init ClanApp --version 0.83.10" -ForegroundColor White
    exit 1
}
Write-Ok "Project: $ProjectPath"

$pkgJson = Join-Path $ProjectPath "package.json"
if (-not (Test-Path $pkgJson)) {
    Write-Fail "No package.json - this is not a React Native project"
    exit 1
}

$pkg = Read-Utf8 $pkgJson | ConvertFrom-Json
$rnVersion = $pkg.dependencies.'react-native'
if (-not $rnVersion) {
    Write-Fail "package.json has no react-native dependency"
    exit 1
}
Write-Ok "React Native $rnVersion"

$AndroidDir = Join-Path $ProjectPath "android"
$HasAndroid = Test-Path $AndroidDir
$IosDir = Join-Path $ProjectPath "ios"
$HasIos = Test-Path $IosDir

if ($HasAndroid) { Write-Ok "android folder found" }
else { Write-Warn2 "android folder missing - will skip" }

if ($HasIos) { Write-Ok "ios folder found" }
else { Write-Warn2 "ios folder missing - will skip" }

if ((-not $HasAndroid) -and (-not $HasIos)) {
    Write-Fail "Neither android nor ios found - nothing to install"
    exit 1
}

# ================================================
#  2. Detect package name
# ================================================

$PackageName = $null
$AlarmPackage = $null
$gradleFile = $null
$kotlinDest = $null
$mainAppPath = $null

if ($HasAndroid) {
    Write-Step "Detecting package name"

    $bg1 = Join-Path $AndroidDir "app\build.gradle"
    $bg2 = Join-Path $AndroidDir "app\build.gradle.kts"

    if (Test-Path $bg1) { $gradleFile = $bg1 }
    elseif (Test-Path $bg2) { $gradleFile = $bg2 }

    if (-not $gradleFile) {
        Write-Fail "Cannot find android\app\build.gradle"
        exit 1
    }

    $gradleText = Read-Utf8 $gradleFile

    if ($gradleText -match 'applicationId\s+["'']([^"'']+)["'']') {
        $PackageName = $Matches[1]
    }
    elseif ($gradleText -match 'namespace\s+["'']([^"'']+)["'']') {
        $PackageName = $Matches[1]
    }

    if (-not $PackageName) {
        Write-Fail "Cannot read applicationId from build.gradle"
        exit 1
    }

    $AlarmPackage = "$PackageName.alarm"
    Write-Ok "App package:   $PackageName"
    Write-Ok "Alarm package: $AlarmPackage"
}

# ================================================
#  3. Copy Kotlin files
# ================================================

if ($HasAndroid) {
    Write-Step "Copying Kotlin files"

    $kotlinSource = Join-Path $SourceDir "android\java\com\clanapp\alarm"

    if (-not (Test-Path $kotlinSource)) {
        Write-Fail "Kotlin source not found: $kotlinSource"
        exit 1
    }

    $packagePath = $AlarmPackage -replace '\.', '\'
    $kotlinDest = Join-Path $AndroidDir "app\src\main\java\$packagePath"

    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path $kotlinDest | Out-Null
    }
    Write-Ok "Target: $kotlinDest"

    $ktFiles = Get-ChildItem (Join-Path $kotlinSource "*.kt")

    foreach ($f in $ktFiles) {
        $content = Read-Utf8 $f.FullName

        # Two separate replacements, in this order:
        #   1. the alarm package  com.clanapp.alarm -> <app>.alarm
        #   2. the R import       com.clanapp.R     -> <app>.R
        # R lives in the app package, not the alarm sub-package.
        if ($AlarmPackage -ne "com.clanapp.alarm") {
            $content = $content -replace 'com\.clanapp\.alarm', $AlarmPackage
        }
        if ($PackageName -ne "com.clanapp") {
            $content = $content -replace 'import com\.clanapp\.R', "import $PackageName.R"
        }

        $target = Join-Path $kotlinDest $f.Name
        if (-not $DryRun) {
            Write-Utf8 $target $content
        }
        Write-Ok $f.Name
    }

    Write-Ok "$($ktFiles.Count) Kotlin files"

    # ---- string resources ----
    # Arabic text lives here, not inside .kt files.
    # XML resources declare their own encoding so Android always
    # reads them as UTF-8 - they cannot be corrupted by a script.
    $resSource = Join-Path $SourceDir "android\res\values"
    if (Test-Path $resSource) {
        $resDest = Join-Path $AndroidDir "app\src\main\res\values"
        if (-not $DryRun) {
            New-Item -ItemType Directory -Force -Path $resDest | Out-Null
        }
        foreach ($r in Get-ChildItem (Join-Path $resSource "*.xml")) {
            if (-not $DryRun) {
                Copy-Item $r.FullName (Join-Path $resDest $r.Name) -Force
            }
            Write-Ok "res/values/$($r.Name)"
        }
    }
}

# ================================================
#  4. Copy JavaScript files
# ================================================

Write-Step "Copying JavaScript files"

$jsSource = Join-Path $SourceDir "js"
$jsDest = Join-Path $ProjectPath "src\alarm"

if (-not (Test-Path $jsSource)) {
    Write-Fail "JS source not found: $jsSource"
    exit 1
}

if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $jsDest | Out-Null
}

$jsFiles = Get-ChildItem (Join-Path $jsSource "*.js")
foreach ($f in $jsFiles) {
    if (-not $DryRun) {
        Copy-Item $f.FullName (Join-Path $jsDest $f.Name) -Force
    }
    Write-Ok $f.Name
}
Write-Ok "Target: src\alarm\"

# ================================================
#  5. Copy Swift files
# ================================================

if ($HasIos) {
    Write-Step "Copying Swift files"

    $iosDest = Join-Path $IosDir $pkg.name

    if (-not (Test-Path $iosDest)) {
        $candidate = Get-ChildItem $IosDir -Directory -ErrorAction SilentlyContinue |
            Where-Object { Test-Path (Join-Path $_.FullName "AppDelegate.swift") } |
            Select-Object -First 1
        if ($candidate) { $iosDest = $candidate.FullName }
    }

    if (Test-Path $iosDest) {
        $swiftSource = Join-Path $SourceDir "ios"
        foreach ($n in @("ClanAlarmBridge.swift", "ClanAlarmBridge.m")) {
            $src = Join-Path $swiftSource $n
            if (Test-Path $src) {
                if (-not $DryRun) {
                    Copy-Item $src (Join-Path $iosDest $n) -Force
                }
                Write-Ok $n
            }
        }
        Write-Ok "Target: $iosDest"
        Write-Warn2 "You must add these in Xcode: File > Add Files"
    }
    else {
        Write-Warn2 "Cannot locate app folder inside ios - copy manually"
    }
}

# ================================================
#  6. Gradle dependency
# ================================================

if ($HasAndroid) {
    Write-Step "Adding Gradle dependency"

    $gradleText = Read-Utf8 $gradleFile

    if ($gradleText -match 'localbroadcastmanager') {
        Write-Skip "Already present"
    }
    else {
        $dep = '    implementation "androidx.localbroadcastmanager:localbroadcastmanager:1.1.0"'
        $idx = $gradleText.IndexOf("dependencies {")

        if ($idx -lt 0) {
            Write-Fail "Cannot find dependencies block"
            Write-Warn2 "Add manually: $dep"
            $script:Problems += "Gradle dependency not added"
        }
        else {
            Backup-File $gradleFile
            $insertAt = $gradleText.IndexOf("`n", $idx) + 1
            $newText = $gradleText.Substring(0, $insertAt) + $dep + "`r`n" + $gradleText.Substring($insertAt)

            if (-not $DryRun) {
                Write-Utf8 $gradleFile $newText
            }
            Write-Ok "localbroadcastmanager 1.1.0"
            $script:Changes += "build.gradle"
        }
    }
}

# ================================================
#  7. Register AlarmPackage
# ================================================

if ($HasAndroid) {
    Write-Step "Registering AlarmPackage"

    $mainAppPath = Join-Path $AndroidDir "app\src\main\java\$($PackageName -replace '\.', '\')\MainApplication.kt"

    if (-not (Test-Path $mainAppPath)) {
        $searchRoot = Join-Path $AndroidDir "app\src\main\java"
        $found = Get-ChildItem $searchRoot -Recurse -Filter "MainApplication.kt" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) { $mainAppPath = $found.FullName }
    }

    if (-not (Test-Path $mainAppPath)) {
        Write-Fail "MainApplication.kt not found"
        $script:Problems += "AlarmPackage not registered"
    }
    else {
        $mainText = Read-Utf8 $mainAppPath

        if ($mainText -match 'AlarmPackage') {
            Write-Skip "Already registered"
        }
        else {
            Backup-File $mainAppPath

            $importLine = "import $AlarmPackage.AlarmPackage"
            $lines = [regex]::Split($mainText, "\r?\n")
            $lastImport = -1
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i] -match '^import ') { $lastImport = $i }
            }

            if ($lastImport -ge 0) {
                $newLines = New-Object System.Collections.ArrayList
                for ($i = 0; $i -lt $lines.Count; $i++) {
                    [void]$newLines.Add($lines[$i])
                    if ($i -eq $lastImport) { [void]$newLines.Add($importLine) }
                }
                $mainText = $newLines -join "`r`n"
                Write-Ok "Added: $importLine"
            }

            $marker = "// add(MyReactNativePackage())"
            $addLine = "              add(AlarmPackage())"

            if ($mainText.Contains($marker)) {
                $mainText = $mainText.Replace($marker, $marker + "`r`n" + $addLine)
                Write-Ok "Added: add(AlarmPackage())"
            }
            elseif ($mainText -match 'PackageList\(this\)\.packages\.apply\s*\{') {
                $mainText = $mainText -replace '(PackageList\(this\)\.packages\.apply\s*\{)', "`$1`r`n$addLine"
                Write-Ok "Added: add(AlarmPackage())"
            }
            elseif ($mainText -match 'PackageList\(this\)\.packages') {
                $mainText = $mainText -replace '(PackageList\(this\)\.packages)', '$1.apply { add(AlarmPackage()) }'
                Write-Ok "Added: .apply { add(AlarmPackage()) }"
            }
            else {
                Write-Warn2 "Could not insert add(AlarmPackage) - do it manually"
                $script:Problems += "add(AlarmPackage) not inserted"
            }

            if (-not $DryRun) {
                Write-Utf8 $mainAppPath $mainText
            }
            $script:Changes += "MainApplication.kt"
        }
    }
}

# ================================================
#  8. Register alarm screen in index.js
# ================================================

Write-Step "Registering alarm screen"

# The alarm screen is now pure Kotlin - no React registration needed.
# This is intentional: a React screen kept stale state between alarms,
# showing yesterday's already-solved problem. Verified on a real device.

Write-Skip "Alarm screen is native Kotlin - nothing to register"

# Clean up registration from older versions of this installer
$indexPath = Join-Path $ProjectPath "index.js"
if (-not (Test-Path $indexPath)) {
    $alt = Join-Path $ProjectPath "index.tsx"
    if (Test-Path $alt) { $indexPath = $alt }
}

if (Test-Path $indexPath) {
    $indexText = Read-Utf8 $indexPath

    if ($indexText -match 'ClanAlarmScreen') {
        Backup-File $indexPath

        # Split on real newlines. Using a regex here avoids the
        # backtick-escape trap that once wrote a literal "\r\n"
        # into index.js and broke the Metro bundler.
        $lines = [regex]::Split($indexText, "\r?\n")

        $kept = $lines | Where-Object {
            $_ -notmatch 'ClanAlarmScreen' -and
            $_ -notmatch "AlarmScreen from './src/alarm/AlarmScreen'" -and
            $_ -notmatch 'name must match getMainComponentName'
        }

        $cleaned = ($kept -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine

        if (-not $DryRun) {
            Write-Utf8 $indexPath $cleaned
        }
        Write-Ok "removed old React registration from index.js"
        $script:Changes += "index.js"
    }
}

# ================================================
#  9. AndroidManifest.xml
# ================================================

$manifestPath = $null

if ($HasAndroid) {
    Write-Step "Updating AndroidManifest.xml"

    $manifestPath = Join-Path $AndroidDir "app\src\main\AndroidManifest.xml"

    if (-not (Test-Path $manifestPath)) {
        Write-Fail "AndroidManifest.xml not found"
        $script:Problems += "Manifest not updated"
    }
    else {
        $mfText = Read-Utf8 $manifestPath

        if ($mfText -match 'USE_EXACT_ALARM') {
            Write-Skip "Already updated"
        }
        else {
            Backup-File $manifestPath

            $perms = @"
    <!-- Alarm permissions -->
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <uses-permission android:name="android.permission.TURN_SCREEN_ON" />
    <uses-permission android:name="android.permission.DISABLE_KEYGUARD" />


"@

            $appTag = "<application"
            $appIdx = $mfText.IndexOf($appTag)

            if ($appIdx -lt 0) {
                Write-Fail "Cannot find application tag"
                $script:Problems += "Manifest permissions not added"
            }
            else {
                $mfText = $mfText.Substring(0, $appIdx) + $perms + $mfText.Substring($appIdx)
                Write-Ok "12 permissions"

                $fireAction    = "$AlarmPackage.ACTION_FIRE"
                $dismissAction = "$AlarmPackage.ACTION_DISMISS"
                $snoozeAction  = "$AlarmPackage.ACTION_SNOOZE"

                $fgsDescription = "Alarm clock that plays audio and shows a full-screen wake-up challenge at the exact time chosen by the user, including while the device is idle or locked."

                $components = @"

        <!-- Alarm components -->
        <activity
            android:name="$AlarmPackage.AlarmActivity"
            android:exported="false"
            android:launchMode="singleInstance"
            android:taskAffinity=""
            android:excludeFromRecents="true"
            android:showOnLockScreen="true"
            android:turnScreenOn="true"
            android:showWhenLocked="true"
            android:screenOrientation="portrait"
            android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode"
            android:theme="@style/AppTheme"
            android:windowSoftInputMode="adjustResize" />

        <service
            android:name="$AlarmPackage.AlarmRingService"
            android:exported="false"
            android:stopWithTask="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="$fgsDescription" />
        </service>

        <receiver
            android:name="$AlarmPackage.AlarmReceiver"
            android:exported="true"
            android:directBootAware="true"
            android:enabled="true">
            <intent-filter android:priority="1000">
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <action android:name="com.htc.intent.action.QUICKBOOT_POWERON" />
            </intent-filter>
            <intent-filter android:priority="1000">
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
                <action android:name="android.intent.action.TIME_SET" />
                <action android:name="android.intent.action.DATE_CHANGED" />
            </intent-filter>
            <intent-filter>
                <action android:name="$fireAction" />
                <action android:name="$dismissAction" />
                <action android:name="$snoozeAction" />
            </intent-filter>
        </receiver>

"@

                $closeTag = "</application>"
                $closeIdx = $mfText.LastIndexOf($closeTag)

                if ($closeIdx -lt 0) {
                    Write-Fail "Cannot find closing application tag"
                    $script:Problems += "Manifest components not added"
                }
                else {
                    $mfText = $mfText.Substring(0, $closeIdx) + $components + $mfText.Substring($closeIdx)
                    Write-Ok "activity + service + receiver"

                    if (-not $DryRun) {
                        Write-Utf8 $manifestPath $mfText
                    }
                    $script:Changes += "AndroidManifest.xml"
                }
            }
        }
    }
}

# ================================================
#  10. Verification
# ================================================

if ($HasAndroid -and (-not $DryRun)) {
    Write-Step "Verifying"

    # a) Broadcast action names must match between code and manifest.
    #    If they differ the alarm silently never rings - worst possible bug.
    $contractPath = Join-Path $kotlinDest "AlarmContract.kt"

    if ((Test-Path $contractPath) -and (Test-Path $manifestPath)) {
        $contractText = Read-Utf8 $contractPath
        $mfCheck = Read-Utf8 $manifestPath

        $broadcasts = @()
        $pattern1 = 'ACTION_ALARM_(?:FIRE|DISMISS|SNOOZE)\s*=\s*"([^"]+)"'
        foreach ($m in [regex]::Matches($contractText, $pattern1)) {
            $broadcasts += $m.Groups[1].Value
        }

        $listens = @()
        $pattern2 = 'android:name="([^"]*\.ACTION_(?:FIRE|DISMISS|SNOOZE))"'
        foreach ($m in [regex]::Matches($mfCheck, $pattern2)) {
            $listens += $m.Groups[1].Value
        }

        $missing = @()
        foreach ($b in $broadcasts) {
            if ($listens -notcontains $b) { $missing += $b }
        }

        if ($missing.Count -gt 0) {
            Write-Fail "Action name mismatch - alarm will NEVER ring"
            foreach ($x in $missing) {
                Write-Host "          missing: $x" -ForegroundColor Red
            }
            $script:Problems += "Action names do not match"
        }
        else {
            Write-Ok "Action names match ($($broadcasts.Count))"
        }
    }

    # b) Kotlin package declaration must match folder path
    if ($kotlinDest -and (Test-Path $kotlinDest)) {
        $ktCheck = Get-ChildItem (Join-Path $kotlinDest "*.kt") -ErrorAction SilentlyContinue
        $pathOk = $true

        foreach ($f in $ktCheck) {
            $firstLine = Read-Utf8FirstLine $f.FullName
            if ($firstLine -match '^package\s+(.+)$') {
                $declared = $Matches[1].Trim()
                if ($declared -ne $AlarmPackage) {
                    $pathOk = $false
                    Write-Fail "$($f.Name): package is $declared expected $AlarmPackage"
                    $script:Problems += "Package mismatch in $($f.Name)"
                }
            }
        }

        if ($pathOk) {
            Write-Ok "Kotlin package matches path ($($ktCheck.Count) files)"
        }
    }

    # c) Manifest must be valid XML
    if ($manifestPath -and (Test-Path $manifestPath)) {
        $xmlOk = $true
        try {
            $xmlCheck = New-Object System.Xml.XmlDocument
            $xmlCheck.Load($manifestPath)
        }
        catch {
            $xmlOk = $false
        }

        if ($xmlOk) {
            Write-Ok "AndroidManifest.xml is valid XML"
        }
        else {
            Write-Fail "AndroidManifest.xml is broken"
            Write-Warn2 "Restore from AndroidManifest.xml.backup"
            $script:Problems += "Manifest is invalid XML"
        }
    }

    # d) No duplicated registration
    if ($mainAppPath -and (Test-Path $mainAppPath)) {
        $mainCheck = Read-Utf8 $mainAppPath
        $addCount = ([regex]::Matches($mainCheck, 'add\(AlarmPackage\(\)\)')).Count

        if ($addCount -gt 1) {
            Write-Fail "add(AlarmPackage) appears $addCount times"
            $script:Problems += "Duplicate registration"
        }
        elseif ($addCount -eq 1) {
            Write-Ok "AlarmPackage registered once"
        }
    }
}

# ================================================
#  Summary
# ================================================

Write-Host ""
Write-Host "==================================================" -ForegroundColor White

if ($script:Problems.Count -eq 0) {
    Write-Host "  DONE" -ForegroundColor Green
}
else {
    Write-Host "  DONE WITH $($script:Problems.Count) PROBLEM(S)" -ForegroundColor Yellow
}

Write-Host "==================================================" -ForegroundColor White
Write-Host ""

if ($DryRun) {
    Write-Host "  Dry run - nothing was changed" -ForegroundColor Yellow
    Write-Host "  Run again without -DryRun to apply" -ForegroundColor Yellow
    Write-Host ""
}
else {
    if ($script:Changes.Count -gt 0) {
        Write-Host "  Modified (each has a .backup):" -ForegroundColor White
        foreach ($c in $script:Changes) {
            Write-Host "    - $c" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

if ($script:Problems.Count -gt 0) {
    Write-Host "  Problems:" -ForegroundColor Yellow
    foreach ($p in $script:Problems) {
        Write-Host "    - $p" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1) Install the one required package:" -ForegroundColor White
Write-Host "     cd `"$ProjectPath`"" -ForegroundColor Gray
Write-Host "     npm install @react-native-async-storage/async-storage" -ForegroundColor Gray
Write-Host ""
Write-Host "  2) Replace App.tsx content with:" -ForegroundColor White
Write-Host "     import React from 'react';" -ForegroundColor Gray
Write-Host "     import TestScreen from './src/alarm/TestScreen';" -ForegroundColor Gray
Write-Host "     export default function App() { return <TestScreen />; }" -ForegroundColor Gray
Write-Host ""
Write-Host "  3) Build and run:" -ForegroundColor White
Write-Host "     npx react-native run-android" -ForegroundColor Gray
Write-Host ""

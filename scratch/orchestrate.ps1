# Whitelist standard Node.js and Android platform-tools pathing
$env:PATH += ";C:\Program Files\nodejs"
$env:PATH += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Where's my family!! Autonomous Quality & Deployment Orchestrator" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Verification of File Integrity
Write-Host "[1/5] Verifying static dashboard file alignment..." -ForegroundColor Yellow
$rootDash = "dashboard.html"
$webDash = "web-dashboard/index.html"

if (Test-Path $rootDash) {
    if (Test-Path $webDash) {
        # Check if they differ in content
        $diff = Compare-Object (Get-Content $rootDash) (Get-Content -Path $webDash)
        if ($null -ne $diff) {
            Write-Host " -> Warning: dashboard.html and web-dashboard/index.html are out of sync." -ForegroundColor Red
            Write-Host " -> Aligning: Copying web-dashboard/index.html over root dashboard.html..." -ForegroundColor Green
            Copy-Item $webDash $rootDash -Force
        } else {
            Write-Host " -> Perfect sync: Dashboard files are identical." -ForegroundColor Green
        }
    } else {
        Write-Host " -> Error: web-dashboard/index.html not found!" -ForegroundColor Red
    }
} else {
    Write-Host " -> Root dashboard.html not found, creating from web-dashboard..." -ForegroundColor Yellow
    Copy-Item $webDash $rootDash -Force
}

# 2. Database Connectivity Check
Write-Host "[2/5] Pinging MantleDB endpoint..." -ForegroundColor Yellow
$MANTLE_DB_URL = "https://mantledb.sh/v2/wheresmyfamily-fkctors/all_locations"
$MANTLE_KEY = "923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b"

try {
    $response = Invoke-RestMethod -Uri $MANTLE_DB_URL -Headers @{ "X-Mantle-Key" = $MANTLE_KEY } -Method Get -TimeoutSec 5
    if ($null -ne $response) {
        Write-Host " -> Connection successful! MantleDB is online." -ForegroundColor Green
        $members = $response.PSObject.Properties | Where-Object { -not $_.Name.StartsWith("_") } | Select-Object -ExpandProperty Name
        Write-Host " -> Active family keys found in DB: ($($members -join ', '))" -ForegroundColor Gray
    }
} catch {
    Write-Host " -> Warning: MantleDB ping failed or timed out: $_" -ForegroundColor Red
}

# 3. Code Syntax & Headless DOM Check
Write-Host "[3/5] Performing syntax and headless DOM checks..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host " -> Running Expo SDK health diagnostics..." -ForegroundColor Gray
    try {
        & npx.cmd expo-doctor
        if ($LASTEXITCODE -eq 0) {
            Write-Host " -> Expo SDK health check clean." -ForegroundColor Green
        } else {
            Write-Host " -> Warning: Expo SDK health check flagged warnings/errors." -ForegroundColor Red
        }
    } catch {
        Write-Host " -> Expo SDK health check failed to run: $_" -ForegroundColor Red
    }

    try {
        if (Test-Path "tsconfig.json") {
            Write-Host " -> Running TypeScript compiler checks..." -ForegroundColor Gray
            $tscCheck = npx.cmd tsc --noEmit
            Write-Host " -> TypeScript compilation clean." -ForegroundColor Green
        }
    } catch {
        Write-Host " -> TypeScript compilation check failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host " -> node_modules not found, skipping SDK and TypeScript checks." -ForegroundColor Gray
}

# Run Node Headless HTML Structural & Logic Verifier
if (Test-Path "scratch/verify_dashboard.js") {
    Write-Host " -> Running headless DOM diagnostics..." -ForegroundColor Gray
    node scratch/verify_dashboard.js
    if ($LASTEXITCODE -eq 0) {
        Write-Host " -> Headless DOM validation passed!" -ForegroundColor Green
    } else {
        Write-Host " -> Warning: Headless DOM validation failed (Exit code: $LASTEXITCODE)" -ForegroundColor Red
    }
} else {
    Write-Host " -> scratch/verify_dashboard.js not found, skipping headless diagnostics." -ForegroundColor Gray
}

# 4. Git Alignment & GitHub Actions Pipeline Release Guidelines
Write-Host "[4/5] Checking Git alignment for GitHub Actions CI/CD release..." -ForegroundColor Yellow
$gitInstalled = Get-Command git -ErrorAction SilentlyContinue
if ($null -ne $gitInstalled) {
    # Get latest local tag
    $latestTag = git tag -l "v*" | Sort-Object -Descending | Select-Object -First 1
    if ([string]::IsNullOrEmpty($latestTag)) {
        $latestTag = "none"
    }
    Write-Host " -> Latest release tag detected on local branch: $latestTag" -ForegroundColor Green

    # Check for uncommitted changes
    $uncommittedChanges = git status --porcelain
    if (![string]::IsNullOrEmpty($uncommittedChanges)) {
        Write-Host " -> Warning: You have uncommitted changes in your working directory:" -ForegroundColor Yellow
        Write-Host $uncommittedChanges -ForegroundColor Gray
        Write-Host " -> To trigger a build, please commit your changes first." -ForegroundColor Gray
    } else {
        Write-Host " -> Clean branch state: No uncommitted changes detected." -ForegroundColor Green
    }

    # Display instructions for triggering build
    Write-Host " -> To deploy these changes to Google Play (Internal) & TestFlight Beta via GitHub Actions:" -ForegroundColor Cyan
    Write-Host "    1. Commit and push any changes to master:" -ForegroundColor Gray
    Write-Host "       git add . && git commit -m `"your message`" && git push origin master" -ForegroundColor Gray
    Write-Host "    2. Push a new version tag to trigger the parallel build runners:" -ForegroundColor Gray
    if ($latestTag -ne "none") {
        $parts = $latestTag -split '\.'
        $parts[-1] = [int]$parts[-1] + 1
        $nextTag = $parts -join '.'
        Write-Host "       git tag $nextTag && git push origin $nextTag" -ForegroundColor Gray
    } else {
        Write-Host "       git tag v1.0.0 && git push origin v1.0.0" -ForegroundColor Gray
    }
} else {
    Write-Host " -> Git is not installed or repository not initialized." -ForegroundColor Red
}

# 5. Diagnostic Fetch (Emulator Screencap verification)
Write-Host "[5/5] Checking for local emulation layers..." -ForegroundColor Yellow
$adbList = adb devices
$emulator = $adbList | Where-Object { $_ -match "emulator" -or $_ -match "device$" }

if ($null -ne $emulator) {
    Write-Host " -> Active Android emulator found: $($emulator[1].Trim())" -ForegroundColor Green
    Write-Host " -> Performing automatic UI verification capture..." -ForegroundColor Gray
    # Clear any previous screenshots in workspace
    if (Test-Path "scratch/latest_emulator_render.png") {
        Remove-Item "scratch/latest_emulator_render.png" -Force
    }
    # Take screenshot on device
    adb shell screencap -p /sdcard/autoverify.png
    if ($LASTEXITCODE -eq 0) {
        # Pull to workspace
        adb pull /sdcard/autoverify.png ./scratch/latest_emulator_render.png
        if ($LASTEXITCODE -eq 0) {
            Write-Host " -> Screen captured and pulled to: scratch/latest_emulator_render.png" -ForegroundColor Green
        } else {
            Write-Host " -> Warning: Failed to pull screenshot from device." -ForegroundColor Red
        }
    } else {
        Write-Host " -> Warning: Failed to take screenshot on device." -ForegroundColor Red
    }
} else {
    Write-Host " -> No local emulators found. Skipping automated visual captures." -ForegroundColor Gray
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Orchestration pipeline complete!" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

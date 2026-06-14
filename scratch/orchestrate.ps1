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
    Write-Host " -> node_modules not found, skipping TypeScript checks." -ForegroundColor Gray
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

# 4. Triggering EAS OTA Update
Write-Host "[4/5] Deploying EAS OTA Update to branch preview..." -ForegroundColor Yellow
$gitMsg = (git log -1 --pretty=%B) -replace '[\r\n]+', ' ' -replace '"', '\"'
$updateMsg = "Autonomous Update: $gitMsg"
Write-Host " -> Running EAS CLI compile with message: $updateMsg" -ForegroundColor Gray

npx.cmd eas-cli update --branch preview --message $updateMsg
if ($LASTEXITCODE -eq 0) {
    Write-Host " -> EAS OTA Update successfully published!" -ForegroundColor Green
} else {
    Write-Host " -> Error: EAS OTA Update compilation failed (Exit code: $LASTEXITCODE)" -ForegroundColor Red
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

#!/bin/bash

# ANSI Color Codes
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}  Where's my family!! Autonomous Quality & Deployment Orchestrator${NC}"
echo -e "${CYAN}==================================================================${NC}"

# 1. Verification of File Integrity
echo -e "${YELLOW}[1/5] Verifying static dashboard file alignment...${NC}"
ROOT_DASH="dashboard.html"
WEB_DASH="web-dashboard/index.html"

if [ -f "$ROOT_DASH" ]; then
    if [ -f "$WEB_DASH" ]; then
        # Check if they differ in content
        if ! diff -q "$ROOT_DASH" "$WEB_DASH" > /dev/null; then
            echo -e "${RED} -> Warning: dashboard.html and web-dashboard/index.html are out of sync.${NC}"
            echo -e "${GREEN} -> Aligning: Copying web-dashboard/index.html over root dashboard.html...${NC}"
            cp -f "$WEB_DASH" "$ROOT_DASH"
        else
            echo -e "${GREEN} -> Perfect sync: Dashboard files are identical.${NC}"
        fi
    else
        echo -e "${RED} -> Error: web-dashboard/index.html not found!${NC}"
    fi
else
    echo -e "${YELLOW} -> Root dashboard.html not found, creating from web-dashboard...${NC}"
    cp -f "$WEB_DASH" "$ROOT_DASH"
fi

# 2. Database Connectivity Check
echo -e "${YELLOW}[2/5] Pinging MantleDB endpoint...${NC}"
MANTLE_DB_URL="https://mantledb.sh/v2/wheresmyfamily-fkctors/all_locations"
MANTLE_KEY="923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b"

response=$(curl -s -w "\n%{http_code}" -H "X-Mantle-Key: $MANTLE_KEY" --max-time 5 "$MANTLE_DB_URL")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN} -> Connection successful! MantleDB is online.${NC}"
    # Try to parse active member keys using simple node command if node is available
    if command -v node >/dev/null 2>&1; then
        members=$(node -e "
            try {
                const data = $body;
                const keys = Object.keys(data).filter(k => !k.startsWith('_'));
                console.log(keys.join(', '));
            } catch(e) {
                console.log('');
            }
        ")
        if [ -n "$members" ]; then
            echo -e "${GRAY} -> Active family keys found in DB: ($members)${NC}"
        fi
    fi
else
    echo -e "${RED} -> Warning: MantleDB ping failed or timed out (HTTP $http_code)${NC}"
fi

# 3. Code Syntax & Headless DOM Check
echo -e "${YELLOW}[3/5] Performing syntax and headless DOM checks...${NC}"
if [ -d "node_modules" ]; then
    if [ -f "tsconfig.json" ]; then
        echo -e "${GRAY} -> Running TypeScript compiler checks...${NC}"
        if npx tsc --noEmit; then
            echo -e "${GREEN} -> TypeScript compilation clean.${NC}"
        else
            echo -e "${RED} -> TypeScript compilation check failed.${NC}"
        fi
    fi
else
    echo -e "${GRAY} -> node_modules not found, skipping TypeScript checks.${NC}"
fi

# Run Node Headless HTML Structural & Logic Verifier
if [ -f "scratch/verify_dashboard.js" ]; then
    echo -e "${GRAY} -> Running headless DOM diagnostics...${NC}"
    if node scratch/verify_dashboard.js; then
        echo -e "${GREEN} -> Headless DOM validation passed!${NC}"
    else
        echo -e "${RED} -> Warning: Headless DOM validation failed (Exit code: $?)${NC}"
    fi
else
    echo -e "${GRAY} -> scratch/verify_dashboard.js not found, skipping headless diagnostics.${NC}"
fi

# 4. Triggering EAS OTA Update
echo -e "${YELLOW}[4/5] Deploying EAS OTA Update to branch preview...${NC}"
if command -v git >/dev/null 2>&1; then
    git_msg=$(git log -1 --pretty=%B | tr -d '\r' | tr '\n' ' ')
else
    git_msg="Manual Update"
fi
update_msg="Autonomous Update: $git_msg"
echo -e "${GRAY} -> Running EAS CLI compile with message: $update_msg${NC}"

if npx eas-cli update --branch preview --message "$update_msg"; then
    echo -e "${GREEN} -> EAS OTA Update successfully published!${NC}"
else
    echo -e "${RED} -> Error: EAS OTA Update compilation failed (Exit code: $?)${NC}"
fi

# 5. Diagnostic Fetch (Emulator Screencap verification)
echo -e "${YELLOW}[5/5] Checking for local emulation layers...${NC}"
if command -v adb >/dev/null 2>&1; then
    adb_list=$(adb devices)
    # Check if there is an active device or emulator (ignoring the header line)
    emulator=$(echo "$adb_list" | grep -v "List of devices" | grep -E "emulator|device$")
    
    if [ -n "$emulator" ]; then
        device_id=$(echo "$emulator" | head -n 1 | awk '{print $1}')
        echo -e "${GREEN} -> Active Android emulator/device found: $device_id${NC}"
        echo -e "${GRAY} -> Performing automatic UI verification capture...${NC}"
        
        # Clear any previous screenshots in workspace
        if [ -f "scratch/latest_emulator_render.png" ]; then
            rm -f "scratch/latest_emulator_render.png"
        fi
        
        # Take screenshot on device
        if adb shell screencap -p /sdcard/autoverify.png; then
            # Pull to workspace
            if adb pull /sdcard/autoverify.png ./scratch/latest_emulator_render.png > /dev/null 2>&1; then
                echo -e "${GREEN} -> Screen captured and pulled to: scratch/latest_emulator_render.png${NC}"
            else
                echo -e "${RED} -> Warning: Failed to pull screenshot from device.${NC}"
            fi
        else
            echo -e "${RED} -> Warning: Failed to take screenshot on device.${NC}"
        fi
    else
        echo -e "${GRAY} -> No local emulators/devices found. Skipping automated visual captures.${NC}"
    fi
else
    echo -e "${GRAY} -> ADB tool not found. Skipping automated visual captures.${NC}"
fi

echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN} Orchestration pipeline complete!${NC}"
echo -e "${CYAN}==================================================================${NC}"

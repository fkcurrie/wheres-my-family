/**
 * Headless Web Dashboard Structural & Logic Verifier
 * This script runs static checks on dashboard.html and web-dashboard/index.html
 * to ensure that CDN scripts, DOM structures, and GPS filtering functions are healthy.
 */

const fs = require('fs');
const path = require('path');

console.log("=================================================");
console.log("  Web Dashboard Headless Structural Diagnostics");
console.log("=================================================");

const rootDashPath = path.join(__dirname, '..', 'dashboard.html');
const webDashPath = path.join(__dirname, '..', 'web-dashboard', 'index.html');

let hasErrors = false;

// Helper to run assertions on file content
function verifyHTMLFile(filePath, label) {
  console.log(`\nChecking [${label}] located at: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(` ❌ Error: File does not exist!`);
    hasErrors = true;
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const size = content.length;
  console.log(` -> File size: ${size} bytes`);
  
  // 1. Tag balance checks
  const openDivs = (content.match(/<div/g) || []).length;
  const closeDivs = (content.match(/<\/div>/g) || []).length;
  console.log(` -> <div> check: Open (${openDivs}), Close (${closeDivs})`);
  if (openDivs !== closeDivs) {
    console.warn(` ⚠️ Warning: <div> count mismatch! Open ${openDivs} vs Close ${closeDivs}`);
  }

  const openScripts = (content.match(/<script/g) || []).length;
  const closeScripts = (content.match(/<\/script>/g) || []).length;
  console.log(` -> <script> check: Open (${openScripts}), Close (${closeScripts})`);
  if (openScripts !== closeScripts) {
    console.error(` ❌ Error: <script> tag mismatch! Open ${openScripts} vs Close ${closeScripts}`);
    hasErrors = true;
  }

  // 2. CDN Script Verification
  const criticalCDNs = [
    { name: 'MapLibre GL JS', pattern: /maplibre-gl\.js/ },
    { name: 'MapLibre GL CSS', pattern: /maplibre-gl\.css/ },
    { name: 'Google Fonts Link', pattern: /fonts\.googleapis\.com/ }
  ];

  console.log(" -> Verifying CDN Assets:");
  criticalCDNs.forEach(cdn => {
    if (cdn.pattern.test(content)) {
      console.log(`    ✅ Found ${cdn.name}`);
    } else {
      console.error(`    ❌ Error: Missing critical CDN dependency: ${cdn.name}`);
      hasErrors = true;
    }
  });

  // 3. Core Analytical Function Verification
  const requiredFunctions = [
    { name: 'parseTimestamp', pattern: /parseTimestamp/ },
    { name: 'cleanAndSortTrail', pattern: /cleanAndSortTrail/ },
    { name: 'getCoordinateTimestamp', pattern: /getCoordinateTimestamp/ },
    { name: 'getDistanceInMiles', pattern: /getDistanceInMiles/ },
    { name: 'updateMemberTrailOnMap', pattern: /updateMemberTrailOnMap/ }
  ];

  console.log(" -> Verifying Analytical & Filtering Logic:");
  requiredFunctions.forEach(fn => {
    if (fn.pattern.test(content)) {
      console.log(`    ✅ Found logic function: ${fn.name}`);
    } else {
      console.error(`    ❌ Error: Critical function [${fn.name}] is missing from JS body!`);
      hasErrors = true;
    }
  });

  return content;
}

// Check both files
const rootContent = verifyHTMLFile(rootDashPath, 'Root Dashboard');
const webContent = verifyHTMLFile(webDashPath, 'Vercel Web Dashboard');

// Compare files
if (rootContent && webContent) {
  console.log("\nComparing file sync integrity...");
  if (rootContent === webContent) {
    console.log(" ✅ Perfect Alignment! Both dashboard files are 100% identical.");
  } else {
    console.warn(" ⚠️ Drift Detected: dashboard.html and web-dashboard/index.html have content differences.");
    console.warn("    (The orchestrator will automatically resolve this on next run by copying the web dashboard over the root)");
  }
}

console.log("\n=================================================");
if (hasErrors) {
  console.log(" ❌ Verification failed. Fix outstanding issues before deploying!");
  process.exit(1);
} else {
  console.log(" ✅ All structural checks passed successfully!");
  process.exit(0);
}

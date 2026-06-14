# 📍 Where's my family!!

> **Enterprise-Grade Private Family Tracking & Diagnostics App**
> Built with Expo, TypeScript, React Native Maps, and EAS Workflows.

---

## 🚀 Overview

**Where's my family!!** is a secure, cross-platform location-sharing and tracking application designed for family circles. The application provides instant location visibility on a rich interactive map, status indicators (like battery levels, phone state, and relative distance), panic alarms, and persistent background location monitoring that survives device restarts.

This repository is integrated directly with **Expo Application Services (EAS)** for automated Quality Assurance and cloud-native builds (Android APKs and iOS IPAs).

---

## 🔗 Live Deployments & Quick Links

| Platform / Service | Type | Link |
| :--- | :---: | :--- |
| 🌐 **Live Web Dashboard** | Web App (Vercel) | [project-6eady.vercel.app](https://project-6eady.vercel.app/) |
| 🤖 **Android Standalone Client** | Standalone APK Build | [Download Latest Preview APK](https://expo.dev/artifacts/eas/hoQ03CQjd0l-DLhdww_Cp3dgMp1YxYDJUjWg-l1p4CY.apk) |
| 🍎 **iOS Standalone Client** | TestFlight Beta | [Join Apple TestFlight Beta](https://testflight.apple.com/join/6780024343) |
| ☁️ **EAS Project Console** | Cloud Platform Dashboard | [EAS wheres-my-family Dashboard](https://expo.dev/accounts/fkctor/projects/wheres-my-family) |

---

## ✨ Primary Features

### 🗺️ Live Family Dashboard
* **Dynamic Interactive Map**: Beautiful dark-mode maps showcasing your family members' positions, updated in real time.
* **Precise Family Status Cards**:
  * **🔋 Battery Tracker**: Real-time battery percentages and charging indicators.
  * **🛰️ Last-Seen Logs**: Precise relative distance calculation in miles using the Haversine formula and timestamps of the last received coordinates.
  * **📱 Device Activity**: Displays whether the phone is unlocked/active or locked.
* **📍 24H Location Trails (Time-Based Gradients & Snapped-to-Road)**: Visualize complete path histories of family members over the last 24 hours:
  * **Dynamic Color-Coding**: Trails fade dynamically from **Emerald Green** (representing the most recent locations) to **Vibrant Red** (approaching the 24-hour age limit) to instantly see where members were and when.
  * **Road-Snapping Routing Engine**: Uses the **OSRM (Open Source Routing Machine) Route & Match API** to automatically snap raw, noisy GPS coordinates to physical streets, footpaths, and highways, producing smooth, continuous, snapped paths instead of chaotic jagged lines.
  * **Smart Local Performance Cache**: Uses a mutable reference cache to guarantee that OSRM matches are only requested when members get *new* coordinates, completely avoiding redundant network calls.
  * **Lightweight Offline Fallback (RDP)**: Integrates a local client-side **Ramer-Douglas-Peucker (RDP)** simplification algorithm that acts as an instantaneous offline fallback, rendering a beautifully smoothed raw trail if network connection is lost.

### 🔄 Reboot-Resilient Background Tracking
* **Always-On Background Daemon**: Continues updating the backend database with high-accuracy coordinates even when minimized or fully closed.
* **Android Boot Receiver**: Autostarts on boot complete (`RECEIVE_BOOT_COMPLETED`) without requiring manual intervention.
* **iOS App Relaunch Support**: Wakes the app on significant location movements, preventing native OS terminations.

### 🔧 Premium Diagnostic & Triage Console
* **In-App Terminal**: Sliding neon-green terminal window displaying live log entries (e.g., GPS pings, sync logs, and background tasks).
* **Native Log Share Sheets**: Easily export structured logs via text, email, or system clipboards to debug without developer cables.

---

## 🛠️ Automated Cloud CI/CD (EAS Workflows)

We utilize **EAS Workflows** to manage code quality, linting, formatting, type-safety checks, and parallel app compilations fully in the cloud.

The **`.eas/workflows/regression-test.yml`** workflow runs on every push and pull request to the `master` branch:

```mermaid
graph TD
    A[Push / PR to master] --> B[EAS Workflow Spawned]
    B --> C[Verify Types & Config]
    C -->|Run expo doctor| D[Expo Diagnostics]
    C -->|Run typecheck| E[TypeScript compilation]
    C -->|Run ESLint| F[ESLint Code Quality]
    
    D & E & F --> G{All Passed?}
    
    G -->|Yes| H[Parallel Builds]
    G -->|No| I[Workflow Fails & Alerts]
    
    H --> J[Build Android Preview APK]
    H --> K[Build iOS Production IPA]
```

---

## 📦 Developer Guide

### Prerequisites
* **Node.js** (LTS or latest)
* **npm** or **Yarn**
* **Expo Go** app installed on your test devices (Client version **54.0.8** or compatible Expo SDK 54 runner)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/fkcurrie/wheres-my-family.git
   cd wheres-my-family
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Local Development Scripts
* 🚀 **Start Metro Bundler**: `npm start`
* 🤖 **Run on Android**: `npm run android`
* 🍎 **Run on iOS**: `npm run ios`
* 🩺 **Check Project Health**: `npx expo doctor`
* 🏗️ **Compile Check**: `npm run typecheck`
* 🚨 **Quality Audit (ESLint)**: `npm run lint`
* 💅 **Autoformat Code**: `npm run format`

---

## 🛡️ Privacy & Security

This is a private, family-centric repository.
* Coordinates are kept secure and shared only within defined private channels.
* Tracking can be fully disabled in the app settings at any time.

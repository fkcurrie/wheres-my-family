# 📍 "Where's my family!!" — Getting Started & Developer Guide

Welcome to the official developer guide for **"Where's my family!!"**, a premium, self-hosted, and 100% secure real-time family tracking ecosystem. This guide provides a full overview of the system architecture, local development setups, cryptographic standards, and development workflows.

---

## 🏗️ System Architecture

The ecosystem consists of three major components:
1. **React Native Mobile App:** Built on Expo (SDK 54), sharing live telemetry (GPS coordinates, battery levels, speed, weather metadata) in real-time.
2. **Serverless GCP Backend:** A lightweight, secure Node.js 22 serverless function deployed inside Google Cloud Platform (GCP).
3. **Sovereign Web Dashboard:** A beautiful, responsive Map-based control center deployed to GCP Cloud Run, allowing real-time family coordinate visualization.

```mermaid
graph TD
    subgraph Client Layer (Zero-Knowledge AES-256-CBC)
        App[React Native Mobile App]
        Dash[Web Dashboard HTML/JS]
    end

    subgraph Serverless Cloud Layer (Toronto northamerica-northeast2)
        CF[Cloud Function 2nd Gen - Node.js 22]
        DB[(Firestore Native Database)]
    end

    App -->|HTTPS / X-Mantle-Key| CF
    Dash -->|HTTPS / X-Mantle-Key| CF
    CF -->|Application Default Credentials| DB
```

---

## 🔒 Security & E2EE Cryptography

To ensure absolute location privacy, the system utilizes **Zero-Knowledge client-side End-to-End Encryption (E2EE)**:
* **Cipher Suite:** AES-256-CBC (via the `crypto-js` library) utilizing a shared family passkey.
* **Mechanism:** 
  1. The mobile device acquires real high-accuracy GPS coordinates (`latitude`, `longitude`).
  2. The actual coordinates are encrypted client-side using the family passkey into hex-encoded ciphertexts (`latEnc`, `lngEnc`).
  3. The database receives dummy coordinate placeholders centered in Switzerland (`46.8182`, `8.2275`) to comply with standard map interfaces without revealing actual locations.
  4. The web dashboard fetches the ciphertexts, decrypts them client-side in the browser using the same family passkey, and correctly renders the markers.
* **Backward Compatibility:** Incorporates a robust try-catch legacy fallback. Older clients utilizing XOR-Hex symmetric cipher coordinates are seamlessly decrypted without interrupting service.

---

## 🛠️ Local Development Setup

Follow these steps to run the mobile application locally on your workstation.

### 1. Prerequisites
Ensure you have the following installed on your developer node:
* **Node.js:** v20.x or Node.js 22 (LTS recommended)
* **Package Manager:** npm (comes bundled with Node)
* **Java Development Kit (JDK):** JDK 17 (required for React Native Android compilation)
* **Android Studio:** Configured with Android SDK Platform 34+, Android SDK Build-Tools, and an active Android Virtual Device (AVD) emulator.

### 2. Dependency Installation
Navigate to the mobile project root and install the dependencies:
```powershell
# Run inside wheres-my-family directory
npm install
```

### 3. Launching Local Metro Bundler
Start the Metro development server:
```powershell
npm run start
```
* **Metro Options:**
  - Press `a` to automatically boot your Android Emulator and launch the app inside **Expo Go**.
  - Press `i` to launch on an iOS Simulator.
  - Press `r` to reload the Javascript bundle on-demand.

---

## 📱 Core Application Workflows

### 🛡️ 1. Onboarding & Registration
If no registered profile is detected on the local disk (`AsyncStorage`), the application presents an onboarding screen. The user inputs their name (supporting auto-capitalization and keyboard "Enter" submit), which registers them as a device node.

### 📍 2. Foreground & Background GPS Telemetry
* **Foreground:** Employs `expo-location` to track location updates dynamically every 4 seconds.
* **Background:** Registers a high-efficiency background tracking task (`background-location-task`) utilizing Expo's `TaskManager` that shares coordinates even when the phone is locked.
* **Speed-Adaptive Rate Scaling:** Automatically transitions tracking resolution based on telemetry speeds:
  - **Stationary/Walking (< 29 km/h):** standard tracking interval of 30 seconds.
  - **Driving (>= 29 km/h):** high-frequency tracking interval of 5 seconds to capture accurate routes.

### 🔋 3. Dynamic Telemetry & Battery Display
List card batteries render dynamic state icons matching actual device charge telemetry:
* `charging === true` ➡️ pulsing `BatteryCharging` (Emerald Green)
* `battery < 20` ➡️ `BatteryLow` (Vibrant Red)
* `battery >= 20 && battery < 60` ➡️ `BatteryMedium` (Slate Gray)
* `battery >= 60` ➡️ `Battery` (Slate Gray)

### 🗺️ 4. Interactive Camera Pan
Tapping a family member's list card centers the map camera over their last known coordinates using a smooth animated transition (`1000ms`) and triggers a soft haptic touch response.

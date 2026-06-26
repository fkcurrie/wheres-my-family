# 📱 Family Member Onboarding & Background Tracking Troubleshooting Guide

This guide is designed for **non-technical family members** and system hosts. It provides step-by-step instructions to configure location services and disable OS-level power savers, ensuring reliable, continuous, real-time background tracking.

---

## 🗺️ Why Background Location Fails
Modern mobile operating systems (especially Android 12+ and iOS 16+) implement aggressive power-management and background execution restrictions. By default, if an app has not been opened for a few days, or if the phone enters a low-battery state, the operating system will **hibernate or kill** the background location service.

To keep your family connected 24/7 without dropouts, follow the device-specific checklists below.

---

## 🤖 Android Device Configuration

Android operating systems vary significantly by manufacturer. Below are the steps for the most common devices.

### 1. General Location Permissions (All Androids)
To allow the app to track your coordinates when the screen is locked:
1. Long-press the **"Where's my family!!"** icon on your home screen and tap **App Info** (or ℹ️).
2. Go to **Permissions** ➡️ **Location**.
3. Select **"Allow all the time"** (Crucial: Selecting "Allow only while using the app" will break background tracking).
4. Enable **"Use precise location"**.

### 2. General Battery Optimization (All Androids)
1. Go to the **App Info** page for "Where's my family!!".
2. Tap on **Battery** or **Battery usage**.
3. Change the setting from "Optimized" or "Optimized (recommended)" to **"Unrestricted"**.

### 3. Manufacturer-Specific Setup

#### 📱 Google Pixel & Motorola
- Go to **Settings** ➡️ **Apps** ➡️ **All Apps** ➡️ **Where's my family!!** ➡️ **App Battery Usage** ➡️ Set to **"Unrestricted"**.

#### 📱 Samsung Galaxy (One UI)
Samsung implements some of the most aggressive background app hibernation features:
1. Go to **Settings** ➡️ **Battery and device care** ➡️ **Battery** ➡️ **Background usage limits**.
2. Ensure **"Put unused apps to sleep"** is turned OFF, or add "Where's my family!!" to **"Never sleeping apps"**.
3. Go back to **App Info** for "Where's my family!!" ➡️ **Battery** ➡️ Set to **"Unrestricted"**.

#### 📱 Xiaomi, Redmi, & Poco (MIUI / HyperOS)
1. Open **Settings** ➡️ **Apps** ➡️ **Manage Apps** ➡️ **Where's my family!!**.
2. Toggle **Autostart** to ON.
3. Tap **Battery Saver** ➡️ Select **"No restrictions"**.

#### 📱 OnePlus, Oppo, & Realme
1. Go to **Settings** ➡️ **Apps** ➡️ **App Management** ➡️ **Where's my family!!** ➡️ **Battery usage**.
2. Enable **"Allow background activity"** and **"Allow auto-launch"**.

> [!TIP]
> If your manufacturer is not listed, or background tracking still terminates, visit [Don't Kill My App! (dontkillmyapp.com)](https://dontkillmyapp.com) for customized settings for your device.

---

## 🍎 iOS (iPhone) Configuration

Apple devices require a global background permission and precise location switches to keep services alive.

### 1. Location Permissions
1. Go to **Settings** ➡️ **Privacy & Security** ➡️ **Location Services**.
2. Ensure **Location Services** is toggled ON.
3. Scroll down and tap **"Where's my family!!"**.
4. Select **"Always"**.
5. Ensure **"Precise Location"** is toggled ON.

### 2. Background App Refresh
If Background App Refresh is disabled globally or for this app, iOS will completely block coordinate uploads when the app is suspended:
1. Go to **Settings** ➡️ **General** ➡️ **Background App Refresh**.
2. Ensure the global setting is set to **"Wi-Fi & Cellular Data"**.
3. Scroll down to **"Where's my family!!"** and verify that its toggle is ON.

### 3. Disable Low Power Mode
* **Low Power Mode** (which turns the battery icon yellow) immediately suspends Background App Refresh and severely throttles GPS hardware rates. 
* To ensure continuous tracking, avoid leaving your device in Low Power Mode, or re-open the application manually after charging.

---

## 🔍 Diagnostics: How to Verify Your Background Status

"Where's my family!!" includes built-in diagnostic logging so you don't have to guess if background syncing is working.

1. Open the application.
2. Tap the **Diagnostic Logs** button at the bottom of the dashboard list.
3. Look for the following signature logs:
   * `[Background Fetch] Registered periodic nudge & location check (5m).` (Confirms your system has scheduled background polling)
   * `[GPS Success] Acquired initial position.` (Confirms hardware GPS is functional)
   * `[Sync Success] Coords encrypted and uploaded...` (Confirms E2EE coordinate syncing is fully operational)

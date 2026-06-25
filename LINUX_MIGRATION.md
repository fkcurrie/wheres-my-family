# 🐧 Linux Migration & Developer Transition Guide

This document acts as the developer's guide for transferring development of the **"Where's my family!!"** ecosystem from a Windows host to a native Linux environment. Following these steps ensures a seamless setup using the Git repository as the single source of truth.

---

## 🛠️ 1. What We Added to the Repo (Ready-to-Use)

To support this transition, we have already added and configured the following files directly in the repository:

### ⚡ Native Linux Bash Orchestrator (`scratch/orchestrate.sh`)

- **What it is**: A shell script version of our PowerShell pipeline (`scratch/orchestrate.ps1`).
- **Key Features**: Includes file alignment verification, live MantleDB connectivity pings, standard `npx tsc` syntax checks, headless HTML/DOM diagnostic runs, EAS OTA publishing triggers, and ADB screenshot capture verification.
- **Linux Integration**: Fully colorized with ANSI codes and configured with executable permissions inside Git (`chmod +x`).

### 📐 Line Ending Normalizer (`.gitattributes`)

- **What it is**: Enforces repository-wide cross-platform line-ending rules.
- **How it works**: Prevents Windows line endings (`CRLF`) from sneaking into Linux shell scripts, which otherwise causes bad interpreter errors (e.g. `/bin/bash^M: bad interpreter: No such file or directory`).
- **Rules**:
  - Forces LF on all `.sh` and `.ps1` script files.
  - Forces CRLF on Windows `.bat`/`.cmd` files.
  - Ensures all other files use Git's auto-normalization.

---

## 🖥️ 2. Linux System Dependencies

When setting up your new Linux host (e.g., Ubuntu/Debian), install the following prerequisites:

### 🟢 Node.js (via NVM)

Using **nvm** (Node Version Manager) is highly recommended on Linux to avoid permission issues with global packages:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm and install stable Node.js LTS (v20 or v22)
nvm install --lts
nvm use --lts
```

### ☕ JDK 17 (Required for Android Prebuilds & Compilations)

Install the OpenJDK package:

```bash
sudo apt update
sudo apt install openjdk-17-jdk -y

# Verify java version
java -version
```

### 🤖 Android SDK & ADB Pathing

1. Download Command Line Tools or install Android Studio for Linux.
2. Typically, the SDK is installed under `/home/<username>/Android/Sdk`.
3. Add the following environment variables to your shell startup file (e.g., `~/.bashrc` or `~/.zshrc`):
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
   ```
4. Source your profile or restart your terminal:
   ```bash
   source ~/.bashrc
   ```

---

## 🔑 3. Replicating Local Keys & Credentials (Ignored Files)

Since sensitive keys and credentials are (correctly) excluded in `.gitignore` to prevent secret leaks, you must manually transfer them from your Windows system to the same paths on your Linux machine:

### 📦 1. Android Upload Keystore

- **Windows path**: `wheres-my-family/android_keystore_base64.txt` (or your actual keystore file).
- **Linux reproduction**: If you use base64 files, you can easily decode them into binary keystores on Linux:
  ```bash
  base64 -d android_keystore_base64.txt > wheres-my-family.jks
  ```

### 🍏 2. iOS Provisioning Profile

- **Windows path**: `wheres-my-family/ios_provisioning_profile_base64.txt`
- **Linux reproduction**:
  ```bash
  base64 -d ios_provisioning_profile_base64.txt > wheres-my-family.mobileprovision
  ```

### ☁️ 3. Google Play Store Console Keys

- **Windows path**: `wheres-my-family/pc-api-key.json`
- **Linux reproduction**: Directly copy this JSON file to the root of the project on Linux.

---

## 🚀 4. Running the Development Pipeline on Linux

Once your dependencies and credentials are in place:

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Execute static verifications and builds**:

   ```bash
   # Run typechecks and linter
   npm run typecheck
   npm run lint

   # Run our newly added headless dashboard checker & alignment tool
   node scratch/verify_dashboard.js
   ```

3. **Execute the Native Linux Orchestrator**:
   ```bash
   ./scratch/orchestrate.sh
   ```
   _(This replaces the PowerShell `.\scratch\orchestrate.ps1` completely!)_

---

> [!NOTE]
> All path names and imports in this codebase are strictly written in **camelCase/PascalCase matching their exact filenames on disk**. Because Linux filesystems are fully case-sensitive (unlike Windows), this ensures zero compilation or bundling errors when running Metro, Expo, or GitHub Actions.

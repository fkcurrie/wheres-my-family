# 🔑 CI/CD Repository Secrets Generation & Validation Reference

This guide provides concrete, multi-platform terminal commands and checklists to generate, encode, and validate the **GitHub Repository Actions Secrets** required to run automated, non-interactive Android and iOS compilation pipelines.

---

## 🗺️ Secret Variables Overview

The `.github/workflows/` folder contains parallel compilation scripts (`android-build.yml` and `ios-build.yml`) that bypass Expo's EAS subscription. These runners use the following secret slots configured in **GitHub Repository > Settings > Secrets and variables > Actions**:

```mermaid
graph TD
    subgraph GitHub Action Secrets
        K_And[Android Signing Secrets]
        K_iOS[iOS Distribution Secrets]
        K_Play[Google Play Service JSON]
        K_Apple[App Store API Keys]
    end

    K_And -->|ubuntu-latest runner| Sign_And[Sign app-release.aab]
    K_Play -->|ubuntu-latest runner| Publish_And[Google Play Console Internal Beta]
    
    K_iOS -->|macos-26 runner| Sign_iOS[Sign wheresmyfamily.ipa]
    K_Apple -->|macos-26 runner| Publish_iOS[Apple Transporter to TestFlight]
```

---

## 🤖 Android Secret Construction

### 1. Generating a Release Keystore
If you do not have an Android release key, generate a production keystore locally:
```bash
keytool -genkey -v -keystore my-release-key.keystore -alias family-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Creating `ANDROID_KEYSTORE_BASE64`
GitHub Actions cannot receive binary files directly. You must encode your binary `.keystore` file into a clean, un-wrapped base64 string.

* **macOS / Linux Terminal:**
  ```bash
  base64 -i my-release-key.keystore -o - | tr -d '\r\n' > keystore_base64.txt
  ```
* **Windows PowerShell:**
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("my-release-key.keystore")) | Out-File -Encoding ascii keystore_base64.txt
  ```
  *(Crucial: Verify the output file does not contain carriage return `\r\n` line wraps or trailing white spaces.)*

### 3. Validating the Base64 String Locally
Before pasting the secret, confirm the string can be successfully decoded without byte corruption:
* **macOS / Linux:**
  ```bash
  cat keystore_base64.txt | base64 -d > test.keystore && keytool -list -v -keystore test.keystore
  ```
* **Windows PowerShell:**
  ```powershell
  [IO.File]::WriteAllBytes("test.keystore", [Convert]::FromBase64String((Get-Content keystore_base64.txt)))
  keytool -list -v -keystore test.keystore
  ```
  *(If `keytool` prompts for your password and prints your key fingerprint successfully, your base64 string is 100% valid!)*

### 4. Google Play Service Account (`ANDROID_PLAY_STORE_JSON`)
To allow the automated runner to upload `.aab` bundles to your Google Play Console:
1. Navigate to your Google Cloud Console ➡️ **IAM & Admin** ➡️ **Service Accounts**.
2. Create a service account (e.g. `play-store-publisher`).
3. Under **Keys**, tap **Add Key** ➡️ **Create new key** ➡️ **JSON**.
4. In **Google Play Console**, go to **Users and permissions** ➡️ **Invite new user** ➡️ Add the service account email.
5. Assign **"Release Manager"** roles and grant permission to view financial and release streams.
6. Open the downloaded `.json` file, and paste its **entire content** (including braces) directly into the `ANDROID_PLAY_STORE_JSON` secret slot.

---

## 🍎 iOS / Apple Secret Construction

### 1. Creating `APPLE_CERTIFICATE_BASE64`
Export your Apple Distribution Certificate from Keychain Access on macOS as a `.p12` file (containing private key and cert). Encode it to base64:

* **macOS Terminal:**
  ```bash
  base64 -i my-cert.p12 -o - | tr -d '\r\n' > cert_base64.txt
  ```

### 2. Creating `APPLE_PROVISIONING_PROFILE_BASE64`
Download your TestFlight App Store Distribution Provisioning Profile (`.mobileprovision`) from developer.apple.com. Encode it:

* **macOS Terminal:**
  ```bash
  base64 -i my-app.mobileprovision -o - | tr -d '\r\n' > profile_base64.txt
  ```

### 3. App Store Connect API Private Key (`APP_STORE_CONNECT_API_KEY_KEY`)
To upload builds without interactive Apple ID authentication, we use an App Store Connect API Key:
1. Go to **App Store Connect** ➡️ **Users and Access** ➡️ **Integrations** ➡️ **Keys**.
2. Generate an API Key with **"Developer"** or **"App Manager"** access.
3. Download the private `.p8` key file.
4. Open the `.p8` file in a plain-text editor.
5. Copy and paste the **entire text content**, keeping the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` headers/footers exactly intact, into the `APP_STORE_CONNECT_API_KEY_KEY` secret slot.

---

## 🛠️ Common CI/CD Secret Troubleshooting Checklist

| Symptom / Error | Common Cause | Remediation |
| :--- | :--- | :--- |
| `Internal error: Keystore was tampered with, or password was incorrect` | Typo in password or corrupt base64 string | Validate base64 locally using the `keytool` decryption verification snippet above. |
| `Cannot find provision profile` | Profile UUID mismatch or Xcode manual signing lookup failed | Double-check that your `app.json` bundle identifier matches the Provisioning Profile exactly. |
| `Invalid App Store Connect credentials` | API Key, Issuer ID, or multiline Key contents are malformed | Ensure `APP_STORE_CONNECT_API_KEY_KEY` retains its newline headers/footers and matches the Issuer ID UUID. |

# Secure App Store Credentials Management Guide

This guide outlines industry-standard security practices for managing, storing, and utilizing sensitive deployment credentials (keystores, API keys, certificates) for iOS and Android deployment.

---

## 🛡️ 1. Android Keystore & Google Play API Keys

To prevent credential compromise, never store raw keystore files (`.jks`, `.keystore`) or Google Play service account JSON files (`pc-api-key.json`) in plaintext inside version control.

### Option A: Expo Application Services (EAS) Credentials (Recommended)

EAS securely stores and manages your credentials in an encrypted cloud vault.

- Run the following command in your project root to configure or view credentials:
  ```bash
  npx eas-cli credentials
  ```
- EAS automatically handles the keystore, private keys, and build credentials during remote builds.

### Option B: Local Environment Variables / CI/CD (GitHub Actions)

If building inside a custom CI pipeline:

1. **Base64 Encode the Keystore:**
   Convert your binary keystore file to a Base64 string so it can be safely stored as text:
   ```bash
   certutil -encode android_keystore.jks keystore_base64.txt
   ```
2. **Store as Repository Secrets:**
   Add the following secrets to your GitHub repository settings:
   - `ANDROID_KEYSTORE_BASE64`: The content of `keystore_base64.txt`.
   - `ANDROID_KEYSTORE_PASSWORD`: Password for the keystore.
   - `ANDROID_KEY_ALIAS`: Alias name of the signing key.
   - `ANDROID_KEY_PASSWORD`: Password for the signing key.
   - `PLAY_STORE_JSON_KEY`: The contents of `pc-api-key.json`.
3. **Decode Dynamically During Build:**
   In your workflow runner, decode the keystore back to its binary format before compilation:
   ```bash
   echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > android_keystore.jks
   ```

---

## 🍏 2. iOS Provisioning Profiles & Certificates

iOS certificates and provisioning profiles are tied to your Apple Developer Account and require secure synchronization.

### Option A: App Store Connect API Key

Using an App Store Connect API Key is the most secure way to authenticate with Apple's API without requiring 2-Factor Authentication (2FA) or exposing your personal Apple ID password.

1. Generate an API Key in the **App Store Connect Portal** (under Users and Access > Integrations > App Store Connect API).
2. Download the `.p8` private key file.
3. Securely save these details in your GitHub Secrets:
   - `APP_STORE_CONNECT_KEY_ID`: The 10-character Key ID.
   - `APP_STORE_CONNECT_ISSUER_ID`: The UUID Issuer ID.
   - `APP_STORE_CONNECT_PRIVATE_KEY`: The full content of the downloaded `.p8` file.

### Option B: Fastlane Match / EAS

Both Fastlane Match and EAS Credentials use a single encrypted repository or secure backend to manage profiles:

- **EAS Credentials:** Manages signing certificates and provisioning profiles automatically.
- **Fastlane Match:** Encrypts your iOS certificates and provisioning profiles with Git and stores them in a private git repository.

---

## 🚫 3. What to Avoid

- **Never commit secrets to version control:** Avoid adding `.jks`, `.keystore`, `.p12`, `.p8`, or `.json` API keys to your git history. Ensure they are listed in your `.gitignore`.
- **Avoid cleartext transmission:** Never transmit raw private keys or passwords over insecure network protocols (e.g., cleartext SCP, unencrypted FTP, email, or chat clients).

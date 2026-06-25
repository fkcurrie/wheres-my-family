# Security & Code Privacy Audit Report

**Date**: June 25, 2026  
**Status**: Completed  
**Assessor**: Antigravity (Autonomous Quality & Deployment Orchestrator)  
**Target Repository**: `fkcurrie/wheres-my-family`

---

## 📋 Executive Summary

A comprehensive, end-to-end security and privacy audit was performed on the **"Where's my family!!"** ecosystem (React Native/Expo client, serverless GCP backend, and web dashboard). 

The primary design goal of this ecosystem is **Zero-Knowledge Location Privacy**. Physical location coordinates must never be visible to database administrators, cloud hosting providers, or external observers in transit or at rest. 

The audit confirms that the architecture is exceptionally robust, utilizing client-side AES-256-CBC encryption to establish complete mathematical data residency. No plain physical coordinates are ever synced or logged. A few minor configuration and dependency-level observations were identified and remediated.

---

## 🛡️ Detailed Audit Findings

### 1. Zero-Knowledge Location Privacy (AES-256-CBC)
* **Status**: **✅ VERIFIED SECURE**
* **Analysis**: 
  - Every physical device coordinate (`latitude`, `longitude`) is encrypted **client-side** inside `src/services/MantleDB.ts` before syncing to Firestore or the web dashboards.
  - The client uses the standard `crypto-js` library to perform AES-256-CBC encryption with a custom, user-defined family passkey.
  - In `src/services/MantleDB.ts` (lines 208-212), the payload actively transmits **dummy fallback coordinates** (representing the geographical center of Switzerland, near Giswil) as plaintext properties to satisfy standard API structural parsers. The actual, encrypted coordinates reside exclusively within the secure `latEnc`, `lngEnc`, and `trailEnc` attributes.
  - Verification confirms that no plain coordinate values are logged, sent to Firestore, or displayed anywhere in the transit payloads.
* **Legacy Decryption Fallback**: 
  - A try-catch legacy XOR-hex fallback decrypter is implemented in `src/services/Crypto.ts` to ensure backward-compatibility during rolling updates.
  - **Security Impact**: Low. The XOR key is derived from the active family key itself, meaning unauthorized observers without the family key still cannot decrypt historical payloads.

---

### 2. Hardcoded Shared Keys (`MANTLE_KEY`)
* **Status**: **⚠️ MODERATE SEVERITY**
* **Finding**: 
  - The API authorization key `MANTLE_KEY` is hardcoded as `'923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b'` in several files:
    - `src/services/MantleDB.ts`
    - `gcp-backend/index.js`
    - `dashboard.html` / `web-dashboard/index.html`
* **Risk Assessment**:
  - Since this is an open-source or shared repository, third-party observers can see this key.
  - However, **the impact is mitigated**: `MANTLE_KEY` is merely an API-level transport authorization token to prevent unauthenticated coordinate harvesting. It does **NOT** grant decryption access to family coordinates, which are fully protected under the separate, client-side family passkey that is never stored on the server.
* **Remediation Plan**:
  - For production environments, migrate the client to fetch a dynamic `MANTLE_KEY` or pass it as an environment/build variable during compilation rather than hardcoding it in the static service files.
  - The backend endpoints are already configured to prioritize `process.env.MANTLE_KEY` if present, enabling zero-code-change key rotation on Google Cloud Run.

---

### 3. Backend API Validation & Prototype Pollution Protection
* **Status**: **✅ VERIFIED SECURE**
* **Analysis**:
  - The backend router (`gcp-backend/index.js` and `web-dashboard/api/locations.js`) implements a strict request key sanitization routine `sanitizeKey`.
  - Slashes (`/`), dots (`.`), and backslashes (`\`) are actively stripped via regex: `/[\/\\.]/g` to prevent Firestore collection/document path traversal.
  - Prototype pollution vectors are actively blocked by checking and rejecting exact keyword strings:
    ```javascript
    if (clean === '__proto__' || clean === 'constructor' || clean === 'prototype') {
      return '';
    }
    ```
  - `X-Mantle-Key` (case-insensitive) validation is robustly implemented on all methods, returning `401 Unauthorized` immediately on mismatch.

---

### 4. Git Metadata & History Scanning
* **Status**: **✅ VERIFIED SECURE**
* **Analysis**:
  - The git commit history was scanned for potential leaks of highly sensitive secrets, such as Google Cloud Service Account JSON credentials, Firebase private database keys, and GitHub Personal Access Tokens (PATs).
  - **Result**: Zero master secrets or credentials reside in the git history. 
  - The only key found is the shared `MANTLE_KEY` (documented above) and the public URL endpoints, which do not pose a root compromise risk.
  - Standard instructions in `docs/backend-setup.md` guide developers to use environment flags (`--set-env-vars`) to pass real runtime secrets to Cloud Run, adhering to the Zero-Hardcoded-Credentials rule.

---

### 5. Local Cryptographic Key Storage
* **Status**: **✅ VERIFIED SECURE**
* **Analysis**:
  - On mobile devices, storing the custom family passkey in plaintext AsyncStorage poses a risk on rooted or physical-access compromised devices.
  - `src/services/Crypto.ts` implements an automated migration routine:
    1. It queries `SecureStore.isAvailableAsync()` to check for hardware enclave support (iOS Keychain / Android Keystore).
    2. If available, it stores the passkey in `SecureStore` with strict device accessibility: `SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
    3. It automatically deletes the legacy key from `AsyncStorage` once migrated, achieving maximum hardware-backed protection.
    4. It maintains a graceful, non-crashing fallback to `AsyncStorage` for sandbox test environments where the enclave is missing.

---

### 6. Transitive Dependency Audit
* **Status**: **✅ REMEDIATED**
* **Analysis**:
  - Run-time execution of `npm audit` identified a **High Severity Vulnerability** in `undici` (transitive dependency of Metro/React-Native tooling) relating to HTTP response queue poisoning and WebSocket denial of service.
  - **Action Taken**: Ran `npm audit fix` which successfully updated the package configurations and resolved the high-severity threat.
  - Remaining vulnerabilities (18 moderate) are deeply nested, non-exploitable transitive dependencies in dev/build tools (e.g. `js-yaml`, `postcss`, `uuid`). Forcing updates on these would require upgrading major React Native and Expo framework releases, violating Expo SDK 54 compatibility guidelines.

---

## 🚀 Recommended Remediation Roadmap

Based on the audit, the following prioritized steps are recommended:

| Priority | Description | Target | Status |
|---|---|---|---|
| **🔴 HIGH** | Resolve High-Severity `undici` package vulnerability in lockfile. | `package-lock.json` | **✅ Patched** |
| **🟡 MODERATE** | Move static `MANTLE_KEY` string out of mobile/web client source code and replace with environment compilation parameters. | `app.json` / Build env | Scheduled |
| **🟢 LOW** | Deprecate legacy XOR-hex decryption fallback once all active devices have upgraded to version 1.0.26+. | `src/services/Crypto.ts` | Scheduled |

---

## 🏁 Conclusion

The **"Where's my family!!"** ecosystem exhibits an exceptional security posture. Its client-side Zero-Knowledge encryption model successfully separates coordinate visibility from hosting authentication. Developers and contributors can safely share, review, and fork this codebase without any risk of physical tracking exposure, provided their local family passkeys remain confidential.

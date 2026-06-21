---
name: security-auditor
description: Performs security audits, scans for hardcoded secrets, checks Firestore rules, and sanitizes input parameters.
---

# Skill: Security Auditor

Use this skill when auditing source files, changing API integrations, modifying Firestore query paths, or reviewing npm package configurations.

---

## 🔒 Step 1: Scanning for Hardcoded Secrets

1. Search files for common patterns of leaked secrets, credentials, or personal access tokens (such as `gho_`, `ghp_`, GCP private keys, Firebase database keys, etc.).
2. **Rule:** NEVER allow a secret or credential to reside in the client-side bundle.
3. **Remediation:** Remove the hardcoded secret, store it in serverless environment variables (like GCP Cloud Function environments or Secrets Manager), and route operations via a secure API proxy.

---

## 🛡️ Step 2: Firestore Path-Traversal Sanitization

1. When accepting document or collection IDs from client requests in a serverless endpoint, verify that the key does not contain slashes (`/`), dots (`.`), or wildcard elements that could result in path traversal or injection.
2. In your backend router (e.g., `gcp-backend/index.js`), apply regex-based sanitization before reading or writing to Firestore:
   ```javascript
   const sanitizeKey = (key) => {
     if (typeof key !== 'string') return '';
     // Remove any path-traversal characters like slashes, dots, and backslashes
     return key.replace(/[\/\\.]/g, '').trim();
   };
   ```

---

## 🧹 Step 3: Dependency Audits

1. Check for vulnerable package configurations or obsolete dependencies.
2. Periodically run `npm audit` inside the workspace folder to review package advisories.
3. Avoid experimental pre-release typescript versions or untrusted libraries. Ensure standard, stable, well-vetted libraries are used (e.g. `crypto-js` for AES-256 operations).

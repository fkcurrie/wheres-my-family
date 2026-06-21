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

---

## 📋 Step 4: Formulating Recommendations & Remediation Plans

1. For every finding discovered during steps 1-3, formulate a clear, actionable remediation recommendation.
2. Classify findings and recommendations by severity level:
   - **🔴 Critical/High Severity:** Immediate action required (e.g., hardcoded credentials, unauthenticated endpoints).
   - **🟡 Moderate Severity:** Action recommended during next iteration cycle (e.g., package vulnerability in build tools, permissive CORS headers).
   - **🟢 Low/Info Severity:** Informational best practices (e.g., code stylistic patterns, minor dependency updates).
3. Draft a structured, prioritized "Security Remediation Roadmap" in your audit report that guides the user on precisely how to patch the issues securely.

---

## 🔧 Step 5: Proactive Remediation & Self-Healing Patches

1. If the environment supports write tools and the user explicitly requests or allows active remediation:
   - For **🔴 Critical/High Severity** issues (like hardcoded keys): Immediately remove the secret, transfer it to secure environment configurations, and write the necessary server/client API integration patches.
   - For **🟡 Moderate Severity** issues (like path traversals): Rewrite the vulnerable parsing routines to include sanitization and validation on-the-fly.
2. After writing the patches, run the standard compilation and validation checks:
   - Run typecheck: `powershell -ExecutionPolicy Bypass -Command "node_modules\typescript\bin\tsc --noEmit"`
   - Run lint: `powershell -ExecutionPolicy Bypass -Command "npm run lint"`
3. If verification succeeds, stage and commit the patches to the master branch with a descriptive commit message (e.g., `security: sanitize Firestore document key paths`), and push to trigger clean release builds.



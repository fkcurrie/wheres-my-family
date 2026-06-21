# Workspace Customization Rules: Where's my family!!

These rules define guidelines, constraints, and instructions for all AI agents working on the **"Where's my family!!"** ecosystem (mobile application, serverless backend, and web dashboards).

---

## 🛡️ Coding Guidelines & Behavior Constraints

### 1. Zero Knowledge Location Privacy (E2EE)
- All physical device coordinates (latitude, longitude, snapped OSRM trails) must be encrypted **client-side** before syncing to the database.
- Use AES-256-CBC via the `crypto-js` library.
- **NEVER** expose the plain coordinate data to Firestore or any backend logs.
- Always implement a try-catch **legacy XOR-hex fallback** in decrypters to prevent service disruptions for older clients during rollout phases.

### 2. Zero Hardcoded Credentials
- Under **no circumstances** may GitHub Personal Access Tokens (PATs), Google Cloud Service Account keys, or API keys be written directly into mobile or web clients.
- All authenticated third-party operations (like Feedback/Issue creation) must route exclusively via serverless backend endpoints (like the GCP Toronto Cloud Function) using environment variables.

### 3. Case-Sensitive Casing (Linux compatibility)
- Keep all folder and import naming consistent.
- Double-check filenames: imports must match the exact case of files on disk to prevent compilation failures on the Ubuntu-based GitHub Actions runners.

---

## ⚙️ Development & Verification Workflows

### 1. Headless Map & DOM Checks
- Before staging changes to web dashboards, verify script configurations, CDN dependencies, and DOM rendering elements.
- Run `node scratch/verify_dashboard.js` to perform headless validation checks.

### 2. TypeScript and Lint Verification
- Ensure local types and syntax are fully correct before pushing tags.
- Run typecheck relative to node modules:
  ```powershell
  powershell -ExecutionPolicy Bypass -Command "node_modules\typescript\bin\tsc --noEmit"
  ```
- Run ESLint checks:
  ```powershell
  powershell -ExecutionPolicy Bypass -Command "npm run lint"
  ```

---

## 🚀 App Store Release Guidelines

When compiling, building, and submitting production releases (EAS Build & Submit):

1. **Gather Changes:** Extract the key new features, performance improvements, and bug fixes introduced in this particular build version.
2. **iOS (TestFlight):** Always pass the `--what-to-test` CLI option during the `eas submit` execution. Formulate a clean, bulleted list of the new changes.
   - _Example:_ `npx eas-cli submit --platform ios --profile production --what-to-test "• Added in-app feedback drawer\n• Speed-adaptive background tracking"`
3. **Android (Google Play):** Because EAS Submit does not natively upload Android "What's New" release notes, you must:
   - Write the exact release notes to a temporary/release file `whatsnew-android.txt` in the root of the project.
   - Print this text clearly in your final response to the user so they can copy and paste it into the draft/release section of their Google Play Console.

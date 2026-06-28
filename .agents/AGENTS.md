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

### 4. Serverless API Security & Prototype Pollution Protection

- **X-Mantle-Key Verification**: Every backend/serverless endpoint (including GCP Cloud Functions and Cloud Run endpoints) must verify request authenticity by validating the `X-Mantle-Key` (or case-insensitive `x-mantle-key`) header against the server environment's `MANTLE_KEY`, returning `401 Unauthorized` on mismatch.
- **Key Sanitization**: Before merging or writing client-supplied JSON keys into databases or documents, always apply a regex-based cleaning routine that strips path-traversal characters (`/`, `\`, `.`) and actively rejects prototype pollution keyword strings (`__proto__`, `constructor`, `prototype`) to block logical injection.

### 5. Production Hosting & Deployment residency

- **GCP Cloud Run Exclusively**: The web dashboard is hosted and executed exclusively via Google Cloud Run inside GCP project `wheres-my-family-499822` (Toronto region `northamerica-northeast2`).
- **Vercel Decommissioned**: Vercel is 100% decommissioned and no longer used. Under no circumstances should Vercel deployment commands or configurations (`vercel.json`) be generated, modified, or executed.

### 6. Strict Authorized User Accounts Only

- **Do NOT create any new user accounts or members in the locations collection.**
- The only authorized users that should ever exist or be created are:
  - `Dad` (physical Android device)
  - `Apple-test` (physical iOS device)
  - `Emulator` (pixel emulator running on this system)
- Any testing, diagnostic, or development scripts/interactions must only read, update, or reference these three accounts. No custom, temporary, or dynamic test usernames (such as `'Test User'`, `'rwltza'`, etc.) are allowed.

---

## ⚙️ Development & Verification Workflows

### 0. Windows Shell Script Execution Guardrail

- When running scripts or commands locally on a Windows shell host (like `npm`, `tsc`, `eslint`, or security tooling), always invoke or wrap the target command with `powershell -ExecutionPolicy Bypass -Command "..."` to prevent script execution security blocks (`PSSecurityException`).

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

When compiling, building, and submitting production releases via the GitHub Actions CI/CD pipeline:

1. **Gather Changes:** Extract the key new features, performance improvements, and bug fixes introduced in this particular build version.
2. **iOS (TestFlight):** Provide a clean, bulleted list of the new changes in your final response to the user. Since builds are automatically submitted via GitHub Actions, the user can review and copy these notes directly into the TestFlight build external tester notes in App Store Connect.
   - _Example:_ "• Added speed-adaptive background tracking\n• Implemented beautiful map zoom transitions"
3. **Android (Google Play):** Because direct `.aab` uploads do not natively inject Android release notes into the Play Console internal beta track, you must:
   - Write the exact release notes to a temporary/release file `whatsnew-android.txt` in the root of the project.
   - Print this text clearly in your final response to the user so they can copy and paste it into the draft/release section of their Google Play Console.

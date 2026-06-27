---
name: pipeline-monitor
description: Monitors, diagnoses, and patches CI/CD compilation, typescript, or linting errors in automated release pipelines (such as GitHub Actions).
---

# Skill: Pipeline Monitor & CI/CD Specialist

Use this skill when the user asks for deployment status updates, when automated release pipelines fail, or when you need to verify code before committing and pushing build tags. It includes a built-in real-time CLI monitoring script.

---

## 🚀 Live Build Monitoring

We have a dedicated Node.js command-line tool to monitor in-progress compilations and pipeline steps in real-time.

### How to Run:
- **Run Once (Default/CI/Agent loops)**:
  ```bash
  timeout 30s node .agents/skills/pipeline-monitor/scripts/monitor.js --once
  ```
- **Live Terminal Watch (Interactive loops for users)**:
  ```bash
  node .agents/skills/pipeline-monitor/scripts/monitor.js --watch
  ```

This tool automatically fetches running or queued jobs, outputs colored status indicators, updates dynamically with a live-ticking spinner, and details each pipeline step with elapsed compile times.

---

## 🔍 Step-by-Step Diagnostics Workflow

### 1. Fetching Run Status
If you prefer querying raw API outputs, use the GitHub Actions list API or `gh run list`:
```bash
timeout 30s gh run list --limit 5 --json databaseId,workflowName,status,conclusion
```

### 2. Identifying Failures
If a job is marked as failed, use our monitor script or run:
```bash
timeout 30s gh run view <run_id> --json jobs
```
Locate the failed step's name. Common compilation failure steps include:
- `Install Dependencies`
- `Pre-Check TypeScript, Lint, and Expo Health`
- `Compile Release Bundle (AAB)` / `Build & Package iOS App`
- `Upload to Google Play Console` / `Upload to App Store Connect`

### 3. Fetching Compiler and Build Warnings
You can view detailed logs or error warnings for a specific job:
```bash
timeout 30s gh run view --log-failed
```
If compile-time errors occur (e.g. React Native or iOS build errors), run:
```bash
timeout 30s gh run view --job=<job_id>
```

---

## 🩹 Local Hotfixing & Re-triggering

1. Verify and reproduce the compiler error locally inside the project workspace:
   - TypeScript verification:
     ```bash
     timeout 30s node_modules/typescript/bin/tsc --noEmit
     ```
   - ESLint validation:
     ```bash
     timeout 30s npm run lint
     ```
2. Apply the necessary minimal fix to resolve module resolution, syntax, or typings.
3. Commit and push your modifications to master:
   ```bash
   git add .
   git commit -m "fix: resolve pipeline build errors"
   git push origin master
   ```
4. If the build is triggered by a release tag (e.g., `v1.0.29`), delete the tag locally and remotely, recreate it on the updated commit, and push it:
   ```bash
   git tag -d v1.0.29
   git push origin :refs/tags/v1.0.29
   git tag v1.0.29
   git push origin v1.0.29
   ```

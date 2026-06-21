---
name: pipeline-monitor
description: Monitors, diagnoses, and patches CI/CD compilation, typescript, or linting errors in automated release pipelines (such as GitHub Actions).
---

# Skill: Pipeline Monitor & CI/CD Specialist

Use this skill when the user asks for deployment status updates, when automated release pipelines fail, or when you need to verify code before committing and pushing build tags.

---

## 🔍 Step 1: Fetching Run Status

1. Make an unauthenticated HTTP GET request to the public GitHub API runs endpoint to list the latest workflow runs:
   ```http
   GET https://api.github.com/repos/fkcurrie/wheres-my-family/actions/runs
   ```
2. Parse the list of runs to find the latest runs triggered by the branch or version tag.
3. Check the `status` and `conclusion` fields:
   - `status: "in_progress"` or `"queued"`: The pipeline is currently compiling.
   - `status: "completed"`, `conclusion: "success"`: The compilation succeeded and artifacts were shipped.
   - `status: "completed"`, `conclusion: "failure"`: The compilation failed. Proceed to diagnostic checks.

---

## 🛠️ Step 2: Diagnosing Failures

1. If the job failed, fetch the list of jobs for that run:
   ```http
   GET https://api.github.com/repos/fkcurrie/wheres-my-family/actions/runs/<run_id>/jobs
   ```
2. Locate the failed step's name. Common failed steps include:
   - `Install Dependencies`
   - `Pre-Check TypeScript and Lint`
   - `Compile Release Bundle (AAB)`
   - `Upload to Google Play Console`
3. Fetch check run annotations if available to see inline compiler warnings:
   ```http
   GET https://api.github.com/repos/fkcurrie/wheres-my-family/check-runs/<job_id>/annotations
   ```
4. Perform local reproduction of typecheck or lint rules inside the project directory:
   - Run local typechecking:
     ```powershell
     powershell -ExecutionPolicy Bypass -Command "node_modules\typescript\bin\tsc --noEmit"
     ```
   - Run local linting:
     ```powershell
     powershell -ExecutionPolicy Bypass -Command "npm run lint"
     ```

---

## 🩹 Step 3: Hotfixing & Re-triggering Runs

1. Create a minimal code patch to resolve the module resolution, syntax, or typing issue.
2. Verify the hotfix locally using Step 2's verification commands.
3. Commit and push the changes to remote master branch:
   ```bash
   git add <modified_files>
   git commit -m "fix: resolve pipeline compilation errors"
   git push origin master
   ```
4. If the build is tag-triggered (e.g., `v*` tags like `v1.0.15`), you must delete the existing local and remote tags, recreate them, and push them to trigger a fresh CI/CD compile run:
   ```bash
   git tag -d v1.0.15
   git push origin :refs/tags/v1.0.15
   git tag v1.0.15
   git push origin v1.0.15
   ```

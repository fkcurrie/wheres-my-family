# ☁️ "Where's my family!!" — Sovereign Backend & Self-Host Guide

This guide provides step-by-step instructions to deploy, secure, and self-host the entire **"Where's my family!!"** serverless backend and web dashboard stack inside your **own Google Cloud Platform (GCP) project**. 

By following these instructions, you will establish a completely private, sovereign backend located in your chosen geographical region with **$0.00/month** infrastructure running costs (fully covered under GCP's permanent free tier quotas).

---

## 🗂️ Backend Stack Overview

The backend uses a modern, ultra-lightweight, and secure serverless structure:
* **Database (Cloud Firestore):** Stored in **Native Mode**. It hosts the collection of active family member states, historical coordinate trails, and system metadata.
* **Serverless Functions (GCP Cloud Functions 2nd Gen):** A stateless Node.js 22 HTTPS microservice that acts as the sovereign gateway, handling state merges, issue posting, and deletion routines.
* **Web Dashboard (GCP Cloud Run):** Hosts the static HTML/CSS/JS control center over an optimized, fast container, making the dashboard accessible securely from any browser.

---

## 🛡️ Sovereign API Security Guidelines

Every endpoint deployed inside this system enforces strict, active security parameters:
1. **Header Verification (`X-Mantle-Key`):** Every API request must carry an `X-Mantle-Key` header matching the server's environment variable `MANTLE_KEY` to block unauthenticated coordinate harvesting.
2. **Prototype Pollution Protection:** The backend passes all document coordinate keys through a robust regex cleaning helper (`sanitizeKey`) that strips path-traversal characters (`/`, `\`, `.`) and rejects prototype pollution keys (`__proto__`, `constructor`, `prototype`).
3. **Sovereign Feedback Routing:** Standard client issue logging is routed entirely server-side. The backend uses its own secret environment keys (`GITHUB_TOKEN`) to construct tickets, fully shielding third-party credentials from client-side network exposure.

---

## 🚀 Step-by-Step Self-Hosting Deployment

Follow this guide to deploy the backend inside a new GCP project.

### Step 1: Create a GCP Project & Initialize CLI
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (e.g. `my-family-tracker-2026`).
2. Download and install the [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install) on your workstation.
3. Authenticate and set your active CLI project:
   ```powershell
   gcloud auth login
   gcloud config set project [YOUR_PROJECT_ID]
   ```

### Step 2: Enable Required Cloud APIs
Run the following command to enable the necessary microservice APIs:
```powershell
gcloud services enable `
    cloudfunctions.googleapis.com `
    firestore.googleapis.com `
    run.googleapis.com `
    artifactregistry.googleapis.com `
    cloudbuild.googleapis.com
```

### Step 3: Initialize Cloud Firestore (Native Mode)
Create your Firestore native database. Choose a geographical region close to your family (e.g. `northamerica-northeast2` for Toronto, Canada):
```powershell
gcloud firestore databases create `
    --database="(default)" `
    --location="northamerica-northeast2" `
    --type="firestore-native"
```

### Step 4: Deploy the Cloud Function
Navigate to your local `gcp-backend/` directory and deploy the serverless 2nd Gen function:
```powershell
# Run inside gcp-backend directory
gcloud functions deploy wheres-my-family-api `
    --gen2 `
    --runtime=nodejs22 `
    --region=northamerica-northeast2 `
    --trigger-http `
    --allow-unauthenticated `
    --set-env-vars="MANTLE_KEY=your_secure_hex_key_here,GITHUB_TOKEN=your_optional_github_pat" `
    --entry-point=handler
```
*Take note of the returned HTTPS URL from the output (e.g., `https://wheres-my-family-api-xxxxx-uc.a.run.app`). This is your new backend endpoint.*

### Step 5: Build & Deploy the Web Dashboard to Cloud Run
1. Navigate to the `web-dashboard/` folder.
2. Build and publish your Docker container to Artifact Registry, then run it on Cloud Run:
```powershell
# Run inside web-dashboard directory
gcloud run deploy web-dashboard `
    --source . `
    --region=northamerica-northeast2 `
    --allow-unauthenticated `
    --set-env-vars="MANTLE_KEY=your_secure_hex_key_here"
```
*Take note of the returned Cloud Run Web URL. This is your secure public control panel.*

### Step 6: Connect the Mobile App & Dashboard
1. **Web Dashboard:** Open the live Cloud Run URL and input your secure `MANTLE_KEY` and shared E2EE Passkey into the header fields to initialize E2EE decryption in your browser.
2. **Mobile App (`src/services/MantleDB.ts`):** Update the `MANTLE_API_URL` to point directly to your new Cloud Function HTTPS URL:
   ```typescript
   export const MANTLE_API_URL = 'https://[YOUR_CLOUDFUNCTION_URL_HERE]';
   export const DEFAULT_MANTLE_KEY = '[YOUR_MANTLE_KEY_HERE]';
   ```
3. Run `npm run start` and test syncing location coordinates from your phone straight to your private Firestore database!

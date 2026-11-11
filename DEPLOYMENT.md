# SmartHire Deployment Guide

This guide provides clear, step-by-step instructions to deploy the entire **SmartHire** AI Hiring Platform to production on **Vercel**, **Netlify**, **Render**, and **Railway**.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │        Vercel / Netlify (CDN)         │
                      │                                       │
                      │   /               → Unified Gateway   │
                      │   /candidate      → Candidate Portal  │
                      │   /interviewer    → Interviewer Portal│
                      │   /admin          → Admin Portal      │
                      │   /proctored-exam → Exam Proctoring   │
                      └───────────────────┬───────────────────┘
                                          │
                                          │ REST API & AI Bridge
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    Render / Railway / Cloud Host      │
                      │                                       │
                      │   SmartHire Backend API (Node.js 20)  │
                      │   - AI Resume Keyword Screening       │
                      │   - Dynamic Technical Proctoring      │
                      │   - Interviewer & Application Isolation│
                      │   - Real-time Admin Dashboard Stats   │
                      └───────────────────────────────────────┘
```

---

## Option 1: Unified 1-Click Frontend Deployment (Recommended)

In this approach, all 4 portals (Gateway, Candidate, Interviewer, Admin) and the Proctored Exam are built into a single unified `dist/` directory and deployed under one domain.

### Step 1: Deploy Backend API First

1. **Deploy on Render (Free & Fast)**:
   - Sign up or log into [Render.com](https://render.com/).
   - Click **New +** → **Blueprint** (or **Web Service**).
   - Connect your GitHub repository.
   - If using Blueprint: Render automatically detects [`render.yaml`](file:///Users/ashok/Downloads/BNP-BLR-Team-26-main/render.yaml).
   - If using Web Service:
     - **Root Directory**: `Backend`
     - **Runtime**: `Node`
     - **Build Command**: *(leave blank)*
     - **Start Command**: `node local_proxy.js`
   - Click **Deploy Web Service**.
   - Copy your public backend URL (e.g. `https://smarthire-api.onrender.com`).

2. **Alternative: Deploy on Railway**:
   - Sign up or log into [Railway.app](https://railway.app/).
   - Click **New Project** → **Deploy from GitHub repo**.
   - In Settings, set **Root Directory** to `/Backend` (or deploy root with Dockerfile).
   - Railway will auto-detect the [`Backend/Procfile`](file:///Users/ashok/Downloads/BNP-BLR-Team-26-main/Backend/Procfile) / [`Backend/package.json`](file:///Users/ashok/Downloads/BNP-BLR-Team-26-main/Backend/package.json).
   - Generate a domain in **Settings** → **Networking**.

---

### Step 2: Deploy Unified Frontend on Vercel

1. Log into [Vercel](https://vercel.com/) and click **Add New** → **Project**.
2. Select your SmartHire repository.
3. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave as root)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add Environment Variables:
   - `VITE_API_BASE_URL` = `https://your-backend-api.onrender.com`
   - `VITE_SMARTHIRE_API_BASE` = `https://your-backend-api.onrender.com`
5. Click **Deploy**.
6. When complete, your single Vercel URL hosts:
   - `/` → Unified Access Gateway
   - `/candidate/` → Candidate Portal
   - `/interviewer/` → Interviewer Portal
   - `/admin/` → Admin Portal
   - `/proctored-exam/` → Proctored Exam Portal

---

### Step 3: Deploy Unified Frontend on Netlify

1. Log into [Netlify](https://www.netlify.com/) and click **Add new site** → **Import an existing project**.
2. Connect your Git repository.
3. Netlify will auto-detect [`netlify.toml`](file:///Users/ashok/Downloads/BNP-BLR-Team-26-main/netlify.toml):
   - **Base directory**: *(empty)*
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Add Environment Variables in **Site configuration** → **Environment variables**:
   - `VITE_API_BASE_URL` = `https://your-backend-api.onrender.com`
   - `VITE_SMARTHIRE_API_BASE` = `https://your-backend-api.onrender.com`
5. Click **Deploy site**.

---

## Option 2: Individual Micro-Frontend Portals

If your team prefers dedicated domains for each portal (e.g. `candidate.mycompany.com`, `interviewer.mycompany.com`, `admin.mycompany.com`):

### 1. Candidate Portal
- **Vercel / Netlify Root Directory**: `Frontend/smarthire-candidate-frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL` = `https://your-backend-api.onrender.com`
  - `VITE_EXAM_APP_URL` = `https://exam.mycompany.com` *(or leave blank to use backend proctoring)*

### 2. Interviewer Portal
- **Vercel / Netlify Root Directory**: `Frontend/SmartHire-interviewer-frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_SMARTHIRE_API_BASE` = `https://your-backend-api.onrender.com`
  - `VITE_API_BASE_URL` = `https://your-backend-api.onrender.com`

### 3. Admin Portal
- **Vercel / Netlify Root Directory**: `Frontend/smarthire-admin-frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL` = `https://your-backend-api.onrender.com`

### 4. Proctored Exam Portal
- **Vercel / Netlify Root Directory**: `Frontend/proctored-exam`
- **Build Command**: *(None - static)*
- **Publish Directory**: `.`

### 5. Unified Gateway
- **Vercel / Netlify Root Directory**: `Frontend/gateway`
- **Build Command**: *(None - static)*
- **Publish Directory**: `.`
- You can pass portal URLs via query params or localStorage:
  `https://gateway.mycompany.com/?candidate_url=https://candidate.mycompany.com&interviewer_url=https://interviewer.mycompany.com&admin_url=https://admin.mycompany.com&api_base=https://your-backend-api.onrender.com`

---

## Option 3: Docker Deployment (AWS ECS, Fly.io, GCP Cloud Run)

To run the backend with Docker:

```bash
# Build the Docker image
docker build -t smarthire-backend Backend/

# Run the container
docker run -p 8000:8000 -e PORT=8000 smarthire-backend
```

---

## Verification & Post-Deployment Testing

Once deployed, perform this quick 4-step verification:

1. **Backend Health Check**:
   - Open `https://your-backend-api.onrender.com/` in your browser.
   - You should see the SmartHire Unified Access Gateway.
   - Open `https://your-backend-api.onrender.com/admin/dashboard` — verify it returns JSON with stats (`total_jobs`, `live_jobs`, `total_applications`, `interviewers`).

2. **Admin Portal**:
   - Log into Admin Portal with `admin@bnp.com`.
   - Verify non-zero dashboard cards (Total Jobs, Live Jobs, Total Applications, Interviewers).
   - Create a Job Description and assign it to an interviewer.

3. **Interviewer Portal**:
   - Log into Interviewer Portal with the assigned interviewer email.
   - Verify strict isolation: only the assigned job description appears.

4. **Candidate Portal & Proctored Exam**:
   - Sign up or log into Candidate Portal.
   - Apply to the job with a matching resume.
   - Verify resume match score clears the threshold.
   - Click **Enter Proctored Exam** and complete the assessment.


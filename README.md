# PathGuard — Pathology Triage Dashboard

A GP inbox tool that ingests HL7 pathology results, triages them by clinical urgency, and presents them in a clean dashboard. Designed for Greenwood Medical Centre.

---

## Running Locally

### Mac — double-click to start
Double-click **`start_pathguard.command`**. The dashboard opens at **http://localhost:5173**.

### Windows — double-click to start
Double-click **`start_pathguard.bat`**. The dashboard opens at **http://localhost:5173**.

> **First run only** — the script installs Python and Node dependencies automatically (~1 min). Subsequent starts are fast.

---

## Deploying to the Web

### Option A — Railway (recommended)

Railway builds and deploys automatically from your GitHub repo. No manual build step needed — `nixpacks.toml` handles everything.

```bash
# 1. Push this repo to GitHub (if you haven't already)
git init && git add . && git commit -m "Initial commit"
gh repo create pathguard --public --push   # or use github.com

# 2. Install Railway CLI and deploy
npm install -g @railway/cli
railway login
railway init          # creates a new project
railway up            # deploys — takes ~2 min on first run
railway open          # opens your live URL
```

Or use the **Railway dashboard** at [railway.app](https://railway.app):
1. New Project → **Deploy from GitHub repo**
2. Select this repo — Railway detects `nixpacks.toml` automatically
3. Click **Deploy** — you get a public URL like `pathguard-production.up.railway.app`

**What happens on each deploy:**
- Railway installs Node + Python, builds the React app, copies `frontend/dist/` → `backend/static/`
- FastAPI serves everything — static files and API — from a single process
- The SQLite DB starts empty, but demo data is auto-loaded on startup so the dashboard is never blank

---

### Option B — Render

Render uses `render.yaml` for zero-config deployment.

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. **New → Web Service → Connect GitHub repo**
3. Render detects `render.yaml` and configures the build automatically
4. Click **Create Web Service** — you get a URL like `pathguard.onrender.com`

> **Free tier note:** Render spins down after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to wake up. This is fine for demos.

---

### Option C — Pre-build locally, deploy anywhere

If your hosting platform only runs Python (no Node available at build time):

```bash
./deploy.sh          # builds frontend → backend/static/
```

Then deploy just the repo with `backend/static/` committed. The Python process serves everything.

---

## Using PathGuard

### Getting results into the dashboard

| Method | How |
|--------|-----|
| **Drop folder** | Drop `.hl7` or `.pit` files into `drop_results_here/` — they appear within seconds |
| **Browser upload** | Drag `.hl7` files directly onto the dashboard in your browser |
| **Load Demo Data** | Click **⋮ menu → Load Demo Data** to populate with 15 realistic sample patients |

### Triage levels

| Severity | Meaning |
|----------|---------|
| **Critical** | HH / LL flags — needs immediate attention |
| **Review** | H / L flags — abnormal, requires review |
| **Normal** | All within reference range |

- Click any card to expand — **Smart View** (structured table) or **Original Report** (lab printout format)
- Action buttons: **No Action**, **Recall Patient**, **Nurse to Contact**, **Urgent**
- **Clear All Normals** bulk-files all normal results at once
- **⋮ menu → Reset Database** clears everything for a fresh demo

---

## Project Structure

```
PathGuard/
├── start_pathguard.command   ← Mac launcher (double-click)
├── start_pathguard.bat       ← Windows launcher (double-click)
├── deploy.sh                 ← Pre-build for deployment
├── nixpacks.toml             ← Railway build config
├── Procfile                  ← Railway start command
├── render.yaml               ← Render deploy config
│
├── drop_results_here/        ← Drop .hl7 files here (local use)
│   ├── processed/
│   └── README.txt
│
├── demo_data/                ← 15 sample HL7 files
│
├── backend/                  ← FastAPI + SQLite
│   ├── main.py               ← API + serves frontend/static in production
│   ├── watcher.py            ← Folder watcher
│   ├── hl7_parser.py
│   ├── triage.py
│   ├── store.py
│   ├── requirements.txt
│   └── static/               ← Built frontend (created by deploy.sh / CI)
│
├── frontend/                 ← React + Vite + Tailwind
│   └── src/
│
└── logs/                     ← backend.log, frontend.log (local only)
```

---

## How the production build works

```
browser  ──GET /──────────────────►  FastAPI
                                      │
                                      ├── /api/*  →  Python handlers
                                      │
                                      ├── /assets/*  →  backend/static/assets/
                                      │
                                      └── everything else  →  backend/static/index.html
                                                                (React SPA takes over)
```

The frontend detects it's in production (`import.meta.env.DEV === false`) and uses relative API paths (`/api/results`) instead of `http://localhost:8000`.

---

## Requirements

| Dependency | Version |
|------------|---------|
| Python | 3.10+ |
| Node.js | 18+ (local dev / pre-build only) |

---

*PathGuard v1.0 — For authorised use in Greenwood Medical Centre. Not a substitute for clinical judgement.*

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  deploy.sh — Build PathGuard for production deployment
#
#  What this does:
#    1. Builds the React frontend (npm run build)
#    2. Copies frontend/dist/ → backend/static/
#    3. Prints next steps for Railway or Render
#
#  Run this once before pushing to your hosting provider, OR let the
#  platform build it automatically using nixpacks.toml (Railway) or
#  render.yaml (Render).
#
#  Usage:
#    chmod +x deploy.sh
#    ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       PathGuard — Production Build       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Check dependencies ────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: node not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi
if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found."
  exit 1
fi

# ── Install frontend dependencies ─────────────────────────────────
echo "→ Installing frontend dependencies…"
npm ci --prefix frontend

# ── Build frontend ────────────────────────────────────────────────
echo "→ Building React frontend…"
npm run build --prefix frontend

# ── Copy dist → backend/static ────────────────────────────────────
echo "→ Copying build output to backend/static/…"
rm -rf backend/static
mkdir -p backend/static
cp -r frontend/dist/. backend/static/

echo ""
echo "✓ Build complete. backend/static/ is ready."
echo ""

# ── Verify ────────────────────────────────────────────────────────
if [ ! -f backend/static/index.html ]; then
  echo "ERROR: backend/static/index.html not found — build may have failed."
  exit 1
fi

FILE_COUNT=$(find backend/static -type f | wc -l | tr -d ' ')
echo "  Files in backend/static/: $FILE_COUNT"
echo ""

# ── Next steps ────────────────────────────────────────────────────
cat <<'EOF'
═══════════════════════════════════════════════════════════════════
  NEXT STEPS
═══════════════════════════════════════════════════════════════════

  To test the production build locally:
    cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
    open http://localhost:8000

  ── Deploy to Railway ────────────────────────────────────────────
  Railway builds automatically using nixpacks.toml — no need to
  run this script first. Just push your repo:

    1. Install Railway CLI:   npm install -g @railway/cli
    2. Login:                 railway login
    3. Create project:        railway init
    4. Deploy:                railway up
    5. Get your URL:          railway open

  Or use the Railway dashboard at https://railway.app
    → New Project → Deploy from GitHub repo → select this repo

  ── Deploy to Render ─────────────────────────────────────────────
  Render builds automatically using render.yaml:

    1. Go to https://dashboard.render.com
    2. New → Web Service → Connect your GitHub repo
    3. Render detects render.yaml and configures everything
    4. Click "Create Web Service"

  Note: Render's free tier spins down after 15 min of inactivity.
  The first request after sleep takes ~30 seconds to wake up.

═══════════════════════════════════════════════════════════════════
EOF

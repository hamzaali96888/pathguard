#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  PathGuard — Mac launcher
#  Double-click this file to start PathGuard.
#  The dashboard will open automatically in your browser.
# ─────────────────────────────────────────────────────────────────

# Always run from the project root (handles double-click from Finder)
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"

BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DROP_DIR="$PROJECT_ROOT/drop_results_here"
LOG_DIR="$PROJECT_ROOT/logs"

mkdir -p "$DROP_DIR/processed" "$LOG_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║           PathGuard is starting…         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Kill any stale processes from a previous session ──────────────
lsof -ti :8000 | xargs kill -9 2>/dev/null && echo "→ Stopped existing backend on :8000"
lsof -ti :5173 | xargs kill -9 2>/dev/null && echo "→ Stopped existing frontend on :5173"

# ── Check Python ──────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo ""
  echo "ERROR: python3 not found."
  echo "Install Python 3.10+ from https://python.org and try again."
  read -p "Press Enter to close..."
  exit 1
fi

# ── Install Python dependencies if needed ────────────────────────
echo "→ Checking Python dependencies…"
if ! python3 -c "import fastapi, uvicorn, watchdog" 2>/dev/null; then
  echo "→ Installing Python dependencies (first run only)…"
  python3 -m pip install -r "$BACKEND_DIR/requirements.txt" --quiet
fi

# ── Check Node / npm ──────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo ""
  echo "ERROR: node not found."
  echo "Install Node.js 18+ from https://nodejs.org and try again."
  read -p "Press Enter to close..."
  exit 1
fi

# ── Install Node dependencies if needed ──────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "→ Installing frontend dependencies (first run only)…"
  npm --prefix "$FRONTEND_DIR" install --silent
fi

# ── Start backend ─────────────────────────────────────────────────
echo "→ Starting backend on http://localhost:8000…"
cd "$BACKEND_DIR"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

# Wait for backend to be ready (up to 15 s)
echo "→ Waiting for backend…"
for i in $(seq 1 15); do
  sleep 1
  if curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
    echo "→ Backend ready."
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "WARNING: Backend may not have started. Check logs/backend.log"
  fi
done

# ── Start frontend ────────────────────────────────────────────────
echo "→ Starting frontend on http://localhost:5173…"
npm --prefix "$FRONTEND_DIR" run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# Give Vite a moment then open the browser
sleep 2
open http://localhost:5173

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  PathGuard is running!"
echo ""
echo "  Dashboard: http://localhost:5173"
echo "  Drop .hl7 files into:  drop_results_here/"
echo ""
echo "  Logs:  logs/backend.log   logs/frontend.log"
echo "  Press Ctrl+C to stop both servers."
echo "═══════════════════════════════════════════════════════"
echo ""

# Keep terminal open and forward signals so Ctrl+C shuts everything down
trap "echo ''; echo 'Stopping PathGuard…'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait $BACKEND_PID $FRONTEND_PID

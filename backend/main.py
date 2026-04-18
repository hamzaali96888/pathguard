"""
main.py — FastAPI web server for PathGuard.

In production the built React frontend lives in backend/static/ and is served
directly by this process — no separate Node server needed.

API endpoints:
  GET  /api/health                — health check
  GET  /api/results               — triaged, grouped unreviewed results
  POST /api/results/{id}/review   — mark single result reviewed
  POST /api/results/clear-normals — mark all normal results reviewed
  POST /api/upload                — upload an HL7/PIT file → drop_results_here/
  POST /api/load-demo             — copy demo_data/ files → drop_results_here/
  POST /api/reset                 — delete all results from the DB

Startup sequence:
  1. Initialise SQLite DB
  2. Process any files already sitting in drop_results_here/
  3. If the DB is still empty, auto-load demo_data/ so the dashboard isn't blank
  4. Start background folder watcher on drop_results_here/
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import store
import triage as triage_engine
from watcher import HL7Watcher, process_existing_files, load_demo_direct, process_hl7_file, WATCH_DIR

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_HERE = os.path.dirname(__file__)

DEMO_DATA_DIR = os.environ.get(
    "PATHGUARD_DEMO_DIR",
    os.path.join(_HERE, "..", "demo_data"),
)

STATIC_DIR = os.path.join(_HERE, "static")

WATCHED_EXTENSIONS = {".hl7", ".pit", ".pdf"}

_watcher = HL7Watcher(watch_dir=WATCH_DIR)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    store.init_db()
    print("[main] Database initialised")

    # Pick up any files already dropped while the server was offline
    processed = process_existing_files(WATCH_DIR)
    if processed:
        print(f"[main] Processed {processed} existing record(s) from drop_results_here/")

    # Auto-load demo data when the DB is empty (first deploy, or after a reset+restart)
    if store.get_unreviewed_count() == 0:
        loaded = load_demo_direct(os.path.abspath(DEMO_DATA_DIR))
        if loaded:
            print(f"[main] Auto-loaded {loaded} demo record(s) — dashboard pre-populated")

    _watcher.start()
    yield
    _watcher.stop()
    print("[main] Watcher stopped")


# ---------------------------------------------------------------------------
# App + middleware
# ---------------------------------------------------------------------------

app = FastAPI(title="PathGuard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # In production everything is same-origin; keep localhost entries for dev
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve Vite's hashed asset bundles (/assets/…) when the static dir exists
_assets_dir = os.path.join(STATIC_DIR, "assets")
if os.path.isdir(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")


# ---------------------------------------------------------------------------
# API — health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "PathGuard"}


# ---------------------------------------------------------------------------
# API — results
# ---------------------------------------------------------------------------

@app.get("/api/results")
def get_results():
    raw = store.get_unreviewed()
    triaged = triage_engine.triage_db_records(raw)

    for patient in triaged["patients"]:
        for result in patient["results"]:
            flag = (result.get("flag") or "").upper()
            if flag and flag not in ("N", ""):
                result["trend"] = store.get_trend(
                    patient_dob=result.get("patient_dob", ""),
                    test_name=result.get("test_name", ""),
                )
            else:
                result["trend"] = []

    return triaged


@app.post("/api/results/{result_id}/review")
def review_result(result_id: int):
    updated = store.mark_reviewed(result_id)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Result {result_id} not found")
    return {"success": True, "id": result_id}


@app.post("/api/results/clear-normals")
def clear_normals():
    count = store.mark_all_normals_reviewed()
    return {"success": True, "cleared": count}


# ---------------------------------------------------------------------------
# API — file upload
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in WATCHED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Expected: {', '.join(sorted(WATCHED_EXTENSIONS))}",
        )

    watch_dir = os.path.abspath(WATCH_DIR)
    os.makedirs(watch_dir, exist_ok=True)
    dest = os.path.join(watch_dir, file.filename)

    if os.path.exists(dest):
        ts = str(int(time.time()))
        name, sfx = os.path.splitext(file.filename)
        dest = os.path.join(watch_dir, f"{name}_{ts}{sfx}")

    contents = await file.read()
    with open(dest, "wb") as f:
        f.write(contents)

    # Process immediately — don't wait for the filesystem watcher
    count = process_hl7_file(dest)
    print(f"[upload] Processed {os.path.basename(dest)} — {count} record(s)")
    return {"success": True, "filename": os.path.basename(dest), "records": count}


# ---------------------------------------------------------------------------
# API — demo & reset
# ---------------------------------------------------------------------------

@app.post("/api/load-demo")
def load_demo():
    demo_dir = os.path.abspath(DEMO_DATA_DIR)
    if not os.path.isdir(demo_dir):
        raise HTTPException(status_code=404, detail="demo_data/ folder not found")

    # Process directly into the DB — no watcher dependency
    count = load_demo_direct(demo_dir)
    return {"success": True, "files_copied": count}


@app.post("/api/reset")
def reset():
    deleted = store.reset_db()
    print(f"[reset] Cleared {deleted} record(s) from database")
    return {"success": True, "deleted": deleted}


# ---------------------------------------------------------------------------
# SPA catch-all — serve index.html for every non-API, non-asset route
# Must be declared AFTER all /api routes so FastAPI matches those first.
# ---------------------------------------------------------------------------

@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    # Serve an exact static file if it exists (e.g. favicon.ico)
    candidate = os.path.join(STATIC_DIR, full_path)
    if full_path and os.path.isfile(candidate):
        return FileResponse(candidate)

    index = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)

    raise HTTPException(
        status_code=404,
        detail="Frontend not built. Run deploy.sh first.",
    )


# ---------------------------------------------------------------------------
# Dev entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

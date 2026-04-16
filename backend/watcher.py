"""
watcher.py — Folder watcher for new HL7 files.

Monitors the drop_results_here/ directory for new files using watchdog.
When a file appears: parse it, save to DB, move it to the processed/ subfolder.
Runs in a background thread so FastAPI startup is non-blocking.

Supported extensions: .hl7  .HL7  .pit  .PIT
"""

from __future__ import annotations

import os
import shutil
import threading
import time
from pathlib import Path


from watchdog.events import FileSystemEventHandler, FileCreatedEvent
from watchdog.observers import Observer

from hl7_parser import parse_hl7_file
from store import save_results


# Default watch directory: drop_results_here/ in project root
WATCH_DIR = os.environ.get(
    "PATHGUARD_WATCH_DIR",
    os.path.join(os.path.dirname(__file__), "..", "drop_results_here"),
)

WATCHED_EXTENSIONS = {".hl7", ".pit"}


def _is_watched(filename: str) -> bool:
    return Path(filename).suffix.lower() in WATCHED_EXTENSIONS


def process_hl7_file(filepath: str) -> int:
    """
    Parse a single HL7/PIT file, persist results, and move file to /processed.

    Returns the number of OBX records saved.
    """
    filepath = os.path.abspath(filepath)
    processed_dir = os.path.join(os.path.dirname(filepath), "processed")
    os.makedirs(processed_dir, exist_ok=True)

    try:
        records = parse_hl7_file(filepath)
        if records:
            save_results(records, source_file=os.path.basename(filepath))
            patient = records[0].get("patient_name", "Unknown") if records else "Unknown"
            print(
                f"[watcher] New result: {os.path.basename(filepath)} "
                f"— Patient: {patient} — {len(records)} test(s) parsed"
            )
        else:
            print(f"[watcher] No results parsed from {os.path.basename(filepath)}")

        # Move to processed/ — append timestamp suffix to avoid overwrite conflicts
        dest = os.path.join(processed_dir, os.path.basename(filepath))
        if os.path.exists(dest):
            ts = str(int(time.time()))
            name, ext = os.path.splitext(os.path.basename(filepath))
            dest = os.path.join(processed_dir, f"{name}_{ts}{ext}")

        shutil.move(filepath, dest)
        print(f"[watcher] Moved {os.path.basename(filepath)} → processed/")
        return len(records) if records else 0

    except Exception as e:
        print(f"[watcher] Error processing {filepath}: {e}")
        return 0


def process_existing_files(watch_dir: str) -> int:
    """
    Process any HL7/PIT files already sitting in watch_dir at startup.
    Returns total number of records saved.
    """
    watch_dir = os.path.abspath(watch_dir)
    if not os.path.isdir(watch_dir):
        print(f"[watcher] Watch directory does not exist: {watch_dir}")
        return 0

    total = 0
    for fname in sorted(os.listdir(watch_dir)):
        if _is_watched(fname):
            full_path = os.path.join(watch_dir, fname)
            if os.path.isfile(full_path):
                total += process_hl7_file(full_path)
    return total


def load_demo_direct(demo_dir: str) -> int:
    """
    Parse all demo files directly into the DB *without* moving them.
    Used at startup to pre-populate the dashboard when the DB is empty.
    The source files stay in demo_dir so they survive restarts.

    Returns total number of records saved.
    """
    demo_dir = os.path.abspath(demo_dir)
    if not os.path.isdir(demo_dir):
        return 0

    total = 0
    for fname in sorted(os.listdir(demo_dir)):
        if _is_watched(fname):
            filepath = os.path.join(demo_dir, fname)
            if os.path.isfile(filepath):
                try:
                    records = parse_hl7_file(filepath)
                    if records:
                        save_results(records, source_file=fname)
                        total += len(records)
                except Exception as e:
                    print(f"[demo] Error loading {fname}: {e}")

    if total:
        print(f"[demo] Auto-loaded {total} record(s) from demo_data/")
    return total


class _HL7Handler(FileSystemEventHandler):
    """watchdog event handler: react to new HL7/PIT files."""

    def on_created(self, event: FileCreatedEvent):
        if event.is_directory:
            return
        if _is_watched(event.src_path):
            # Brief delay to ensure the file is fully written before reading
            time.sleep(0.5)
            process_hl7_file(event.src_path)


class HL7Watcher:
    """Background thread that watches a directory for new HL7/PIT files."""

    def __init__(self, watch_dir: str = WATCH_DIR):
        self.watch_dir = os.path.abspath(watch_dir)
        self._observer = None
        self._thread = None

    def start(self):
        os.makedirs(self.watch_dir, exist_ok=True)
        event_handler = _HL7Handler()
        self._observer = Observer()
        self._observer.schedule(event_handler, self.watch_dir, recursive=False)

        self._thread = threading.Thread(target=self._run, daemon=True, name="hl7-watcher")
        self._thread.start()
        print(f"[watcher] Watching {self.watch_dir} for new files (.hl7, .pit)")

    def _run(self):
        self._observer.start()
        try:
            while True:
                time.sleep(1)
        except Exception:
            self._observer.stop()
        self._observer.join()

    def stop(self):
        if self._observer:
            self._observer.stop()
            self._observer.join()

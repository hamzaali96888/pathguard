"""
store.py — SQLite persistence layer for PathGuard.

Stores parsed HL7 result records, supports mark-as-reviewed workflow,
and provides last-5 historical trending for any patient+test combination.
"""

import sqlite3
import os
from datetime import datetime, timezone
from typing import Optional

DB_PATH = os.environ.get("PATHGUARD_DB", os.path.join(os.path.dirname(__file__), "pathguard.db"))


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create tables if they don't exist."""
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS results (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_name    TEXT NOT NULL,
                patient_dob     TEXT,
                patient_sex     TEXT,
                surname         TEXT,
                first_name      TEXT,
                test_name       TEXT NOT NULL,
                loinc_code      TEXT,
                value           TEXT,
                units           TEXT,
                ref_range       TEXT,
                flag            TEXT,
                result_status   TEXT,
                lab_name        TEXT,
                collected_date  TEXT,
                reported_date   TEXT,
                panel_name      TEXT,
                ordering_doctor TEXT,
                reviewed        INTEGER NOT NULL DEFAULT 0,
                reviewed_at     TEXT,
                created_at      TEXT NOT NULL,
                source_file     TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_patient_dob_test
            ON results (patient_dob, test_name)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_reviewed
            ON results (reviewed)
        """)
        conn.commit()


def save_results(records: list[dict], source_file: str = "") -> list[int]:
    """
    Persist a list of OBX-level result dicts to the database.

    Returns the list of inserted row IDs.
    """
    now = datetime.now(timezone.utc).isoformat()
    inserted_ids = []

    with _get_conn() as conn:
        for r in records:
            cursor = conn.execute(
                """
                INSERT INTO results (
                    patient_name, patient_dob, patient_sex,
                    surname, first_name,
                    test_name, loinc_code, value, units, ref_range,
                    flag, result_status,
                    lab_name, collected_date, reported_date,
                    panel_name, ordering_doctor,
                    reviewed, created_at, source_file
                ) VALUES (
                    :patient_name, :patient_dob, :patient_sex,
                    :surname, :first_name,
                    :test_name, :loinc_code, :value, :units, :ref_range,
                    :flag, :result_status,
                    :lab_name, :collected_date, :reported_date,
                    :panel_name, :ordering_doctor,
                    0, :created_at, :source_file
                )
                """,
                {
                    "patient_name":    r.get("patient_name", ""),
                    "patient_dob":     r.get("patient_dob", ""),
                    "patient_sex":     r.get("patient_sex", ""),
                    "surname":         r.get("surname", ""),
                    "first_name":      r.get("first_name", ""),
                    "test_name":       r.get("test_name", ""),
                    "loinc_code":      r.get("loinc_code", ""),
                    "value":           r.get("value", ""),
                    "units":           r.get("units", ""),
                    "ref_range":       r.get("ref_range", ""),
                    "flag":            r.get("flag", ""),
                    "result_status":   r.get("result_status", ""),
                    "lab_name":        r.get("sending_facility", r.get("lab_name", "")),
                    "collected_date":  r.get("collected_date", ""),
                    "reported_date":   r.get("reported_date", ""),
                    "panel_name":      r.get("panel_name", ""),
                    "ordering_doctor": r.get("ordering_doctor", ""),
                    "created_at":      now,
                    "source_file":     source_file,
                },
            )
            inserted_ids.append(cursor.lastrowid)
        conn.commit()

    return inserted_ids


def get_unreviewed() -> list[dict]:
    """Return all unreviewed results as a list of dicts."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM results WHERE reviewed = 0 ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def get_all_results() -> list[dict]:
    """Return all results (reviewed and unreviewed)."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM results ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def mark_reviewed(result_id: int) -> bool:
    """Mark a single result row as reviewed. Returns True if a row was updated."""
    now = datetime.now(timezone.utc).isoformat()
    with _get_conn() as conn:
        cursor = conn.execute(
            "UPDATE results SET reviewed = 1, reviewed_at = ? WHERE id = ?",
            (now, result_id),
        )
        conn.commit()
    return cursor.rowcount > 0


def mark_all_normals_reviewed() -> int:
    """Mark all unreviewed normal (flag = 'N' or blank) results as reviewed.

    Returns the count of rows updated.
    """
    now = datetime.now(timezone.utc).isoformat()
    with _get_conn() as conn:
        cursor = conn.execute(
            """
            UPDATE results
            SET reviewed = 1, reviewed_at = ?
            WHERE reviewed = 0
              AND (flag = 'N' OR flag = '' OR flag IS NULL)
            """,
            (now,),
        )
        conn.commit()
    return cursor.rowcount


def get_trend(patient_dob: str, test_name: str) -> list[dict]:
    """
    Return up to the last 5 historical results for a patient+test combination,
    ordered most recent first (excluding the current unreviewed result if it
    exists — callers can decide how to handle that).
    """
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, value, units, flag, ref_range, collected_date, reported_date
            FROM results
            WHERE patient_dob = ?
              AND LOWER(test_name) = LOWER(?)
            ORDER BY
                COALESCE(collected_date, reported_date, created_at) DESC
            LIMIT 5
            """,
            (patient_dob, test_name),
        ).fetchall()
    return [dict(row) for row in rows]


def get_result_by_id(result_id: int) -> Optional[dict]:
    """Return a single result row by ID."""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM results WHERE id = ?", (result_id,)
        ).fetchone()
    return dict(row) if row else None


def get_unreviewed_count() -> int:
    """Return the count of unreviewed results (used to decide auto-load at startup)."""
    with _get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) FROM results WHERE reviewed = 0").fetchone()
    return row[0] if row else 0


def reset_db() -> int:
    """Delete all result rows. Returns the number of rows deleted."""
    with _get_conn() as conn:
        cursor = conn.execute("DELETE FROM results")
        conn.commit()
    return cursor.rowcount

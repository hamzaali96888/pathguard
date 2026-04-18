"""
pdf_parser.py — Extract structured lab results from pathology PDF reports.

Handles common Australian pathology lab formats:
  QML, Sullivan Nicolaides (SNP), Healthscope, Laverty, and similar.

Returns the same list-of-dicts format as hl7_parser.py so the rest of the
pipeline (store.py, triage.py) needs no changes.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def parse_pdf_file(filepath: str) -> list[dict]:
    """
    Parse a pathology PDF report and return a list of result records.
    Returns [] if pdfplumber is unavailable or the file can't be parsed.
    """
    try:
        import pdfplumber
    except ImportError:
        print("[pdf_parser] pdfplumber not installed — cannot parse PDF")
        return []

    try:
        with pdfplumber.open(filepath) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        full_text = "\n".join(pages)
    except Exception as e:
        print(f"[pdf_parser] Could not read {Path(filepath).name}: {e}")
        return []

    if not full_text.strip():
        print(f"[pdf_parser] No text extracted from {Path(filepath).name} (scanned image?)")
        return []

    # ── Extract header fields ─────────────────────────────────────
    patient_name    = _extract_patient_name(full_text)
    patient_dob_raw = _extract_dob(full_text)
    patient_dob     = _normalise_dob(patient_dob_raw)
    patient_sex     = _extract_sex(full_text)
    lab_name        = _extract_lab_name(full_text, filepath)
    panel_name      = _extract_panel_name(full_text)
    collected_date  = _extract_date(full_text, "collect")
    reported_date   = _extract_date(full_text, "report")
    ordering_doctor = _extract_doctor(full_text)

    surname    = patient_name.split()[0]  if patient_name else ""
    first_name = " ".join(patient_name.split()[1:]) if len(patient_name.split()) > 1 else ""

    # ── Extract result rows ───────────────────────────────────────
    raw_results = _extract_results(full_text)

    if not raw_results:
        print(f"[pdf_parser] No result rows found in {Path(filepath).name}")
        return []

    records = []
    for r in raw_results:
        records.append({
            "patient_name":    patient_name,
            "patient_dob":     patient_dob,
            "patient_sex":     patient_sex,
            "surname":         surname,
            "first_name":      first_name,
            "lab_name":        lab_name,
            "panel_name":      panel_name,
            "test_name":       r["test_name"],
            "loinc_code":      "",
            "value":           r["value"],
            "units":           r.get("units", ""),
            "ref_range":       r.get("ref_range", ""),
            "flag":            r.get("flag", ""),
            "result_status":   "F",
            "collected_date":  collected_date,
            "reported_date":   reported_date,
            "ordering_doctor": ordering_doctor,
            "sending_facility": lab_name,
        })

    print(f"[pdf_parser] Extracted {len(records)} result(s) from {Path(filepath).name}")
    return records


# ---------------------------------------------------------------------------
# Header extraction helpers
# ---------------------------------------------------------------------------

def _search(patterns: list[str], text: str, group: int = 1) -> str:
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
        if m:
            return m.group(group).strip()
    return ""


def _extract_patient_name(text: str) -> str:
    raw = _search([
        r"Patient(?:\s+Name)?[:\s]+([A-Z][A-Za-z'\-]+(?:\s+[A-Za-z'\-]+){1,4})",
        r"Name[:\s]+([A-Z][A-Za-z'\-]+(?:,\s*[A-Za-z'\-]+)+)",
        r"PATIENT[:\s]+([A-Z][A-Za-z'\-]+(?:\s+[A-Za-z'\-]+){1,4})",
    ], text)
    if not raw:
        return "Unknown Patient"
    # Normalise "SMITH, John" → "Smith John" for display
    raw = re.sub(r",\s*", " ", raw).strip()
    # Title-case if all-caps
    if raw == raw.upper():
        raw = raw.title()
    return raw


def _extract_dob(text: str) -> str:
    return _search([
        r"D\.?O\.?B\.?\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        r"Date of Birth\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        r"Born\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
    ], text)


def _normalise_dob(raw: str) -> str:
    """Convert DD/MM/YYYY or DD-MM-YYYY → YYYYMMDD (HL7 format)."""
    if not raw:
        return ""
    parts = re.split(r"[/\-\.]", raw)
    if len(parts) == 3:
        d, m, y = parts
        if len(y) == 2:
            y = ("19" if int(y) > 30 else "20") + y
        if len(y) == 4:
            return f"{y}{m.zfill(2)}{d.zfill(2)}"
    return raw


def _extract_sex(text: str) -> str:
    raw = _search([
        r"Sex\s*[:\-]?\s*([MFmf](?:ale)?)",
        r"Gender\s*[:\-]?\s*([MFmf](?:ale)?)",
        r"\b(Male|Female)\b",
    ], text)
    if not raw:
        return ""
    return raw[0].upper()    # M or F


def _extract_lab_name(text: str, filepath: str) -> str:
    """Try to identify the lab from the report header or filename."""
    labs = {
        "QML":                  r"QML|Queensland Medical",
        "Sullivan Nicolaides":  r"Sullivan\s+Nicolaides|SNP Pathology",
        "Healthscope":          r"Healthscope Pathology",
        "Laverty":              r"Laverty Pathology|Laverty\b",
        "Dorevitch":            r"Dorevitch Pathology",
        "Australian Clinical":  r"Australian Clinical Labs|ACL\b",
        "Sonic":                r"Sonic\s+(?:Healthcare|Pathology)",
        "St Vincent's":         r"St\s+Vincent",
        "NSW Health Pathology": r"NSW Health Pathology|NSWHP",
    }
    for name, pat in labs.items():
        if re.search(pat, text[:500], re.IGNORECASE):
            return name
    # Fall back to first capitalised line of the report (usually the lab header)
    for line in text.splitlines()[:5]:
        line = line.strip()
        if len(line) > 3 and line[0].isupper():
            return line[:40]
    return Path(filepath).stem


def _extract_panel_name(text: str) -> str:
    candidates = [
        r"(?:Panel|Test|Report|Profile)[:\s]+([A-Za-z][A-Za-z\s\(\)\/]+)",
        r"^([A-Z][A-Z\s]{5,40})$",   # All-caps heading line
    ]
    val = _search(candidates, text)
    return val[:60] if val else "Pathology Report"


def _extract_date(text: str, kind: str) -> Optional[str]:
    """kind='collect' or kind='report'"""
    if kind == "collect":
        patterns = [
            r"Collect(?:ed|ion)?\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}(?:\s+\d{1,2}:\d{2})?)",
            r"Specimen\s+Date\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        ]
    else:
        patterns = [
            r"Report(?:ed)?\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}(?:\s+\d{1,2}:\d{2})?)",
            r"Authoris(?:ed|ing)\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
            r"Issued\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        ]
    raw = _search(patterns, text)
    return _normalise_dob(raw.split()[0]) if raw else None


def _extract_doctor(text: str) -> str:
    return _search([
        r"(?:Requesting|Ordered by|Referred by|Dr\.?)\s+(?:Dr\.?\s+)?([A-Z][A-Za-z\s'\-\.]{2,40})",
        r"(?:Clinician|Physician)\s*[:\-]?\s*([A-Z][A-Za-z\s'\-\.]{2,30})",
    ], text)


# ---------------------------------------------------------------------------
# Result row extraction
# ---------------------------------------------------------------------------

# Flags we recognise
_FLAG_RE = re.compile(r"\b(HH|LL|H\*|L\*|H|L|A|N|CRITICAL|HIGH|LOW)\b", re.IGNORECASE)

# Reference range patterns: "3.5 - 5.0",  "< 5.0",  ">0.05",  "3.5-5.0"
_REF_RE = re.compile(
    r"(<\s*\d+\.?\d*|>\s*\d+\.?\d*|\d+\.?\d*\s*[-–]\s*\d+\.?\d*)"
)

# Numeric result: optional < > prefix, digits, optional decimal
_VALUE_RE = re.compile(r"^[<>]?\s*\d+\.?\d*$")


def _extract_results(text: str) -> list[dict]:
    """
    Scan every line for rows that look like a lab result.
    Returns list of dicts with keys: test_name, value, flag, units, ref_range
    """
    results = []
    seen = set()

    for line in text.splitlines():
        line = line.strip()
        if len(line) < 5:
            continue

        parsed = _parse_result_line(line)
        if parsed is None:
            continue

        key = (parsed["test_name"].lower(), parsed["value"])
        if key in seen:
            continue
        seen.add(key)
        results.append(parsed)

    return results


def _parse_result_line(line: str) -> Optional[dict]:
    """
    Try to extract a result from a single line.
    Returns None if the line doesn't look like a result row.
    """
    # Skip header-like lines
    skip_words = {
        "test", "result", "flag", "units", "reference", "range", "normal",
        "patient", "name", "dob", "sex", "doctor", "lab", "page", "report",
        "collect", "authoris", "issued", "comment", "note", "see", "refer",
    }
    lower = line.lower()
    if any(lower.startswith(w) for w in skip_words):
        return None

    # Split on 2+ consecutive spaces (column separator in most PDF reports)
    cols = re.split(r"\s{2,}", line)
    if len(cols) < 2:
        return None

    test_name = cols[0].strip()
    # Test name should start with a letter and be reasonably short
    if not test_name or not test_name[0].isalpha() or len(test_name) > 50:
        return None
    # Skip if it looks like a sentence
    if test_name.count(" ") > 5:
        return None

    # Find the numeric value among the remaining columns
    value = ""
    value_idx = -1
    for i, col in enumerate(cols[1:], 1):
        col = col.strip()
        if _VALUE_RE.match(col):
            value = col
            value_idx = i
            break

    if not value:
        return None

    # Collect remaining tokens after the value
    rest_cols = cols[value_idx + 1:]
    rest_text = " ".join(rest_cols)

    # Extract flag
    flag = ""
    fm = _FLAG_RE.search(rest_text)
    if fm:
        raw_flag = fm.group(1).upper()
        # Normalise
        flag = {"HIGH": "H", "LOW": "L", "CRITICAL": "HH", "H*": "H", "L*": "L"}.get(raw_flag, raw_flag)

    # Extract reference range
    ref_range = ""
    rm = _REF_RE.search(rest_text)
    if rm:
        ref_range = rm.group(1).replace("–", "-").strip()

    # Extract units — token that looks like a unit (letters, /, %, g, L, etc.)
    units = ""
    unit_re = re.compile(r"\b([a-zA-Z%µ][a-zA-Z0-9%µ/\.\*\^]{0,10})\b")
    for col in rest_cols:
        col = col.strip()
        # Skip if it's the flag or ref range we already found
        if col == flag or _REF_RE.fullmatch(col.strip()):
            continue
        um = unit_re.match(col)
        if um and not _FLAG_RE.fullmatch(col):
            candidate = um.group(1)
            # Exclude plain words that are not units
            if not re.fullmatch(r"[A-Z]{4,}", candidate):
                units = candidate
                break

    return {
        "test_name": test_name,
        "value":     value,
        "flag":      flag,
        "units":     units,
        "ref_range": ref_range,
    }

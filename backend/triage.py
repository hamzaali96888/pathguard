"""
triage.py — Clinical severity sorting engine for PathGuard.

Groups parsed HL7 results by patient, assigns severity based on the worst
OBX-8 abnormal flag present, and returns a sorted, categorised patient list.
"""

from typing import Any

# Severity rank: higher number = worse
_FLAG_RANK = {
    "HH": 4,  # Critical High
    "LL": 4,  # Critical Low
    "H": 3,   # High
    "L": 3,   # Low
    "A": 3,   # Abnormal (non-specific)
    "N": 1,   # Normal (explicit)
    "":  1,   # Blank = Normal
}

_SEVERITY_LABEL = {
    4: "critical",
    3: "review",
    1: "normal",
}

_SEVERITY_ORDER = {"critical": 0, "review": 1, "normal": 2}


def _patient_key(record: dict) -> str:
    """Unique patient identifier: surname + DOB (case-insensitive)."""
    surname = (record.get("surname") or "").upper().strip()
    dob = (record.get("patient_dob") or "").strip()
    return f"{surname}|{dob}"


def triage_results(records: list[dict]) -> dict:
    """
    Group records by patient and sort by clinical severity.

    Args:
        records: Flat list of OBX-level result dicts from hl7_parser.

    Returns:
        {
            "patients": [
                {
                    "patient_key": str,
                    "patient_name": str,
                    "patient_dob": str,
                    "patient_sex": str,
                    "severity": "critical" | "review" | "normal",
                    "results": [ ...OBX records... ]
                },
                ...
            ],
            "counts": {"critical": int, "review": int, "normal": int, "total": int}
        }
    """
    # Group records by patient
    patients: dict[str, dict[str, Any]] = {}

    for record in records:
        key = _patient_key(record)
        if key not in patients:
            patients[key] = {
                "patient_key": key,
                "patient_name": record.get("patient_name", ""),
                "patient_dob": record.get("patient_dob", ""),
                "patient_sex": record.get("patient_sex", ""),
                "worst_rank": 0,
                "results": [],
            }
        patients[key]["results"].append(record)

        # Track worst flag for this patient
        flag = (record.get("flag") or "").upper().strip()
        rank = _FLAG_RANK.get(flag, 1)
        if rank > patients[key]["worst_rank"]:
            patients[key]["worst_rank"] = rank

    # Assign severity labels
    for p in patients.values():
        rank = p["worst_rank"]
        # Map rank to nearest label
        if rank >= 4:
            p["severity"] = "critical"
        elif rank >= 3:
            p["severity"] = "review"
        else:
            p["severity"] = "normal"
        del p["worst_rank"]

    # Sort: critical → review → normal, then alphabetically within each tier
    sorted_patients = sorted(
        patients.values(),
        key=lambda p: (
            _SEVERITY_ORDER[p["severity"]],
            p["patient_name"].upper(),
        ),
    )

    # Counts
    counts = {"critical": 0, "review": 0, "normal": 0}
    for p in sorted_patients:
        counts[p["severity"]] += 1
    counts["total"] = len(sorted_patients)

    return {"patients": sorted_patients, "counts": counts}


def triage_db_records(records: list[dict]) -> dict:
    """
    Same as triage_results but operates on database row dicts
    (uses 'patient_dob' and 'surname' columns from the DB schema).
    """
    # DB rows have slightly different field names; normalise them
    normalised = []
    for r in records:
        normalised.append({
            **r,
            # Ensure patient_key fields are present
            "surname": r.get("patient_name", "").split(" ")[-1] if r.get("patient_name") else "",
        })
    return triage_results(normalised)

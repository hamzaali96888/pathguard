"""
hl7_parser.py — Parse Australian HL7 V2 pathology files (AS 4700.2 format).

Extracts patient demographics, ordering info, and individual OBX test results
from a raw HL7 V2.4 message string.
"""

import hl7
from datetime import datetime
from typing import Optional


def _safe(segment, field: int, component: int = 1, default: str = "") -> str:
    """Return a component value from an HL7 field, suppressing IndexError."""
    try:
        value = segment[field]
        if component == 1:
            # Field may be a string or a Field object; str() collapses it
            raw = str(value)
            # If it contains ^, take the first component
            return raw.split("^")[0].strip()
        # Component is 1-indexed in HL7; python-hl7 uses 0-indexed internally
        return str(value[component - 1]).strip()
    except (IndexError, KeyError, TypeError):
        return default


def _parse_hl7_datetime_v2(raw: str) -> Optional[str]:
    """More robust HL7 datetime parser using string length."""
    raw = raw.strip()
    if not raw:
        return None
    try:
        if len(raw) >= 14:
            return datetime.strptime(raw[:14], "%Y%m%d%H%M%S").strftime("%Y-%m-%dT%H:%M:%S")
        elif len(raw) >= 12:
            return datetime.strptime(raw[:12], "%Y%m%d%H%M").strftime("%Y-%m-%dT%H:%M:00")
        elif len(raw) >= 8:
            return datetime.strptime(raw[:8], "%Y%m%d").strftime("%Y-%m-%d")
    except ValueError:
        pass
    return raw


def _extract_msh(msh) -> dict:
    """Extract MSH segment fields."""
    return {
        "sending_facility": _safe(msh, 4),   # MSH-4: Sending Facility
        "message_datetime": _parse_hl7_datetime_v2(_safe(msh, 7)),  # MSH-7
        "message_type": _safe(msh, 9),
    }


def _extract_pid(pid) -> dict:
    """Extract PID segment fields."""
    # PID-5: Patient Name — format is Surname^GivenName^Middle^Suffix^Prefix
    name_field = str(pid[5])
    name_parts = name_field.split("^")
    surname = name_parts[0].strip() if len(name_parts) > 0 else ""
    first_name = name_parts[1].strip() if len(name_parts) > 1 else ""

    # PID-7: Date of Birth
    dob_raw = _safe(pid, 7)
    dob = _parse_hl7_datetime_v2(dob_raw)

    # PID-8: Sex
    sex = _safe(pid, 8)

    return {
        "surname": surname,
        "first_name": first_name,
        "patient_name": f"{first_name} {surname}".strip(),
        "patient_dob": dob,
        "patient_sex": sex,
    }


def _extract_obr(obr) -> dict:
    """Extract OBR segment fields."""
    # OBR-4: Universal Service ID — component 2 is text name
    panel_raw = str(obr[4])
    panel_parts = panel_raw.split("^")
    panel_name = panel_parts[1].strip() if len(panel_parts) > 1 else panel_parts[0].strip()

    # OBR-7: Observation Date/Time (collection)
    collected = _parse_hl7_datetime_v2(_safe(obr, 7))

    # OBR-22: Results Report / Status Change Date (reported)
    reported = _parse_hl7_datetime_v2(_safe(obr, 22))

    # OBR-16: Ordering Provider — format Surname^GivenName
    doctor_raw = str(obr[16]) if len(obr) > 16 else ""
    doctor_parts = doctor_raw.split("^")
    doctor_surname = doctor_parts[0].strip()
    doctor_first = doctor_parts[1].strip() if len(doctor_parts) > 1 else ""
    ordering_doctor = f"Dr {doctor_first} {doctor_surname}".strip(" Dr") if doctor_surname else ""

    return {
        "panel_name": panel_name,
        "collected_date": collected,
        "reported_date": reported,
        "ordering_doctor": ordering_doctor,
    }


def _extract_obx(obx) -> dict:
    """Extract a single OBX segment into a result dict."""
    # OBX-3: Observation Identifier
    # Component 2 = test name (text), Component 4 = alternate (LOINC code often here or component 1)
    obs_id_raw = str(obx[3])
    obs_parts = obs_id_raw.split("^")
    loinc_code = obs_parts[0].strip() if len(obs_parts) > 0 else ""
    test_name = obs_parts[1].strip() if len(obs_parts) > 1 else obs_parts[0].strip()

    # OBX-5: Observed Value
    value = _safe(obx, 5)

    # OBX-6: Units
    units_raw = str(obx[6]) if len(obx) > 6 else ""
    units_parts = units_raw.split("^")
    units = units_parts[0].strip()

    # OBX-7: Reference Range
    ref_range = _safe(obx, 7)

    # OBX-8: Abnormal Flags (H, L, HH, LL, N, A, or blank)
    flag = _safe(obx, 8).upper()

    # OBX-11: Observation Result Status (F=Final, C=Corrected, P=Preliminary)
    result_status = _safe(obx, 11).upper()

    return {
        "test_name": test_name,
        "loinc_code": loinc_code,
        "value": value,
        "units": units,
        "ref_range": ref_range,
        "flag": flag,
        "result_status": result_status,
    }


def parse_hl7_file(filepath: str) -> list[dict]:
    """
    Parse an HL7 V2 file that may contain one or more messages.

    Returns a list of result records, one per OBX segment, each containing
    full patient, panel, and individual test data.
    """
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()

    # HL7 uses \r as segment terminator; normalise any \r\n or \n to \r
    raw = raw.replace("\r\n", "\r").replace("\n", "\r").strip()

    # Split into individual messages on MSH (each message starts with MSH)
    message_chunks = []
    current = []
    for segment_line in raw.split("\r"):
        if segment_line.startswith("MSH") and current:
            message_chunks.append("\r".join(current) + "\r")
            current = [segment_line]
        else:
            if segment_line.strip():
                current.append(segment_line)
    if current:
        message_chunks.append("\r".join(current) + "\r")

    all_results = []
    for chunk in message_chunks:
        try:
            all_results.extend(_parse_single_message(chunk))
        except Exception as e:
            print(f"[hl7_parser] Warning: failed to parse message chunk: {e}")

    return all_results


def _parse_single_message(raw_message: str) -> list[dict]:
    """Parse one HL7 message and return list of OBX-level result dicts."""
    h = hl7.parse(raw_message)

    # --- MSH ---
    msh_data = _extract_msh(h.segment("MSH"))

    # --- PID ---
    pid_data = _extract_pid(h.segment("PID"))

    results = []

    # Build a mapping of OBR → [OBX, ...] by walking segments in document order.
    # h.segments() raises KeyError if none exist; guard with try.
    try:
        h.segments("OBR")
    except KeyError:
        return results

    obr_obx_map: list[tuple[object, list]] = []
    current_obr = None
    current_obxs: list = []

    for segment in h:
        seg_id = str(segment[0])
        if seg_id == "OBR":
            if current_obr is not None:
                obr_obx_map.append((current_obr, current_obxs))
            current_obr = segment
            current_obxs = []
        elif seg_id == "OBX":
            if current_obr is not None:
                current_obxs.append(segment)

    if current_obr is not None:
        obr_obx_map.append((current_obr, current_obxs))

    for obr_seg, obx_list in obr_obx_map:
        obr_data = _extract_obr(obr_seg)
        for obx_seg in obx_list:
            obx_data = _extract_obx(obx_seg)
            record = {
                **msh_data,
                **pid_data,
                **obr_data,
                **obx_data,
            }
            results.append(record)

    return results

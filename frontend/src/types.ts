export interface TrendPoint {
  id: number
  value: string
  units: string
  flag: string
  ref_range: string
  collected_date: string | null
  reported_date: string | null
}

export interface TestResult {
  id: number
  patient_name: string
  patient_dob: string
  patient_sex: string
  surname: string
  first_name: string
  test_name: string
  loinc_code: string
  value: string
  units: string
  ref_range: string
  flag: string
  result_status: string
  lab_name: string
  collected_date: string | null
  reported_date: string | null
  panel_name: string
  ordering_doctor: string
  reviewed: number
  reviewed_at: string | null
  created_at: string
  source_file: string
  trend: TrendPoint[]
}

export type Severity = 'critical' | 'review' | 'normal'

export interface Patient {
  patient_key: string
  patient_name: string
  patient_dob: string
  patient_sex: string
  severity: Severity
  results: TestResult[]
}

export interface TriageResponse {
  patients: Patient[]
  counts: {
    critical: number
    review: number
    normal: number
    total: number
  }
}

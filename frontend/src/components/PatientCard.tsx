import { useState } from 'react'
import type { Patient, TestResult } from '../types'
import { calcAge, timeAgo, inboxBadge, inboxAgeHours, flagClass, trendDirection, trendColor, parseRefRange } from '../utils'
import RangeBar from './RangeBar'
import PatientExpandedBody from './PatientExpandedBody'

// ── Headline pill selection ───────────────────────────────────────────
// Severity order: HH/LL (critical) > H/L > A
const FLAG_RANK: Record<string, number> = { HH: 4, LL: 4, H: 3, L: 3, A: 2 }

// Rough body-system bucketing — ensures we show diversity, not 4 haem results
const SYSTEM_PATTERNS: [RegExp, string][] = [
  [/haemo?globin|^hb$|^hgb$/i,                      'haem'],
  [/wcc|wbc|white.?cell|neutrophil|lymphocyte|monocyte|eosinophil|basophil|platelet|plt|^rcc$|^rbc$|mcv|mch|mchc|rdw|haematocrit|hematocrit/i, 'haem'],
  [/sodium|potassium|chloride|bicarbonate|urea|creatinine|egfr/i, 'renal'],
  [/\balt\b|\bast\b|\balp\b|\bggt\b|bilirubin|albumin|total.?protein/i, 'liver'],
  [/cholesterol|ldl|hdl|triglyceride/i,              'lipid'],
  [/glucose|hba1c/i,                                  'glucose'],
  [/ferritin|\biron\b|transferrin|tibc/i,             'iron'],
  [/\btsh\b|free.?t[34]|\bt[34]\b/i,                 'thyroid'],
  [/\bcrp\b|\besr\b/i,                                'inflam'],
  [/urine|acr|uacr|microalbumin/i,                   'urine'],
]

function systemOf(testName: string): string {
  for (const [re, sys] of SYSTEM_PATTERNS) {
    if (re.test(testName)) return sys
  }
  return testName.toLowerCase()   // unknown → its own bucket
}

function deviationRatio(r: TestResult): number {
  const val = parseFloat(r.value)
  if (isNaN(val)) return 0
  const rr = parseRefRange(r.ref_range)
  if (!rr) return 0
  if (rr.min !== undefined && val < rr.min && rr.min !== 0) return (rr.min - val) / rr.min
  if (rr.max !== undefined && val > rr.max && rr.max !== 0) return (val - rr.max) / rr.max
  return 0
}

/**
 * From a list of abnormal results pick at most `max` headline pills.
 * Priority: worst flags first (HH/LL > H/L > A), then deviation magnitude.
 * Diversity: prefer one result per body system before doubling up.
 */
function selectHeadlinePills(abnormals: TestResult[], max = 4): TestResult[] {
  if (abnormals.length <= max) return abnormals

  const ranked = [...abnormals].sort((a, b) => {
    const fa = FLAG_RANK[a.flag?.toUpperCase()] ?? 1
    const fb = FLAG_RANK[b.flag?.toUpperCase()] ?? 1
    if (fb !== fa) return fb - fa
    return deviationRatio(b) - deviationRatio(a)
  })

  const seenSystems = new Set<string>()
  const selected: TestResult[] = []

  // First pass: highest-ranked result per system
  for (const r of ranked) {
    if (selected.length >= max) break
    const sys = systemOf(r.test_name)
    if (!seenSystems.has(sys)) {
      seenSystems.add(sys)
      selected.push(r)
    }
  }

  // Second pass: fill remaining slots with next-ranked results not yet picked
  for (const r of ranked) {
    if (selected.length >= max) break
    if (!selected.includes(r)) selected.push(r)
  }

  return selected
}

interface Props {
  patient: Patient
  onAction: (patient: Patient, action: string, comment: string) => Promise<void>
}

export default function PatientCard({ patient, onAction }: Props) {
  const [expanded, setExpanded] = useState(false)

  const age = calcAge(patient.patient_dob)
  const sex = patient.patient_sex === 'M' ? 'M' : patient.patient_sex === 'F' ? 'F' : patient.patient_sex
  const isCritical = patient.severity === 'critical'

  const meta         = patient.results[0]
  const labName      = meta?.lab_name || '—'
  const panelName    = meta?.panel_name || '—'
  const inboxTime    = timeAgo(meta?.reported_date || meta?.created_at || undefined)
  const reportedDt   = meta?.reported_date || meta?.created_at || undefined

  const badge = inboxBadge(reportedDt)
  const hours = inboxAgeHours(reportedDt)

  const abnormalResults = patient.results.filter(
    r => r.flag && r.flag !== 'N' && r.flag !== '',
  )

  const borderColor  = isCritical ? 'border-l-red-500'   : 'border-l-amber-400'
  const severityBg   = isCritical ? 'bg-red-50'           : 'bg-amber-50'
  const severityText = isCritical ? 'text-red-700'         : 'text-amber-700'
  const severityDot  = isCritical ? 'bg-red-500'           : 'bg-amber-400'

  return (
    <div
      className={`rounded-xl border border-gray-200 border-l-4 ${borderColor} bg-white shadow-sm
                  overflow-hidden transition-shadow hover:shadow-md`}
    >
      {/* ── Card header (clickable) ───────────────────────────── */}
      <div
        className="px-4 pt-3 pb-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Row 1: Patient identity + meta */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex-shrink-0 w-2 h-2 rounded-full ${severityDot}`} />
            <span className="font-semibold text-gray-900 text-sm truncate">{patient.patient_name}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{age}y {sex}</span>

            {/* Severity badge */}
            <span
              className={`flex-shrink-0 text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5
                          rounded ${severityBg} ${severityText}`}
            >
              {patient.severity}
            </span>

            {/* Medico-legal inbox age badge */}
            {badge && (
              <span
                className={`flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded flex items-center gap-1
                             ${badge === 'red'
                               ? 'bg-red-100 text-red-700'
                               : 'bg-amber-100 text-amber-700'}`}
                title={`Result has been in inbox for ${Math.round(hours ?? 0)} hours`}
              >
                ⚠ {Math.round(hours ?? 0)}h
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
            <span className="hidden sm:block">{labName}</span>
            <span className="hidden md:block text-gray-200">·</span>
            <span className="hidden md:block truncate max-w-[140px]">{panelName}</span>
            <span>{inboxTime}</span>
            <ChevronIcon open={expanded} />
          </div>
        </div>

        {/* Row 2: Headline abnormal pills (collapsed only — max 4, worst first) */}
        {!expanded && abnormalResults.length > 0 && (() => {
          const shown    = selectHeadlinePills(abnormalResults)
          const overflow = abnormalResults.length - shown.length
          return (
            <div className="mt-2 pl-4">
              <div className="flex flex-wrap gap-1.5">
                {shown.map(r => <TestPill key={r.id} result={r} />)}
              </div>
              {overflow > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  +{overflow} more abnormal result{overflow !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )
        })()}
        {!expanded && abnormalResults.length === 0 && (
          <p className="mt-1 pl-4 text-xs text-gray-400 italic">All results within range</p>
        )}
      </div>

      {/* ── Expanded body ─────────────────────────────────────── */}
      {expanded && (
        <PatientExpandedBody patient={patient} onAction={onAction} />
      )}
    </div>
  )
}

/* ── Test pill (collapsed view) ─────────────────────────────────── */

function TestPill({ result }: { result: import('../types').TestResult }) {
  const dir    = trendDirection(result.trend)
  const tColor = dir ? trendColor(result.flag, dir) : ''

  return (
    <div
      className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white
                 px-2 py-1 text-xs hover:border-gray-300 transition-colors"
      title={`${result.test_name}: ${result.value} ${result.units} (ref: ${result.ref_range})`}
    >
      <span className={flagClass(result.flag)}>{result.flag}</span>
      <span className="font-medium text-gray-700">{result.test_name}</span>
      <span className="font-mono text-gray-900 font-semibold">{result.value}</span>
      {result.units && <span className="text-gray-400">{result.units}</span>}
      <RangeBar value={result.value} refRange={result.ref_range} flag={result.flag} />
      {dir && <span className={`font-bold leading-none ${tColor}`}>{dir}</span>}
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

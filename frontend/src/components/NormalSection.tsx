import { useState } from 'react'
import type { Patient } from '../types'
import { calcAge, fmtDate, timeAgo } from '../utils'
import PatientExpandedBody from './PatientExpandedBody'

interface Props {
  patients: Patient[]
  onClearNormals: () => void
  clearing: boolean
  onAction: (patient: Patient, action: string, comment: string) => Promise<void>
}

export default function NormalSection({ patients, onClearNormals, clearing, onAction }: Props) {
  if (patients.length === 0) return null

  const n = patients.length

  return (
    <section className="mt-4 px-5 pb-6">
      {/* ── Section header ───────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">
            Normal — {n}
          </span>
          <div className="h-px w-12 bg-emerald-200" />
        </div>

        {/* Big satisfying clear button */}
        <button
          onClick={onClearNormals}
          disabled={clearing}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white
                     px-5 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {clearing ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          Clear All {n} Normal{n !== 1 ? 's' : ''}
        </button>
      </div>

      {/* ── Normal results table ─────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_1fr_120px_80px_28px] gap-2 px-4 py-1.5
                        text-xs font-medium text-gray-400 uppercase tracking-wider
                        border-b border-gray-100 bg-gray-50">
          <span>Patient</span>
          <span>Age/Sex</span>
          <span>Tests Performed</span>
          <span>Result</span>
          <span>Received</span>
          <span />
        </div>

        {/* Rows */}
        {patients.map(patient => (
          <NormalRow
            key={patient.patient_key}
            patient={patient}
            onAction={onAction}
          />
        ))}
      </div>

      <p className="mt-2 text-xs text-gray-400 text-right">
        All results verified within reference ranges. Click any row to view the full report.
      </p>
    </section>
  )
}

function NormalRow({
  patient,
  onAction,
}: {
  patient: Patient
  onAction: (patient: Patient, action: string, comment: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)

  const age     = calcAge(patient.patient_dob)
  const sex     = patient.patient_sex === 'M' ? 'M' : patient.patient_sex === 'F' ? 'F' : patient.patient_sex
  const meta    = patient.results[0]
  const panel   = meta?.panel_name || '—'
  const inbox   = timeAgo(meta?.reported_date || meta?.created_at || undefined)
  const count   = patient.results.length
  const tests   = patient.results.map(r => r.test_name).join(', ')

  return (
    <div className="border-b border-gray-50 last:border-b-0">
      {/* Row */}
      <div
        className="grid grid-cols-[1fr_80px_1fr_120px_80px_28px] gap-2 px-4 py-2.5
                   hover:bg-gray-50 cursor-pointer transition-colors items-center"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Patient name */}
        <div>
          <span className="font-medium text-gray-800 text-sm">{patient.patient_name}</span>
        </div>

        {/* Age/sex */}
        <div className="text-xs text-gray-500">{age}y {sex}</div>

        {/* Tests */}
        <div className="min-w-0">
          <span className="text-xs text-gray-500 truncate block" title={tests}>
            {panel} <span className="text-gray-400">({count} test{count !== 1 ? 's' : ''})</span>
          </span>
        </div>

        {/* Result badge */}
        <div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700
                           bg-emerald-50 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            All within range
          </span>
        </div>

        {/* Received */}
        <div className="text-xs text-gray-400">{inbox}</div>

        {/* Chevron */}
        <div className="flex items-center justify-center">
          <svg
            className={`w-3.5 h-3.5 text-gray-300 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100">
          <PatientExpandedBody patient={patient} onAction={onAction} />
        </div>
      )}
    </div>
  )
}

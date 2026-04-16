import { useState } from 'react'
import type { Patient, TestResult } from '../types'
import {
  calcAge, fmtDate, fmtDateTime,
  flagClass, trendDirection, trendColor,
} from '../utils'
import RangeBar from './RangeBar'

type ActionKey = 'no-action' | 'recall' | 'nurse' | 'urgent'

interface Props {
  patient: Patient
  onAction?: (patient: Patient, action: string, comment: string) => Promise<void>
}

export default function PatientExpandedBody({ patient, onAction }: Props) {
  const [activeTab, setActiveTab] = useState<'smart' | 'original'>('smart')
  const [loading, setLoading] = useState<ActionKey | null>(null)
  const [comment, setComment] = useState('')

  const meta = patient.results[0]
  const labName       = meta?.lab_name        || '—'
  const panelName     = meta?.panel_name      || '—'
  const collectedDate = fmtDate(meta?.collected_date   || undefined)
  const reportedDate  = fmtDateTime(meta?.reported_date || undefined)
  const orderingDoctor = meta?.ordering_doctor || '—'
  const sourceFile    = meta?.source_file || ''

  const handleAction = async (action: ActionKey) => {
    if (!onAction) return
    setLoading(action)
    try {
      await onAction(patient, action, comment)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="border-t border-gray-100 card-body-enter">
      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 bg-gray-50">
        <TabBtn label="Smart View"       active={activeTab === 'smart'}    onClick={() => setActiveTab('smart')} />
        <TabBtn label="Original Report"  active={activeTab === 'original'} onClick={() => setActiveTab('original')} />
      </div>

      {activeTab === 'smart' ? (
        <>
          {/* Lab / collection metadata */}
          <div className="px-5 py-2 bg-gray-50 flex flex-wrap gap-x-5 gap-y-0.5 text-xs text-gray-500 border-b border-gray-100">
            <MetaItem label="Lab"        value={labName} />
            <MetaItem label="Panel"      value={panelName} />
            <MetaItem label="Collected"  value={collectedDate} />
            <MetaItem label="Reported"   value={reportedDate} />
            <MetaItem label="Ordered by" value={orderingDoctor} />
            {sourceFile && <MetaItem label="Source" value={sourceFile} />}
          </div>

          {/* Full results table — ALL tests, both normal and abnormal */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-white">
                  <th className="px-5 py-2 text-left font-medium">Test</th>
                  <th className="px-3 py-2 text-right font-medium">Result</th>
                  <th className="px-3 py-2 text-center font-medium">Flag</th>
                  <th className="px-3 py-2 text-left font-medium">Units</th>
                  <th className="px-3 py-2 text-left font-medium">Ref Range</th>
                  <th className="px-3 py-2 text-left font-medium w-16">Range</th>
                  <th className="px-3 py-2 text-center font-medium">Trend</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {patient.results.map(r => (
                  <ResultRow key={r.id} result={r} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <OriginalReport patient={patient} />
      )}

      {/* ── Action area ─────────────────────────────────────────── */}
      {onAction && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton label="No Action"        icon="✓"  cls="action-btn-green"   loading={loading === 'no-action'} onClick={() => handleAction('no-action')} />
            <ActionButton label="Recall Patient"   icon="⚠"  cls="action-btn-red"     loading={loading === 'recall'}    onClick={() => handleAction('recall')} />
            <ActionButton label="Nurse to Contact" icon="☎"  cls="action-btn-blue"    loading={loading === 'nurse'}     onClick={() => handleAction('nurse')} />
            <ActionButton label="Urgent"           icon="!"  cls="action-btn-darkred" loading={loading === 'urgent'}    onClick={() => handleAction('urgent')} />
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment (e.g. Repeat in 3 months, Start iron infusion)"
            rows={2}
            className="w-full text-xs border border-gray-200 rounded-md px-3 py-2 text-gray-700
                       placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400
                       resize-none bg-white"
          />
        </div>
      )}
    </div>
  )
}

/* ── Original Report ────────────────────────────────────────────── */

function OriginalReport({ patient }: { patient: Patient }) {
  const text = formatOriginalReport(patient)
  return (
    <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
      <pre
        className="font-mono text-xs text-gray-700 leading-relaxed whitespace-pre overflow-x-auto
                   bg-white border border-gray-200 rounded-md p-4"
      >
        {text}
      </pre>
    </div>
  )
}

function formatOriginalReport(patient: Patient): string {
  const meta = patient.results[0]
  if (!meta) return 'No report data available.'

  const labName      = meta.lab_name       || 'Pathology'
  const panelName    = meta.panel_name     || 'Laboratory Report'
  const collected    = meta.collected_date  ? fmtDateTime(meta.collected_date)  : '—'
  const reported     = meta.reported_date   ? fmtDateTime(meta.reported_date)   : '—'
  const doctor       = meta.ordering_doctor || '—'
  const nameParts    = patient.patient_name.split(' ')
  const surname      = nameParts[0] || ''
  const given        = nameParts.slice(1).join(' ')
  const displayName  = given ? `${surname}, ${given}` : surname
  const dob          = fmtDate(patient.patient_dob)
  const age          = calcAge(patient.patient_dob)
  const sex          = patient.patient_sex || '—'

  const div = '─'.repeat(70)
  const div2 = '─'.repeat(70)

  let r = ''
  r += `${labName.toUpperCase()}\n`
  r += `${div}\n`
  r += `\n`
  r += `Patient:      ${displayName}\n`
  r += `DOB:          ${dob}   ${sex}   ${age}y\n`
  r += `\n`
  r += `Requesting:   ${doctor}\n`
  r += `Collected:    ${collected}\n`
  r += `Reported:     ${reported}\n`
  r += `\n`
  r += `${div2}\n`
  r += `\n`
  r += `${panelName.toUpperCase()}\n`
  r += `\n`

  // Column headers
  const col1 = 28, col2 = 9, col3 = 6, col4 = 18, col5 = 18
  r += pad('Test', col1) + rpad('Result', col2) + '  ' + pad('Flag', col3) + '  ' + pad('Units', col4) + pad('Ref Range', col5) + '\n'
  r += pad('─'.repeat(col1 - 1), col1) + rpad('─'.repeat(col2), col2) + '  ' + pad('─'.repeat(col3 - 1), col3) + '  ' + pad('─'.repeat(col4 - 1), col4) + pad('─'.repeat(col5 - 1), col5) + '\n'

  for (const res of patient.results) {
    const isAbnormal = res.flag && res.flag !== 'N' && res.flag !== ''
    const flagStr = isAbnormal ? res.flag : ''
    const marker  = (res.flag === 'HH' || res.flag === 'LL') ? ' **' : ''

    r += pad(res.test_name.slice(0, col1 - 1), col1)
       + rpad(res.value || '—', col2)
       + '  '
       + pad((flagStr + marker).slice(0, col3 - 1), col3)
       + '  '
       + pad((res.units || '').slice(0, col4 - 1), col4)
       + pad((res.ref_range || '').slice(0, col5 - 1), col5)
       + '\n'
  }

  r += `\n`
  r += `${div}\n`
  r += `\n`
  r += `For clinical enquiries contact ${labName} directly.\n`
  r += `Report generated by PathGuard — authorised use only.\n`

  return r
}

function pad(s: string, n: number): string {
  return s.padEnd(n).slice(0, n)
}
function rpad(s: string, n: number): string {
  return s.padStart(n).slice(-n)
}

/* ── Sub-components ─────────────────────────────────────────────── */

function ResultRow({ result }: { result: TestResult }) {
  const isAbnormal = result.flag && result.flag !== 'N' && result.flag !== ''
  const dir    = trendDirection(result.trend)
  const tColor = dir ? trendColor(result.flag, dir) : ''

  return (
    <tr className={isAbnormal ? 'bg-red-50/30' : 'bg-white opacity-75'}>
      <td className="px-5 py-2">
        <div className="flex items-center gap-2">
          {isAbnormal && (
            <div className="w-1 h-4 rounded-full bg-red-400 flex-shrink-0" />
          )}
          <span className={`font-medium text-xs ${isAbnormal ? 'text-gray-900' : 'text-gray-500'}`}>
            {result.test_name}
          </span>
          {result.loinc_code && (
            <span className="text-xs text-gray-300 font-mono hidden xl:inline">{result.loinc_code}</span>
          )}
        </div>
      </td>

      <td className="px-3 py-2 text-right">
        <span className={`font-mono font-semibold text-xs ${isAbnormal ? 'text-gray-900' : 'text-gray-500'}`}>
          {result.value}
        </span>
      </td>

      <td className="px-3 py-2 text-center">
        {result.flag && result.flag !== 'N' && result.flag !== '' ? (
          <span className={flagClass(result.flag)}>{result.flag}</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      <td className="px-3 py-2 text-gray-500 text-xs">{result.units || '—'}</td>

      <td className="px-3 py-2 text-gray-500 text-xs font-mono">{result.ref_range || '—'}</td>

      <td className="px-3 py-2">
        <RangeBar value={result.value} refRange={result.ref_range} flag={result.flag} />
      </td>

      <td className="px-3 py-2 text-center">
        {dir ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`text-sm font-bold leading-none ${tColor}`}>{dir}</span>
            {result.trend.length > 1 && (
              <span className="text-xs text-gray-400 font-mono">{result.trend[1]?.value}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      <td className="px-3 py-2">
        <span className={`text-xs ${result.result_status === 'C' ? 'text-amber-600 font-medium' : 'text-gray-300'}`}>
          {result.result_status === 'F' ? '' :
           result.result_status === 'C' ? 'Corrected' :
           result.result_status === 'P' ? 'Prelim' :
           result.result_status || ''}
        </span>
      </td>
    </tr>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-gray-400">{label}: </span>
      <span className="text-gray-600 font-medium">{value}</span>
    </span>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-slate-700 text-slate-800 bg-white'
          : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )
}

function ActionButton({
  label, icon, cls, loading, onClick,
}: {
  label: string
  icon: string
  cls: string
  loading: boolean
  onClick: () => void
}) {
  return (
    <button className={cls} onClick={onClick} disabled={loading}>
      {loading ? (
        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        <span>{icon}</span>
      )}
      {label}
    </button>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import type { TriageResponse, Patient } from './types'
import { fetchResults, markReviewed, clearNormals, uploadFile, loadDemoData, resetDatabase } from './api'
import Header from './components/Header'
import SummaryBanner from './components/SummaryBanner'
import PatientCard from './components/PatientCard'
import NormalSection from './components/NormalSection'

type FilterKey = 'all' | 'critical' | 'review' | 'normal'

interface Toast {
  id: number
  message: string
  type?: 'info' | 'success' | 'warning'
}

export default function App() {
  const [data, setData]         = useState<TriageResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [clearingNormals, setClearingNormals] = useState(false)

  // Session progress tracking
  const [sessionReviewed,  setSessionReviewed]  = useState(0)
  const [sessionTimeSaved, setSessionTimeSaved]  = useState(0)
  const [lastUpdated,      setLastUpdated]       = useState<Date | null>(null)

  // Filter + search
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500)
  }, [])

  // Track previously seen patient keys to detect new arrivals
  const knownKeysRef = useRef<Set<string>>(new Set())
  const isFirstLoad  = useRef(true)

  // Drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isUploading,    setIsUploading]    = useState(false)
  const dragCounter = useRef(0)

  const load = useCallback(async (silent = false) => {
    try {
      const d = await fetchResults()

      // Detect newly arrived patients (skip on first load)
      if (!isFirstLoad.current) {
        const prev = knownKeysRef.current
        for (const patient of d.patients) {
          if (!prev.has(patient.patient_key)) {
            const panel = patient.results[0]?.panel_name || 'Result'
            const lab   = patient.results[0]?.lab_name   || ''
            addToast(
              `New result: ${patient.patient_name} — ${panel}${lab ? ` from ${lab}` : ''}`,
              patient.severity === 'critical' ? 'warning' : 'info',
            )
          }
        }
      }

      // Update known keys
      knownKeysRef.current = new Set(d.patients.map(p => p.patient_key))
      isFirstLoad.current = false

      setData(d)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to connect to backend')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  // Poll every 5 seconds
  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 5_000)
    return () => clearInterval(interval)
  }, [load])

  const handleAction = useCallback(async (patient: Patient, _action: string, _comment: string) => {
    await Promise.all(patient.results.map(r => markReviewed(r.id)))
    const mins = patient.severity === 'critical' ? 3 : patient.severity === 'review' ? 2 : 0.5
    setSessionReviewed(p => p + 1)
    setSessionTimeSaved(p => p + mins)
    await load(true)
  }, [load])

  const handleClearNormals = useCallback(async () => {
    const normalCount = data?.patients.filter(p => p.severity === 'normal').length ?? 0
    setClearingNormals(true)
    try {
      await clearNormals()
      setSessionReviewed(p => p + normalCount)
      setSessionTimeSaved(p => p + normalCount * 0.5)
      addToast(
        `${normalCount} normal result${normalCount !== 1 ? 's' : ''} filed. ` +
        `~${Math.round(normalCount * 0.5)} min saved.`,
      )
      await load(true)
    } finally {
      setClearingNormals(false)
    }
  }, [data, load, addToast])

  // ── Load demo data ──────────────────────────────────────────────
  const handleLoadDemo = useCallback(async () => {
    try {
      const { files_copied } = await loadDemoData()
      addToast(`Loading ${files_copied} demo result${files_copied !== 1 ? 's' : ''}… check back in a moment.`, 'info')
      // Give watcher time to process then reload
      setTimeout(() => load(true), 3000)
    } catch {
      addToast('Failed to load demo data.', 'warning')
    }
  }, [load, addToast])

  // ── Reset ───────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    try {
      await resetDatabase()
      setSessionReviewed(0)
      setSessionTimeSaved(0)
      knownKeysRef.current = new Set()
      isFirstLoad.current = true
      addToast('Dashboard reset — all results cleared.', 'info')
      await load(true)
    } catch {
      addToast('Reset failed.', 'warning')
    }
  }, [load, addToast])

  // ── Drag-and-drop file upload ───────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current += 1
    if (dragCounter.current === 1) setIsDraggingOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current === 0) setIsDraggingOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDraggingOver(false)

    const files = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      return ext === 'hl7' || ext === 'pit'
    })

    if (files.length === 0) {
      addToast('No .hl7 or .pit files detected.', 'warning')
      return
    }

    setIsUploading(true)
    let uploaded = 0
    for (const file of files) {
      try {
        await uploadFile(file)
        uploaded++
      } catch (err) {
        addToast(`Upload failed: ${file.name}`, 'warning')
      }
    }
    setIsUploading(false)

    if (uploaded > 0) {
      addToast(`Uploaded ${uploaded} file${uploaded !== 1 ? 's' : ''}. Results will appear shortly…`, 'info')
      setTimeout(() => load(true), 3000)
    }
  }, [load, addToast])

  // ── Render states ──────────────────────────────────────────────

  if (loading) return <LoadingScreen />
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />

  const { patients, counts } = data!

  const sessionTotal = patients.length + sessionReviewed

  const searchLower = search.toLowerCase()
  const visible = patients.filter(p => {
    if (filter !== 'all' && p.severity !== filter) return false
    if (searchLower && !p.patient_name.toLowerCase().includes(searchLower)) return false
    return true
  })

  const critical = visible.filter(p => p.severity === 'critical')
  const review   = visible.filter(p => p.severity === 'review')
  const normal   = visible.filter(p => p.severity === 'normal')
  const isEmpty  = visible.length === 0

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Header
        sessionTotal={sessionTotal}
        sessionReviewed={sessionReviewed}
        sessionTimeSaved={sessionTimeSaved}
        lastUpdated={lastUpdated}
        onLoadDemo={handleLoadDemo}
        onReset={handleReset}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto pb-8">
        {/* Summary chips */}
        <SummaryBanner counts={counts} />

        {/* Drop zone — always visible, expands when dragging */}
        <DropZone active={isDraggingOver} uploading={isUploading} />

        {/* Filter + search bar */}
        <div className="flex items-center gap-3 px-5 pb-3">
          <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden text-xs">
            {(['all', 'critical', 'review', 'normal'] as FilterKey[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 font-medium capitalize transition-colors border-r last:border-r-0 border-gray-100
                  ${filter === f
                    ? 'bg-slate-800 text-white'
                    : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {f === 'all' ? `All (${patients.length})` : f}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search patient…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white
                         focus:outline-none focus:ring-1 focus:ring-slate-400 placeholder-gray-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {isEmpty ? (
          <EmptyState filtered={filter !== 'all' || !!search} />
        ) : (
          <>
            {critical.length > 0 && (
              <section className="mt-2 px-5">
                <SectionHeader label="Critical" count={critical.length} colorClass="text-red-600"
                               lineClass="bg-red-200" dotClass="bg-red-500" />
                <div className="space-y-2 mt-2">
                  {critical.map(p => (
                    <PatientCard key={p.patient_key} patient={p} onAction={handleAction} />
                  ))}
                </div>
              </section>
            )}

            {review.length > 0 && (
              <section className="mt-4 px-5">
                <SectionHeader label="Review" count={review.length} colorClass="text-amber-600"
                               lineClass="bg-amber-200" dotClass="bg-amber-400" />
                <div className="space-y-2 mt-2">
                  {review.map(p => (
                    <PatientCard key={p.patient_key} patient={p} onAction={handleAction} />
                  ))}
                </div>
              </section>
            )}

            {(filter === 'all' || filter === 'normal') && (
              <NormalSection
                patients={normal}
                onClearNormals={handleClearNormals}
                clearing={clearingNormals}
                onAction={handleAction}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white py-2.5 px-5 flex items-center justify-between text-xs text-gray-400">
        <span>PathGuard v1.0 — For authorised use in Greenwood Medical Centre</span>
        <span>Not a substitute for clinical judgement. Reference ranges sourced from the laboratory.</span>
      </footer>

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 text-white text-sm px-4 py-3
                        rounded-lg shadow-lg min-w-[300px] animate-slide-in
                        ${toast.type === 'warning' ? 'bg-amber-700' : toast.type === 'info' ? 'bg-slate-700' : 'bg-slate-800'}`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs
              ${toast.type === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              {toast.type === 'warning' ? '⚠' : '✓'}
            </span>
            {toast.message}
          </div>
        ))}
      </div>

      {/* Full-page drag overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-40 bg-indigo-900/20 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl px-12 py-10 flex flex-col items-center gap-3 drop-zone-active border-2 border-indigo-400">
            <svg className="w-12 h-12 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-lg font-semibold text-slate-800">Drop .hl7 files here</p>
            <p className="text-sm text-slate-500">Files will be uploaded and processed automatically</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Drop zone strip ────────────────────────────────────────────── */

function DropZone({ active, uploading }: { active: boolean; uploading: boolean }) {
  return (
    <div className={`mx-5 mb-3 rounded-lg border-2 border-dashed transition-all duration-200 text-center
      ${active
        ? 'border-indigo-400 bg-indigo-50 py-4'
        : 'border-gray-200 bg-white py-2 hover:border-gray-300'}`}
    >
      {uploading ? (
        <span className="text-xs text-indigo-600 flex items-center justify-center gap-2">
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Uploading…
        </span>
      ) : (
        <span className="text-xs text-gray-400">
          Drop .hl7 or .pit files here, or place them in the{' '}
          <span className="font-mono font-medium text-gray-500">drop_results_here/</span> folder
        </span>
      )}
    </div>
  )
}

/* ── Section header ─────────────────────────────────────────────── */

function SectionHeader({
  label, count, colorClass, lineClass, dotClass,
}: {
  label: string; count: number; colorClass: string; lineClass: string; dotClass: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${dotClass}`} />
      <span className={`text-xs font-bold uppercase tracking-widest ${colorClass}`}>{label}</span>
      <span className={`text-xs font-semibold ${colorClass} opacity-60`}>— {count}</span>
      <div className={`flex-1 h-px ${lineClass}`} />
    </div>
  )
}

/* ── Loading / Error / Empty states ────────────────────────────── */

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-3 text-gray-500">
            <svg className="animate-spin h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm text-gray-500">Loading results…</span>
          </div>
          <div className="mt-8 w-[560px] space-y-2">
            {[80, 64, 72].map((w, i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-200 shimmer" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Cannot reach backend</h2>
        <p className="text-sm text-gray-500 mb-1">{message}</p>
        <p className="text-xs text-gray-400 mb-6">
          Make sure PathGuard backend is running on{' '}
          <span className="font-mono">localhost:8000</span>
        </p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 text-white
                     px-5 py-2.5 text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">
        {filtered ? 'No matching results' : 'All clear'}
      </h2>
      <p className="text-sm text-gray-400">
        {filtered
          ? 'Try adjusting your filter or search.'
          : 'No unreviewed results. Drop .hl7 files into the drop_results_here/ folder to begin.'}
      </p>
    </div>
  )
}

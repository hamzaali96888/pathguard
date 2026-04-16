import { useState, useRef, useEffect } from 'react'
import { timeAgo } from '../utils'

interface Props {
  sessionTotal: number
  sessionReviewed: number
  sessionTimeSaved: number
  lastUpdated: Date | null
  onLoadDemo: () => void
  onReset: () => void
}

export default function Header({
  sessionTotal, sessionReviewed, sessionTimeSaved, lastUpdated, onLoadDemo, onReset,
}: Props) {
  const pct        = sessionTotal > 0 ? Math.round((sessionReviewed / sessionTotal) * 100) : 0
  const updatedStr = lastUpdated ? timeAgo(lastUpdated.toISOString()) : '—'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header
      className="bg-slate-900 text-white px-5 py-0 flex items-center justify-between flex-shrink-0 gap-4"
      style={{ height: 52 }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="relative w-6 h-6">
          <div className="absolute inset-0 rounded bg-red-500 opacity-90" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L8 14M2 8H14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="3" stroke="white" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
        </div>
        <span className="text-base font-semibold tracking-tight">PathGuard</span>
        <span className="text-slate-500 text-xs hidden sm:block">Pathology Triage</span>
      </div>

      {/* Middle: Progress + watching indicator */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-xs mx-auto">
        <div className="flex items-center gap-3 w-full">
          <span className="text-xs text-slate-400 flex-shrink-0">
            <span className="text-white font-semibold">{sessionReviewed}</span>
            {' '}of {sessionTotal} reviewed
          </span>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">{pct}%</span>
        </div>
        {sessionTimeSaved > 0 && (
          <p className="text-xs text-emerald-400">~{Math.round(sessionTimeSaved)} min saved this session</p>
        )}
      </div>

      {/* Right: Watching indicator + updated + doctor + menu */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Live watching dot */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Watching for results</span>
        </div>

        <div className="hidden md:block text-xs text-slate-500">
          Updated {updatedStr}
        </div>

        <div className="w-px h-5 bg-slate-700" />

        {/* Doctor */}
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium text-white leading-tight">Dr S. Mitchell</p>
          <p className="text-xs text-slate-400 leading-tight">Greenwood Medical Centre</p>
        </div>

        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 flex-shrink-0">
          SM
        </div>

        {/* Settings dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Options"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 text-sm">
              <button
                onClick={() => { setMenuOpen(false); onLoadDemo() }}
                className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Load Demo Data
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setMenuOpen(false); onReset() }}
                className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Reset Database
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

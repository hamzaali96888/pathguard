/** Calculate age in years from a "YYYY-MM-DD" DOB string. */
export function calcAge(dob: string): number {
  if (!dob) return 0
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

/** Format a date string as "15 Apr 2026" */
export function fmtDate(dt: string | null | undefined): string {
  if (!dt) return '—'
  const d = new Date(dt)
  if (isNaN(d.getTime())) return dt
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format a datetime string as "15 Apr 2026, 8:30 am" */
export function fmtDateTime(dt: string | null | undefined): string {
  if (!dt) return '—'
  const d = new Date(dt)
  if (isNaN(d.getTime())) return dt
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Return a human-readable "X min ago" / "3h ago" string. */
export function timeAgo(dt: string | null | undefined): string {
  if (!dt) return ''
  const d = new Date(dt)
  if (isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

/** Parse a lab reference range string into numeric min/max. */
export function parseRefRange(refRange: string): { min?: number; max?: number } | null {
  if (!refRange) return null
  const gt = refRange.match(/^>\s*(\d+\.?\d*)/)
  if (gt) return { min: parseFloat(gt[1]) }
  const lt = refRange.match(/^<\s*(\d+\.?\d*)/)
  if (lt) return { max: parseFloat(lt[1]) }
  const range = refRange.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/)
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) }
  return null
}

/** Return CSS classes for a flag badge. */
export function flagClass(flag: string): string {
  switch (flag?.toUpperCase()) {
    case 'HH': return 'flag-badge flag-hh'
    case 'H':  return 'flag-badge flag-h'
    case 'LL': return 'flag-badge flag-ll'
    case 'L':  return 'flag-badge flag-l'
    case 'A':  return 'flag-badge flag-a'
    default:   return 'flag-badge flag-n'
  }
}

/** Return a descriptive label for a flag. */
export function flagLabel(flag: string): string {
  switch (flag?.toUpperCase()) {
    case 'HH': return 'Critical High'
    case 'H':  return 'High'
    case 'LL': return 'Critical Low'
    case 'L':  return 'Low'
    case 'A':  return 'Abnormal'
    case 'N':  return 'Normal'
    default:   return 'Normal'
  }
}

/** Determine trend direction from a trend array (most recent first). */
export function trendDirection(trend: { value: string }[]): '↑' | '↓' | '→' | null {
  if (trend.length < 2) return null
  const curr = parseFloat(trend[0].value)
  const prev = parseFloat(trend[1].value)
  if (isNaN(curr) || isNaN(prev)) return null
  const delta = Math.abs(curr - prev)
  if (delta < 0.001 * Math.abs(prev || 1)) return '→'
  return curr > prev ? '↑' : '↓'
}

/** Return CSS color class for a trend arrow given flag and direction. */
export function trendColor(flag: string, dir: '↑' | '↓' | '→'): string {
  if (dir === '→') return 'text-gray-400'
  const upper = flag?.toUpperCase()
  const isHigh = upper === 'H' || upper === 'HH'
  const isLow  = upper === 'L' || upper === 'LL'
  if (isHigh && dir === '↑') return 'text-red-500'
  if (isHigh && dir === '↓') return 'text-emerald-500'
  if (isLow  && dir === '↓') return 'text-red-500'
  if (isLow  && dir === '↑') return 'text-emerald-500'
  return 'text-gray-500'
}

/** Return how many hours a result has been in the inbox (from reported_date). */
export function inboxAgeHours(dt: string | null | undefined): number | null {
  if (!dt) return null
  const d = new Date(dt)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60)
}

/**
 * Medico-legal inbox age indicator.
 * >72h → 'red', >48h → 'amber', otherwise null.
 */
export function inboxBadge(dt: string | null | undefined): 'red' | 'amber' | null {
  const hours = inboxAgeHours(dt)
  if (hours === null) return null
  if (hours > 72) return 'red'
  if (hours > 48) return 'amber'
  return null
}

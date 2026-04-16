import { parseRefRange } from '../utils'

interface Props {
  value: string
  refRange: string
  flag: string
}

/**
 * A compact 56×8 px horizontal bar visualising where a result value
 * sits relative to the lab's reference range.
 *
 * - Green zone = normal range
 * - Red/blue dot = actual value (red for high, blue for low, green for normal)
 */
export default function RangeBar({ value, refRange, flag }: Props) {
  const num = parseFloat(value)
  const range = parseRefRange(refRange)

  if (!range || isNaN(num)) return null

  let displayMin: number
  let displayMax: number
  let normalStart: number // 0–1 fraction
  let normalEnd: number   // 0–1 fraction

  if (range.min !== undefined && range.max !== undefined) {
    const span = range.max - range.min
    const pad = span * 0.5
    displayMin = range.min - pad
    displayMax = range.max + pad
    normalStart = (range.min - displayMin) / (displayMax - displayMin)
    normalEnd = (range.max - displayMin) / (displayMax - displayMin)
  } else if (range.min !== undefined) {
    // ">X" — value should be above min
    displayMin = 0
    displayMax = range.min * 2
    normalStart = range.min / displayMax
    normalEnd = 1
  } else if (range.max !== undefined) {
    // "<X" — value should be below max
    displayMin = 0
    displayMax = range.max * 1.5
    normalStart = 0
    normalEnd = range.max / displayMax
  } else {
    return null
  }

  const span = displayMax - displayMin
  if (span <= 0) return null

  const rawPos = (num - displayMin) / span
  const clampedPos = Math.max(0.04, Math.min(0.96, rawPos))

  const f = flag?.toUpperCase()
  const isHigh = f === 'H' || f === 'HH'
  const isLow  = f === 'L' || f === 'LL'
  const dotColor = isHigh ? '#ef4444' : isLow ? '#3b82f6' : '#10b981'

  return (
    <div
      className="relative flex-shrink-0 my-auto"
      style={{ width: 56, height: 8 }}
      title={`${value} (ref: ${refRange})`}
    >
      {/* Track */}
      <div
        className="absolute rounded-full bg-gray-200"
        style={{ inset: 0 }}
      />
      {/* Normal zone */}
      <div
        className="absolute h-full rounded-full bg-emerald-200"
        style={{
          left: `${normalStart * 100}%`,
          width: `${Math.max(0, normalEnd - normalStart) * 100}%`,
        }}
      />
      {/* Value marker dot */}
      <div
        className="absolute rounded-full border border-white shadow-sm"
        style={{
          width: 8,
          height: 8,
          top: 0,
          left: `${clampedPos * 100}%`,
          transform: 'translateX(-50%)',
          backgroundColor: dotColor,
          zIndex: 1,
        }}
      />
    </div>
  )
}

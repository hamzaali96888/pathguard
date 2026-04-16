interface Props {
  counts: { critical: number; review: number; normal: number; total: number }
}

export default function SummaryBanner({ counts }: Props) {
  return (
    <div className="flex items-center gap-3 px-5 pt-4 pb-2">
      <StatChip
        count={counts.critical}
        label="Critical"
        countCls="text-red-600"
        dotCls="bg-red-500"
        borderCls="border-red-200"
      />
      <StatChip
        count={counts.review}
        label="Review"
        countCls="text-amber-600"
        dotCls="bg-amber-400"
        borderCls="border-amber-200"
      />
      <StatChip
        count={counts.normal}
        label="Normal"
        countCls="text-emerald-600"
        dotCls="bg-emerald-400"
        borderCls="border-emerald-200"
      />
      <div className="w-px h-6 bg-gray-200 mx-1" />
      <span className="text-xs text-gray-400">
        <span className="font-semibold text-gray-600">{counts.total}</span> patient{counts.total !== 1 ? 's' : ''} pending
      </span>
    </div>
  )
}

function StatChip({
  count, label, countCls, dotCls, borderCls,
}: {
  count: number
  label: string
  countCls: string
  dotCls: string
  borderCls: string
}) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border ${borderCls} bg-white px-3 py-1.5`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} />
      <span className={`text-lg font-bold leading-none ${countCls}`}>{count}</span>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
    </div>
  )
}

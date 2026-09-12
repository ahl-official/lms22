export default function ScoreBadge({ score, size = 'md', variant = 'inline' }) {
  if (score == null) return null

  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  const bgColor = score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'

  if (variant === 'ring') {
    const r = 45, circ = 2 * Math.PI * r
    const offset = circ - (score / 100) * circ
    const dim = size === 'lg' ? 120 : 80
    const cx = dim / 2
    return (
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        <circle cx={cx} cy={cx} r={r * (dim / 100)} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle cx={cx} cy={cx} r={r * (dim / 100)} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ * (dim / 100)} strokeDashoffset={offset * (dim / 100)}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}
          className="score-ring-fill" />
        <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontWeight="700" fontSize={size === 'lg' ? 24 : 16} fontFamily="Sora, sans-serif">
          {Math.round(score)}%
        </text>
      </svg>
    )
  }

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'
  return (
    <span className={`inline-flex items-center rounded-lg font-bold ${bgColor} ${sizeClass}`}>
      {Math.round(score)}%
    </span>
  )
}

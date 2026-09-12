export default function RoundStatsPanel({ stats, label = 'Assessment' }) {
  if (!stats?.totalRounds) return null

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 mb-5">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wide mb-3">{label} rounds</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700 mb-3">
        <span>
          <span className="text-gray-500">Total rounds:</span>{' '}
          <strong className="text-gray-900">{stats.totalRounds}</strong>
        </span>
        {stats.bestScore != null && (
          <span>
            <span className="text-gray-500">Best:</span>{' '}
            <strong className="text-green-700">{Math.round(stats.bestScore)}%</strong>
          </span>
        )}
        {stats.avgScore != null && (
          <span>
            <span className="text-gray-500">Average:</span>{' '}
            <strong className="text-brand-700">{Math.round(stats.avgScore)}%</strong>
          </span>
        )}
        {stats.latestScore != null && (
          <span>
            <span className="text-gray-500">Latest:</span>{' '}
            <strong className="text-gray-900">{Math.round(stats.latestScore)}%</strong>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {stats.rounds.map((round) => (
          <span
            key={`${round.round}-${round.date}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700"
            title={round.title || undefined}
          >
            Round {round.round}
            <span className="text-gray-300">·</span>
            {round.score != null ? (
              <span className={round.passed ? 'text-green-600' : 'text-amber-600'}>
                {Math.round(round.score)}%
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

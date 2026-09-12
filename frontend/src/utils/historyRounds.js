/** Group assessments/roleplays by lesson or test for per-item round numbers. */
export const groupKey = (item) =>
  item.groupKey
  || item.testId
  || item.test_id
  || item.lessonId
  || item.lesson_id
  || `${item.course_title || ''}::${item.title || ''}`

/** Assign round numbers within each lesson/test group (oldest attempt = Round 1). */
export function withPerGroupRounds(items) {
  if (!items?.length) return []

  const byGroup = {}
  for (const item of items) {
    const key = groupKey(item)
    if (!byGroup[key]) byGroup[key] = []
    byGroup[key].push(item)
  }

  const roundById = new Map()
  for (const group of Object.values(byGroup)) {
    const sorted = [...group].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    sorted.forEach((item, index) => {
      roundById.set(item.id, item.round ?? item.attempt_number ?? index + 1)
    })
  }

  return items.map((item) => ({
    ...item,
    round: roundById.get(item.id) || 1,
  }))
}

/** Summary stats: total rounds and chronological score per round. */
export function buildRoundStats(items) {
  if (!items?.length) {
    return { totalRounds: 0, rounds: [], bestScore: null, latestScore: null, avgScore: null }
  }

  const sorted = [...items].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
  const rounds = sorted.map((item, index) => ({
    round: index + 1,
    score: item.score,
    passed: item.passed,
    title: item.title,
    date: item.date,
  }))

  const scores = rounds.map((r) => r.score).filter((s) => s != null)
  const bestScore = scores.length ? Math.max(...scores) : null
  const latestScore = sorted[sorted.length - 1]?.score ?? null
  const avgScore = scores.length
    ? Math.round((scores.reduce((sum, s) => sum + Number(s), 0) / scores.length) * 10) / 10
    : null

  return { totalRounds: rounds.length, rounds, bestScore, latestScore, avgScore }
}

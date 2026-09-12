import { formatDistanceToNow } from 'date-fns'
import { BookOpen, ClipboardList, History, Users } from 'lucide-react'
import ScoreBadge from '../ScoreBadge'

const relativeTime = (date) => {
  if (!date) return 'Never'
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }) }
  catch { return 'Never' }
}

function iconFor(type) {
  if (type === 'roleplay') return Users
  if (type === 'assessment') return ClipboardList
  return BookOpen
}

function typeLabel(type) {
  if (type === 'roleplay') return 'Roleplay'
  if (type === 'assessment') return 'Assessment'
  return 'Video'
}

function toneFor(item) {
  if ((item.type === 'roleplay' || item.type === 'assessment') && item.passed) return 'bg-green-50 text-green-700'
  if (item.type === 'lesson' && item.status === 'completed') return 'bg-green-50 text-green-700'
  if (item.type === 'roleplay') return 'bg-brand-50 text-brand-600'
  if (item.type === 'assessment') return 'bg-amber-50 text-amber-600'
  return 'bg-gray-100 text-gray-600'
}

export default function LearningHistory({ items = [], showTrainee = false, compact = false, emptyText = 'No history yet' }) {
  if (!items.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <History size={30} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const Icon = iconFor(item.type)
        const meta = [
          typeLabel(item.type),
          showTrainee ? item.trainee_name : null,
          item.course_title,
          item.module_title,
          item.date ? relativeTime(item.date) : null,
        ].filter(Boolean).join(' - ')

        return (
          <div key={`${item.type}-${item.id}`} className={`rounded-xl border border-gray-100 bg-white ${compact ? 'p-3' : 'p-4'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${toneFor(item)}`}>
                <Icon size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.title || item.lesson_title || 'Activity'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{meta}</p>
                  </div>
                  {item.score != null && <ScoreBadge score={item.score} size="sm" />}
                </div>

                {item.feedback && (
                  <p className="text-xs text-gray-600 mt-2 line-clamp-2">{item.feedback}</p>
                )}
                {item.responses?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {item.responses.slice(0, compact ? 1 : 3).map((response, idx) => {
                      const text = typeof response === 'string' ? response : response.answer
                      return (
                        <p key={idx} className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 line-clamp-2">
                          {text}
                        </p>
                      )
                    })}
                  </div>
                )}
                {item.type === 'lesson' && (
                  <p className="text-xs text-gray-500 mt-2">{item.watch_percent || 0}% watched - {item.status || 'in progress'}</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

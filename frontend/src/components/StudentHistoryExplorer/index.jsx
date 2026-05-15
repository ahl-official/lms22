import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ClipboardList, MessageSquare, Search, Users } from 'lucide-react'
import { analyticsAPI } from '../../services/api'
import ScoreBadge from '../ScoreBadge'

const relativeTime = (date) => {
  if (!date) return 'Never'
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }) }
  catch { return 'Never' }
}

function initials(name) {
  return (name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function AttemptCard({ attempt, type }) {
  const qas = attempt.qa || []
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{attempt.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {attempt.course_title}
            {attempt.module_title ? ` - ${attempt.module_title}` : ''}
            {attempt.date ? ` - ${relativeTime(attempt.date)}` : ''}
          </p>
        </div>
        {attempt.score != null && <ScoreBadge score={attempt.score} size="sm" />}
      </div>

      {(attempt.summary || attempt.feedback) && (
        <p className="text-xs text-gray-600 bg-white border border-gray-100 rounded-lg p-2 mb-3">
          {attempt.summary || attempt.feedback}
        </p>
      )}

      {qas.length === 0 ? (
        <p className="text-sm text-gray-400">No questions and answers saved for this {type}.</p>
      ) : (
        <div className="space-y-3">
          {qas.map((qa, idx) => (
            <div key={idx} className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Question {idx + 1}</p>
              <p className="text-sm text-gray-800">{qa.question || 'Question not saved'}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">Answer</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{qa.answer || 'No answer saved'}</p>
              {qa.feedback && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">AI feedback</p>
                  <p className="text-sm text-amber-700">{qa.feedback}</p>
                </>
              )}
              {qa.correct_answer && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">Expected answer</p>
                  <p className="text-sm text-green-700">{qa.correct_answer}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StudentHistoryExplorer({ title = 'Student History', subtitle = 'Open a student, then choose Roleplaying or Assessment to see questions and answers.' }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('roleplaying')

  const { data, isLoading } = useQuery({
    queryKey: ['student-history'],
    queryFn: () => analyticsAPI.getStudentHistory(),
  })

  const students = data?.data?.students || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(student =>
      student.name?.toLowerCase().includes(q) ||
      student.email?.toLowerCase().includes(q) ||
      student.phone?.toLowerCase().includes(q)
    )
  }, [students, search])

  const selected = filtered.find(student => student._id === selectedId) || filtered[0]
  const roleplays = selected?.roleplays || []
  const assessments = selected?.assessments || []
  const items = mode === 'roleplaying' ? roleplays : assessments

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">{title}</h1>
        <p className="text-gray-500 mt-1">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
        <div className="card p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              className="input-field pl-9 text-sm"
              placeholder="Search trainees..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No trainees found</p>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {filtered.map(student => {
                const active = selected?._id === student._id
                return (
                  <button
                    key={student._id}
                    onClick={() => {
                      setSelectedId(student._id)
                      setMode('roleplaying')
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${active
                      ? 'bg-brand-50 border-brand-200'
                      : 'bg-white border-gray-100 hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${active ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {initials(student.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{student.name}</p>
                        <p className="text-xs text-gray-400 truncate">{student.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 text-[11px] font-semibold">
                      <span className="px-2 py-1 rounded-lg bg-brand-100 text-brand-700">{student.roleplays?.length || 0} roleplay</span>
                      <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700">{student.assessments?.length || 0} assessment</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          {!selected ? (
            <div className="text-center py-16 text-gray-400">
              <Users size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a trainee to view history</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-display font-semibold text-gray-800">{selected.name}</h2>
                  <p className="text-sm text-gray-400">{selected.email}{selected.phone ? ` - ${selected.phone}` : ''}</p>
                </div>
              </div>

              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setMode('roleplaying')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === 'roleplaying'
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:text-brand-600 hover:border-brand-200'
                    }`}
                >
                  <MessageSquare size={14} /> Roleplaying ({roleplays.length})
                </button>
                <button
                  onClick={() => setMode('assessment')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === 'assessment'
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:text-brand-600 hover:border-brand-200'
                    }`}
                >
                  <ClipboardList size={14} /> Assessment ({assessments.length})
                </button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-14 text-gray-400">
                  <p className="text-sm">No {mode === 'roleplaying' ? 'roleplaying' : 'assessment'} history for this trainee</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map(item => (
                    <AttemptCard
                      key={item.id}
                      attempt={item}
                      type={mode === 'roleplaying' ? 'roleplay attempt' : 'assessment attempt'}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

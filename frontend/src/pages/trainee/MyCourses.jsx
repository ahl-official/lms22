import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { enrollmentsAPI, modulesAPI } from '../../services/api'
import {
  BookOpen, Mic, Clock, Search, CheckCircle,
  PlayCircle, Lock, ChevronDown, ChevronRight, Layers,
} from 'lucide-react'
import ScoreBadge from '../../components/ScoreBadge'

// ── Module progress row inside expanded course card ───────────────────────
function ModuleProgressRow({ module, idx, courseId, navigate }) {
  const icon =
    module.is_locked ? <Lock size={13} className="text-gray-400" /> :
      module.is_completed ? <CheckCircle size={13} className="text-green-500" /> :
        <span className="text-xs font-bold text-brand-600">{idx + 1}</span>

  const pct = module.lesson_count > 0
    ? Math.round((module.lessons_completed / module.lesson_count) * 100)
    : 0

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${module.is_locked
        ? 'border-gray-100 bg-gray-50 opacity-60'
        : module.is_completed
          ? 'border-green-100 bg-green-50/50'
          : 'border-brand-100 bg-white'
      }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${module.is_locked ? 'bg-gray-200' :
          module.is_completed ? 'bg-green-100' : 'bg-brand-100'
        }`}>
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${module.is_locked ? 'text-gray-400' : 'text-gray-800'}`}>
          {module.title}
        </p>
        {!module.is_locked && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${module.is_completed ? 'bg-green-400' : 'bg-brand-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {module.lessons_completed || 0}/{module.lesson_count || 0} lessons
            </span>
          </div>
        )}
        {module.is_locked && (
          <p className="text-xs text-gray-400 mt-0.5">Complete module {idx} to unlock</p>
        )}
      </div>

      {!module.is_locked && !module.is_completed && (
        <button
          onClick={() => navigate(`/trainee/courses/${courseId}`)}
          className="text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-colors flex-shrink-0"
        >
          Continue →
        </button>
      )}
    </div>
  )
}

// ── Expandable course card ─────────────────────────────────────────────────
function CourseCard({ enr, navigate }) {
  const [expanded, setExpanded] = useState(false)
  const courseId = enr.course_id?._id || enr.course_id

  const { data: modulesData, isLoading } = useQuery({
    queryKey: ['trainee-modules', courseId],
    queryFn: () => modulesAPI.getByCourse(courseId),
    enabled: expanded,
  })

  const modules = modulesData?.data?.modules || []

  return (
    <div className="card transition-all">
      {/* Course row */}
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${enr.status === 'completed' ? 'bg-green-100' :
            enr.status === 'in_progress' ? 'bg-brand-100' : 'bg-gray-100'
          }`}>
          {enr.status === 'completed'
            ? <CheckCircle size={22} className="text-green-500" />
            : <PlayCircle size={22} className={enr.status === 'in_progress' ? 'text-brand-500' : 'text-gray-400'} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800">{enr.course_title}</h3>
            {enr.requires_voice_test && (
              <span className="badge badge-coral text-xs flex items-center gap-1 flex-shrink-0">
                <Mic size={10} /> Voice
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${enr.status === 'completed' ? 'bg-green-400' : 'bg-brand-400'}`}
                  style={{ width: `${enr.progress || 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{enr.progress || 0}%</span>
            </div>
            {enr.duration_hours && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={11} /> {enr.duration_hours}h
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {enr.best_score != null && <ScoreBadge score={enr.best_score} size="sm" />}
          <span className={`badge text-xs hidden sm:inline-flex ${enr.status === 'completed' ? 'badge-green' :
              enr.status === 'in_progress' ? 'badge-blue' : 'badge-gray'
            }`}>{enr.status?.replace('_', ' ')}</span>

          {/* Open course */}
          <button
            onClick={() => navigate(`/trainee/courses/${courseId}`)}
            className="text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            Open
          </button>

          {/* Expand modules */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-xl transition-colors"
            title="Show modules"
          >
            <Layers size={12} />
            <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Module breakdown */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm">Loading modules…</span>
            </div>
          ) : modules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">No modules yet</p>
          ) : (
            modules.map((mod, idx) => (
              <ModuleProgressRow
                key={mod._id}
                module={mod}
                idx={idx}
                courseId={courseId}
                navigate={navigate}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function MyCourses() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => enrollmentsAPI.getMy(),
  })

  const enrollments = (data?.data?.enrollments || []).filter(enr => {
    const matchFilter = filter === 'all' || enr.status === filter
    const matchSearch = !search || enr.course_title?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">My Courses</h1>
        <p className="text-gray-500 mt-1">Your learning journey</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input className="input-field pl-10 text-sm" placeholder="Search courses…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['all', 'not_started', 'in_progress', 'completed'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${filter === f
                  ? 'bg-brand-500 text-white shadow-soft'
                  : 'bg-white text-gray-600 hover:bg-brand-50 border border-gray-200'
                }`}>
              {f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No courses found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {enrollments.map(enr => (
            <CourseCard key={enr._id} enr={enr} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  )
}
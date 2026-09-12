import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersAPI, analyticsAPI, rolePlayAPI } from '../../services/api'
import { Search, Users, BookOpen, TrendingUp, Mic, ChevronRight, Tag, Lock, Unlock, Loader2 } from 'lucide-react'
import ScoreBadge from '../../components/ScoreBadge'
import { format } from 'date-fns'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'

const pct = (value) => Math.max(0, Math.min(100, Number(value) || 0))

function ProgressRing({ value, size = 52 }) {
  const normalized = pct(value)
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (normalized / 100) * circumference

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={normalized >= 80 ? '#22c55e' : normalized > 0 ? '#6366f1' : '#d1d5db'}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xs font-bold text-brand-600">{normalized}%</span>
    </div>
  )
}

export default function Trainees() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [courseFilter, setCourseFilter] = useState('all')
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data: traineesData, isLoading } = useQuery({
    queryKey: ['trainees', search],
    // Backend auto-scopes to trainer's category — no extra param needed
    queryFn: () => usersAPI.getAll({ role: 'trainee', search }),
  })

  const { data: analytics } = useQuery({
    queryKey: ['trainee-analytics', selected?._id],
    queryFn: () => analyticsAPI.getTrainee(selected._id),
    enabled: !!selected,
  })

  const { data: locksData } = useQuery({
    queryKey: ['trainee-role-play-locks', selected?._id],
    queryFn: () => rolePlayAPI.getLockedForTrainee(selected._id),
    enabled: !!selected,
  })

  const unlockMutation = useMutation({
    mutationFn: ({ courseId }) => rolePlayAPI.unlockCourse(courseId, {
      trainee_id: selected._id,
      note: 'Trainer manual unlock',
    }),
    onSuccess: () => {
      toast.success('Course unlocked')
      qc.invalidateQueries({ queryKey: ['trainee-role-play-locks', selected?._id] })
      qc.invalidateQueries({ queryKey: ['trainee-analytics', selected?._id] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to unlock'),
  })

  const trainees = traineesData?.data?.users || []
  const data = analytics?.data
  const locks = locksData?.data?.locks || []
  const courseOptions = useMemo(() => (
    (data?.enrollments || [])
      .map(enr => ({
        id: (enr.course_id?._id || enr.course_id)?.toString(),
        title: enr.course_title || enr.course_id?.title || 'Unknown course',
      }))
      .filter(course => course.id)
  ), [data?.enrollments])
  const visibleEnrollments = useMemo(() => {
    const enrollments = data?.enrollments || []
    if (courseFilter === 'all') return enrollments
    return enrollments.filter(enr => (enr.course_id?._id || enr.course_id)?.toString() === courseFilter)
  }, [data?.enrollments, courseFilter])
  const lockedByCourse = locks.reduce((acc, lock) => {
    const cid = lock.course_id?._id || lock.course_id
    if (cid) acc[cid.toString()] = lock
    return acc
  }, {})

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-title">Trainees</h1>
          <p className="text-gray-500 mt-1">Monitor progress and performance</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Show trainer's own category */}
          {user?.category_id && (
            <div className="flex items-center gap-2 px-4 py-2 bg-brand-50 border border-brand-200 rounded-2xl">
              <Tag size={14} className="text-brand-500" />
              <span className="text-sm font-semibold text-brand-700">
                {user.category_id?.name || 'Your Category'}
              </span>
            </div>
          )}
          <div className="stat-card flex items-center gap-3 px-5 py-3">
            <Users className="text-brand-500" size={20} />
            <span className="font-semibold text-gray-700">{trainees.length} total</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-1">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              className="input-field pl-10 text-sm"
              placeholder="Search trainees…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {trainees.map(t => (
                <button
                  key={t._id}
                  onClick={() => { setSelected(t); setCourseFilter('all') }}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${selected?._id === t._id
                      ? 'border-brand-400 bg-brand-50 shadow-soft'
                      : 'border-transparent bg-white hover:border-brand-200 shadow-card'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {t.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{t.name}</p>
                      <p className="text-xs text-gray-500 truncate">{t.email}</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                  </div>
                </button>
              ))}
              {!trainees.length && (
                <div className="text-center py-12 text-gray-400">
                  <Users size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {user?.category_id
                      ? 'No trainees in your category yet'
                      : 'You have no category assigned — contact admin'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="card h-full flex items-center justify-center text-gray-400 min-h-64">
              <div className="text-center">
                <Users size={48} className="mx-auto mb-3 opacity-30" />
                <p>Select a trainee to view their progress</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-2xl">
                  {selected.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-800">{selected.name}</h2>
                  <p className="text-gray-500">{selected.email}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {selected.category_id && (
                      <span className="flex items-center gap-1 text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                        <Tag size={10} /> {selected.category_id.name}
                      </span>
                    )}
                    <p className="text-xs text-gray-400">
                      Last active:{' '}
                      {selected.last_login_at
                        ? format(new Date(selected.last_login_at), 'MMM d, yyyy')
                        : 'Never'}
                    </p>
                  </div>
                </div>
              </div>

              {data ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: BookOpen, label: 'Enrolled', value: data.enrollments?.length || 0, color: 'text-brand-500' },
                      { icon: TrendingUp, label: 'Completed', value: data.completed_count || 0, color: 'text-sage-600' },
                      { icon: Mic, label: 'Voice Tests', value: data.voice_attempt_count || 0, color: 'text-coral-500' },
                    ].map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="card text-center">
                        <Icon size={20} className={`mx-auto ${color} mb-1`} />
                        <p className="text-2xl font-bold text-gray-800">{value}</p>
                        <p className="text-xs text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                      <h3 className="font-semibold text-gray-800">Course Progress</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setCourseFilter('all')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${courseFilter === 'all'
                              ? 'bg-brand-500 text-white border-brand-500'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-brand-200 hover:text-brand-600'
                            }`}
                        >
                          All courses
                        </button>
                        {courseOptions.map(course => (
                          <button
                            key={course.id}
                            onClick={() => setCourseFilter(course.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${courseFilter === course.id
                                ? 'bg-brand-500 text-white border-brand-500'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-200 hover:text-brand-600'
                              }`}
                          >
                            {course.title}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {visibleEnrollments.map(enr => {
                        const courseId = enr.course_id?._id || enr.course_id
                        const lock = courseId ? lockedByCourse[courseId.toString()] : null
                        const progress = pct(enr.progress)

                        return (
                        <div key={enr._id} className={`flex items-center gap-3 p-3 rounded-xl ${lock ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                          <ProgressRing value={progress} />
                          <div className="flex-1">
                            <p className="font-medium text-gray-700 text-sm">{enr.course_title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {enr.completed_lessons || 0}/{enr.lesson_count || 0} lessons
                              {enr.module_count ? ` · ${enr.completed_modules || 0}/${enr.module_count} modules` : ''}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand-500 rounded-full"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 flex-shrink-0">{progress}%</span>
                            </div>
                            {lock && (
                              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                <Lock size={10} /> Locked after 10 failed roleplay attempts
                                {lock.lesson_title ? ` · ${lock.lesson_title}` : ''}
                              </p>
                            )}
                          </div>
                          {enr.best_score != null && <ScoreBadge score={enr.best_score} size="sm" />}
                          <span className={`badge text-xs ${enr.status === 'completed' ? 'badge-green'
                              : enr.status === 'in_progress' ? 'badge-blue'
                                : 'badge-gray'
                            }`}>
                            {enr.status?.replace('_', ' ')}
                          </span>
                          {lock && (
                            <button
                              onClick={() => unlockMutation.mutate({ courseId })}
                              disabled={unlockMutation.isPending}
                              className="text-xs px-3 py-1.5 rounded-xl bg-green-100 text-green-700 font-semibold hover:bg-green-200 disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {unlockMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                              Unlock Course
                            </button>
                          )}
                        </div>
                      )})}
                      {!visibleEnrollments.length && (
                        <p className="text-sm text-gray-400 text-center py-4">No enrollments yet</p>
                      )}
                    </div>
                  </div>

                  {data.recent_attempts?.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-gray-800 mb-4">Recent Attempts</h3>
                      <div className="space-y-2">
                        {data.recent_attempts.map(a => (
                          <div key={a._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                            <Mic size={14} className={a.test_type === 'voice' ? 'text-coral-500' : 'text-brand-500'} />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-700">{a.course_title}</p>
                              <p className="text-xs text-gray-400">
                                {format(new Date(a.submitted_at), 'MMM d, yyyy')} · {a.test_type}
                              </p>
                            </div>
                            <ScoreBadge score={a.score} size="sm" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// frontend/src/pages/admin/StudentProgress.jsx
// Live admin view of all student learning activity — enrollments, progress, scores.
// Route: /admin/progress
// Add to App.jsx: const AdminStudentProgress = lazy(() => import('./pages/admin/StudentProgress'))
// Add to admin routes: <Route path="progress" element={<AdminStudentProgress />} />
// Add to Layout NAV admin array: { to: '/admin/progress', label: 'Student Progress', icon: BarChart2 }
// Add to api.js analyticsAPI: getStudentProgress: (params) => api.get('/analytics/admin/student-progress', { params })

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsAPI, categoriesAPI } from '../../services/api'
import ScoreBadge from '../../components/ScoreBadge'
import {
    Users, TrendingUp, Award, AlertTriangle, Search,
    ChevronDown, ChevronUp, CheckCircle,
    RefreshCw, Activity, XCircle, Minus, Mic, FileText,
    BookOpen,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
    completed: { label: 'Completed', dot: 'bg-green-500', badge: 'bg-green-100 text-green-800', Icon: CheckCircle },
    in_progress: { label: 'Active', dot: 'bg-brand-500', badge: 'bg-brand-100 text-brand-800', Icon: Activity },
    struggling: { label: 'At risk', dot: 'bg-red-500', badge: 'bg-red-100 text-red-800', Icon: AlertTriangle },
    not_started: { label: 'Not started', dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600', Icon: Minus },
}

const STATUSES = ['all', 'in_progress', 'completed', 'struggling', 'not_started']
const STATUS_LABELS = { all: 'All', in_progress: 'Active', completed: 'Completed', struggling: 'At risk', not_started: 'Not started' }

// ── Helpers ───────────────────────────────────────────────────────────────────
const relativeTime = (date) => {
    if (!date) return '—'
    try { return formatDistanceToNow(new Date(date), { addSuffix: true }) }
    catch { return '—' }
}

const initials = (name) => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const pct = (value) => Math.max(0, Math.min(100, Number(value) || 0))

function MiniBar({ value, color = 'bg-brand-400' }) {
    const width = pct(value)
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${width}%` }} />
            </div>
            <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0">{width}%</span>
        </div>
    )
}

function ProgressRing({ value, size = 44 }) {
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
            <span className="absolute text-[11px] font-bold text-brand-600">{normalized}%</span>
        </div>
    )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, sub, iconClass }) {
    return (
        <div className="stat-card">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${iconClass}`}>
                <Icon size={20} />
            </div>
            <p className="text-2xl font-display font-bold text-gray-800">{value ?? '—'}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
    )
}

// ── Course row (inside expanded student) ──────────────────────────────────────
function CourseRow({ course }) {
    const assessment = course.assessment || {
        attempt_count: course.attempt_count || 0,
        best_score: course.best_score ?? null,
        last_attempt_at: course.last_attempt_at || null,
    }
    const roleplay = course.roleplay || { attempt_count: 0, best_score: null, locked_count: 0 }
    const progressColor =
        course.progress >= 80 ? 'bg-green-400' :
            course.progress >= 40 ? 'bg-brand-400' : 'bg-gray-300'

    const statusCfg = {
        completed: { label: 'Done', cls: 'text-green-700 bg-green-50' },
        in_progress: { label: 'Active', cls: 'text-brand-700 bg-brand-50' },
        not_started: { label: 'Not yet', cls: 'text-gray-500 bg-gray-50' },
    }[course.status] || { label: course.status, cls: 'text-gray-500 bg-gray-50' }

    return (
        <div className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
            {/* Course title */}
            <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{course.course_title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                    {course.completed_lessons || 0}/{course.lesson_count || 0} lessons
                    {course.module_count ? ` · ${course.completed_modules || 0}/${course.module_count} modules` : ''}
                </p>
                {assessment.last_attempt_at && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        {course.last_attempt_type === 'voice'
                            ? <Mic size={10} className="flex-shrink-0" />
                            : <FileText size={10} className="flex-shrink-0" />}
                        Assessment {relativeTime(assessment.last_attempt_at)}
                    </p>
                )}
                {roleplay.last_attempt_at && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Users size={10} className="flex-shrink-0" />
                        Roleplay {relativeTime(roleplay.last_attempt_at)}
                        {roleplay.last_lesson_title ? ` · ${roleplay.last_lesson_title}` : ''}
                    </p>
                )}
            </div>

            {/* Progress */}
            <div className="w-40 flex-shrink-0 flex items-center gap-3">
                <ProgressRing value={course.progress} />
                <MiniBar value={course.progress} color={progressColor} />
            </div>

            {/* Attempts */}
            <span className="text-xs text-gray-400 w-14 text-center flex-shrink-0">
                {course.attempt_count > 0 ? `${course.attempt_count} attempt${course.attempt_count !== 1 ? 's' : ''}` : 'No attempts'}
            </span>

            {/* Best score */}
            <div className="w-14 flex justify-end flex-shrink-0">
                {course.best_score != null
                    ? <ScoreBadge score={course.best_score} size="sm" />
                    : <span className="text-xs text-gray-300">—</span>
                }
            </div>

            {/* Roleplay */}
            <div className="w-24 flex-shrink-0 text-center">
                <p className="text-xs text-gray-400">{roleplay.attempt_count || 0} RP</p>
                <div className="mt-1 flex items-center justify-center gap-1">
                    {roleplay.best_score != null
                        ? <ScoreBadge score={roleplay.best_score} size="sm" />
                        : <span className="text-xs text-gray-300">-</span>
                    }
                    {roleplay.locked_count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Locked</span>
                    )}
                </div>
            </div>

            {/* Status */}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${statusCfg.cls}`}>
                {statusCfg.label}
            </span>
        </div>
    )
}

// ── Student row ───────────────────────────────────────────────────────────────
function StudentRow({ student }) {
    const [expanded, setExpanded] = useState(false)
    const st = student.summary
    const statusCfg = STATUS[st.status] || STATUS.not_started
    const { Icon: StatusIcon } = statusCfg

    const avatarColor =
        st.status === 'completed' ? 'bg-green-100 text-green-700' :
            st.status === 'struggling' ? 'bg-red-100 text-red-700' :
                st.status === 'in_progress' ? 'bg-brand-100 text-brand-700' :
                    'bg-gray-100 text-gray-500'

    return (
        <div className="border border-gray-100 rounded-2xl overflow-hidden transition-shadow hover:shadow-sm">
            {/* Main row */}
            <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColor}`}>
                    {initials(student.name)}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{student.name}</p>
                    <p className="text-xs text-gray-400 truncate">{student.email}</p>
                </div>

                {/* Category */}
                <div className="w-28 flex-shrink-0 hidden md:block">
                    {student.category?.name
                        ? <span className="text-xs bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full font-medium truncate block text-center">
                            {student.category.name}
                        </span>
                        : <span className="text-xs text-gray-300 block text-center">—</span>
                    }
                </div>

                {/* Courses enrolled */}
                <div className="w-20 flex-shrink-0 text-center hidden sm:block">
                    {st.total_courses > 0 ? (
                        <div>
                            <span className="text-sm font-bold text-gray-700">{st.completed_courses}</span>
                            <span className="text-xs text-gray-400">/{st.total_courses}</span>
                            <p className="text-xs text-gray-400 mt-0.5">courses</p>
                        </div>
                    ) : (
                        <span className="text-xs text-gray-300">None</span>
                    )}
                </div>

                {/* Progress */}
                <div className="w-32 flex-shrink-0 hidden lg:block">
                    <MiniBar
                        value={st.avg_progress}
                        color={
                            st.avg_progress >= 80 ? 'bg-green-400' :
                                st.avg_progress >= 30 ? 'bg-brand-400' : 'bg-gray-300'
                        }
                    />
                </div>

                {/* Avg score */}
                <div className="w-16 flex-shrink-0 text-center hidden sm:block">
                    {st.avg_score != null
                        ? <ScoreBadge score={st.avg_score} size="sm" />
                        : <span className="text-xs text-gray-300">—</span>
                    }
                </div>

                {/* Last active */}
                <div className="w-24 flex-shrink-0 text-right hidden lg:block">
                    <p className="text-xs text-gray-500">{relativeTime(student.last_active_at)}</p>
                </div>

                {/* Status */}
                <div className="w-24 flex-shrink-0 flex justify-end">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full ${statusCfg.badge}`}>
                        <StatusIcon size={10} />
                        {statusCfg.label}
                    </span>
                </div>

                {/* Expand toggle */}
                <div className="flex-shrink-0 text-gray-400 ml-1">
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </div>
            </div>

            {/* Expanded course breakdown */}
            {expanded && (
                <div className="border-t border-gray-100 px-5 py-4 bg-white space-y-2">
                    {student.courses.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-2">Not enrolled in any courses</p>
                    ) : (
                        <>
                            <div className="flex items-center gap-4 px-3 mb-1">
                                <p className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Course</p>
                                <p className="w-40 text-xs font-semibold text-gray-400 text-center uppercase tracking-wide flex-shrink-0">Progress</p>
                                <p className="w-14 text-xs font-semibold text-gray-400 text-center uppercase tracking-wide flex-shrink-0">Assess</p>
                                <p className="w-14 text-xs font-semibold text-gray-400 text-right uppercase tracking-wide flex-shrink-0">Best</p>
                                <p className="w-24 text-xs font-semibold text-gray-400 text-center uppercase tracking-wide flex-shrink-0">Roleplay</p>
                                <p className="w-20 text-xs font-semibold text-gray-400 text-right uppercase tracking-wide flex-shrink-0">Status</p>
                            </div>
                            {student.courses.map(course => (
                                <CourseRow key={course.course_id} course={course} />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminStudentProgress() {
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [courseFilter, setCourseFilter] = useState('all')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const debounceRef = useState(null)

    const handleSearch = useCallback((val) => {
        setSearch(val)
        clearTimeout(debounceRef[0])
        debounceRef[0] = setTimeout(() => setDebouncedSearch(val), 350)
    }, [debounceRef])

    const { data: catData } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoriesAPI.getAll(),
    })

    const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
        queryKey: ['student-progress', debouncedSearch, categoryFilter, statusFilter],
        queryFn: () => analyticsAPI.getStudentProgress({
            search: debouncedSearch || undefined,
            category_id: categoryFilter || undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        staleTime: 60_000,
        refetchInterval: 5 * 60_000, // auto-refresh every 5 min
    })

    const categories = catData?.data?.categories || []
    const students = data?.data?.students || []
    const stats = data?.data?.stats || {}
    const courseOptions = useMemo(() => {
        const map = new Map()
        for (const student of students) {
            for (const course of student.courses || []) {
                if (course.course_id && !map.has(course.course_id)) {
                    map.set(course.course_id, course.course_title || 'Unknown course')
                }
            }
        }
        return Array.from(map, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title))
    }, [students])
    const visibleStudents = useMemo(() => {
        if (courseFilter === 'all') return students
        return students
            .map(student => ({
                ...student,
                courses: (student.courses || []).filter(course => course.course_id === courseFilter),
            }))
            .filter(student => student.courses.length > 0)
    }, [students, courseFilter])

    const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), 'h:mm a') : null

    // Count per status for tab badges
    const statusCounts = useMemo(() => {
        if (!stats) return {}
        return {
            all: stats.total || 0,
            in_progress: stats.in_progress_count || 0,
            completed: stats.completed_count || 0,
            struggling: stats.struggling_count || 0,
            not_started: stats.not_started_count || 0,
        }
    }, [stats])

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
                <div>
                    <h1 className="page-title">Student Progress</h1>
                    <p className="text-gray-500 mt-1 text-sm">
                        Live view of all student learning activity
                        {lastUpdated && <span className="text-gray-400"> · updated at {lastUpdated}</span>}
                    </p>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="btn-secondary flex items-center gap-2 text-sm py-2"
                >
                    <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
                <StatTile
                    icon={Users}
                    label="Total students"
                    value={stats.total ?? '—'}
                    iconClass="bg-brand-50 text-brand-500"
                />
                <StatTile
                    icon={Activity}
                    label="Active this month"
                    value={stats.active_count ?? '—'}
                    sub={stats.total ? `${Math.round((stats.active_count / stats.total) * 100)}% of all students` : undefined}
                    iconClass="bg-green-50 text-green-600"
                />
                <StatTile
                    icon={Award}
                    label="Avg assessment"
                    value={stats.avg_score != null ? `${stats.avg_score}%` : '—'}
                    sub={stats.avg_completion != null ? `${stats.avg_completion}% avg progress` : undefined}
                    iconClass="bg-amber-50 text-amber-500"
                />
                <StatTile
                    icon={Mic}
                    label="Avg roleplay"
                    value={stats.avg_roleplay_score != null ? `${stats.avg_roleplay_score}%` : 'â€”'}
                    sub={stats.roleplay_attempts != null ? `${stats.roleplay_attempts} attempts` : undefined}
                    iconClass="bg-coral-50 text-coral-500"
                />
                <StatTile
                    icon={AlertTriangle}
                    label="At risk"
                    value={stats.struggling_count ?? '—'}
                    sub="Score below 50% with attempts"
                    iconClass="bg-red-50 text-red-500"
                />
                <StatTile
                    icon={XCircle}
                    label="Roleplay locks"
                    value={stats.roleplay_locked_count ?? 'â€”'}
                    sub="Manual unlock needed"
                    iconClass="bg-red-50 text-red-500"
                />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                        className="input-field pl-9 text-sm"
                        placeholder="Search students by name or email…"
                        value={search}
                        onChange={e => handleSearch(e.target.value)}
                    />
                </div>
                <select
                    className="input-field w-auto text-sm"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                >
                    <option value="">All categories</option>
                    {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
            </div>

            {/* Status tabs */}
            <div className="flex gap-2 mb-5 flex-wrap">
                {STATUSES.map(s => {
                    const isActive = statusFilter === s
                    const count = statusCounts[s]
                    const dotColor = s === 'all' ? '' : STATUS[s]?.dot || ''
                    return (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${isActive
                                    ? 'bg-brand-500 text-white border-brand-500'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-200 hover:text-brand-600'
                                }`}
                        >
                            {s !== 'all' && (
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white' : dotColor}`} />
                            )}
                            {STATUS_LABELS[s]}
                            {count != null && (
                                <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Course toggles */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">
                    <BookOpen size={13} /> Courses
                </span>
                <button
                    onClick={() => setCourseFilter('all')}
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all border ${courseFilter === 'all'
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
                        className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all border ${courseFilter === course.id
                                ? 'bg-brand-500 text-white border-brand-500'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-200 hover:text-brand-600'
                            }`}
                    >
                        {course.title}
                    </button>
                ))}
            </div>

            {/* Student list */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                </div>
            ) : visibleStudents.length === 0 ? (
                <div className="text-center py-20">
                    <Users size={40} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-500 font-medium">No students found</p>
                    {(debouncedSearch || categoryFilter || statusFilter !== 'all' || courseFilter !== 'all') && (
                        <button
                            onClick={() => { setSearch(''); setDebouncedSearch(''); setCategoryFilter(''); setStatusFilter('all'); setCourseFilter('all') }}
                            className="text-brand-500 text-sm mt-2 hover:underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* Column headers */}
                    <div className="flex items-center gap-4 px-5 py-2 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        <div className="flex-1">Student</div>
                        <div className="w-28 hidden md:block text-center">Category</div>
                        <div className="w-20 hidden sm:block text-center">Courses</div>
                        <div className="w-32 hidden lg:block">Progress</div>
                        <div className="w-16 hidden sm:block text-center">Avg score</div>
                        <div className="w-24 hidden lg:block text-right">Last active</div>
                        <div className="w-24 text-right">Status</div>
                        <div className="w-6" />
                    </div>

                    <div className="space-y-2">
                        {visibleStudents.map(student => (
                            <StudentRow key={student._id} student={student} />
                        ))}
                    </div>

                    <p className="text-xs text-gray-400 text-center mt-4">
                        Showing {visibleStudents.length} student{visibleStudents.length !== 1 ? 's' : ''}
                        {statusFilter !== 'all' && ` with status: ${STATUS_LABELS[statusFilter]}`}
                        {courseFilter !== 'all' && ` in ${courseOptions.find(c => c.id === courseFilter)?.title || 'selected course'}`}
                    </p>
                </>
            )}
        </div>
    )
}

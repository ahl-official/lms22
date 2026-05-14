import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { coursesAPI, analyticsAPI } from '../../services/api'
import api from '../../services/api'
import ScoreBadge from '../../components/ScoreBadge'
import {
    BookOpen, ChevronDown, ChevronRight, Layers, Users,
    Mic, FileText, Award, CheckCircle, XCircle,
    MessageSquare, Clock, Lock, Video, BookMarked, ClipboardList,
} from 'lucide-react'
import { format } from 'date-fns'

const lessonProgressAPI = {
    getTraineeCourse: (traineeId, courseId) =>
        api.get(`/lesson-progress/trainee/${traineeId}/course/${courseId}`),
}

// ── Content type badge ────────────────────────────────────────────────────
function ContentBadges({ lesson }) {
    const tags = []
    if (lesson.video_url) tags.push({ icon: Video, label: 'Video', color: 'text-brand-500  bg-brand-50' })
    if (lesson.text_content) tags.push({ icon: FileText, label: 'Text', color: 'text-blue-500   bg-blue-50' })
    if (lesson.study_notes) tags.push({ icon: BookMarked, label: 'Notes', color: 'text-sage-600   bg-sage-50' })
    if (lesson.quiz_questions?.length) tags.push({ icon: ClipboardList, label: 'Quiz', color: 'text-amber-500  bg-amber-50' })
    return (
        <div className="flex items-center gap-1 flex-wrap">
            {tags.map(({ icon: Icon, label, color }) => (
                <span key={label} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${color}`}>
                    <Icon size={9} /> {label}
                </span>
            ))}
        </div>
    )
}

// ── Per-trainee lesson progress inside a module ───────────────────────────
function TraineeLessonProgress({ traineeId, courseId, lessons }) {
    const { data, isLoading } = useQuery({
        queryKey: ['trainee-lesson-progress', traineeId, courseId],
        queryFn: () => lessonProgressAPI.getTraineeCourse(traineeId, courseId),
    })

    const progress = data?.data?.progress || []

    const progMap = {}
    for (const p of progress) {
        progMap[p.lesson_id?.toString?.()] = p
    }

    if (isLoading) return (
        <div className="flex items-center gap-2 py-2 text-gray-400">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
            <span className="text-xs">Loading…</span>
        </div>
    )

    return (
        <div className="space-y-1.5">
            {lessons.map(lesson => {
                const prog = progMap[lesson._id?.toString()]
                const done = prog?.status === 'completed'
                return (
                    <div key={lesson._id} className={`flex items-center gap-3 p-2.5 rounded-xl text-xs ${done ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-gray-100'}`}>
                        <div className="flex-shrink-0">
                            {done
                                ? <CheckCircle size={14} className="text-green-500" />
                                : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />
                            }
                        </div>
                        <p className="flex-1 font-medium text-gray-700 truncate">{lesson.title}</p>
                        <ContentBadges lesson={lesson} />
                        {done && prog.score != null && (
                            <ScoreBadge score={prog.score} size="sm" />
                        )}
                        {done && prog.completed_at && (
                            <span className="text-gray-400 flex-shrink-0">
                                {format(new Date(prog.completed_at), 'MMM d')}
                            </span>
                        )}
                        {!done && (
                            <span className="text-gray-400 flex-shrink-0">Not done</span>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ── Module card ───────────────────────────────────────────────────────────
function ModuleCard({ module, lessons, courseId, idx }) {
    const [expanded, setExpanded] = useState(false)
    const [expandedTrainee, setExpandedTrainee] = useState(null)

    const { data, isLoading } = useQuery({
        queryKey: ['module-trainees', module._id],
        queryFn: () => analyticsAPI.getModuleTrainees(module._id),
    })

    const trainees = data?.data?.trainees || []
    const moduleTotal = trainees.length
    const moduleCompleted = trainees.filter(t => t.passed).length

    return (
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
            >
                <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{module.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{lessons.length} lessons</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-xs text-gray-500">
                    <span>{moduleCompleted}/{moduleTotal} trainees complete</span>
                    {module.avg_score != null && (
                        <ScoreBadge score={module.avg_score} size="sm" />
                    )}
                </div>
                <ChevronDown size={15} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                    {isLoading ? (
                        <div className="flex items-center gap-2 py-4 text-gray-400">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                            <span className="text-sm">Loading…</span>
                        </div>
                    ) : !trainees.length ? (
                        <p className="text-sm text-gray-400 text-center py-4">No attempts yet</p>
                    ) : (
                        <div className="space-y-2">
                            {trainees.map(trainee => (
                                <div key={trainee.trainee_id} className="border border-gray-100 bg-white rounded-xl overflow-hidden">
                                    <button
                                        onClick={() => setExpandedTrainee(v => v === trainee.trainee_id ? null : trainee.trainee_id)}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                            {trainee.name?.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">{trainee.name}</p>
                                            <p className="text-xs text-gray-500 truncate">{trainee.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {trainee.best_score != null
                                                ? <ScoreBadge score={trainee.best_score} size="sm" />
                                                : <span className="text-xs text-gray-400">—</span>
                                            }
                                            {trainee.passed
                                                ? <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-semibold"><CheckCircle size={10} /> Done</span>
                                                : <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">In progress</span>
                                            }
                                            <ChevronDown size={13} className={`text-gray-400 transition-transform ${expandedTrainee === trainee.trainee_id ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {/* Lesson-level detail */}
                                    {expandedTrainee === trainee.trainee_id && (
                                        <div className="border-t border-gray-100 p-4">
                                            <p className="text-xs font-semibold text-gray-500 mb-3">Lesson progress</p>
                                            <TraineeLessonProgress
                                                traineeId={trainee.trainee_id}
                                                courseId={courseId}
                                                lessons={lessons}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Course row ─────────────────────────────────────────────────────────────
function CourseRow({ course }) {
    const [expanded, setExpanded] = useState(false)

    const { data: modulesData, isLoading: modLoading } = useQuery({
        queryKey: ['admin-module-stats', course._id],
        queryFn: () => analyticsAPI.getModuleStats(course._id),
        enabled: expanded,
    })

    const { data: lessonsData, isLoading: lesLoading } = useQuery({
        queryKey: ['admin-course-lessons', course._id],
        queryFn: () => api.get(`/lessons/course/${course._id}`),
        enabled: expanded,
        select: d => d.data?.lessons || [],
    })

    const modules = modulesData?.data?.modules || []
    const allLessons = lessonsData || []

    const lessonsByModule = {}
    for (const l of allLessons) {
        const k = (l.module_id?._id || l.module_id)?.toString()
        if (k) {
            if (!lessonsByModule[k]) lessonsByModule[k] = []
            lessonsByModule[k].push(l)
        }
    }

    return (
        <div className="card">
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-4 text-left"
            >
                <div className="w-11 h-11 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={20} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800">{course.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {course.is_published ? 'Published' : 'Draft'}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 px-3 py-1.5 rounded-xl">
                        <Layers size={12} /> Modules
                        <ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </span>
                </div>
            </button>

            {expanded && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    {modLoading || lesLoading ? (
                        <div className="flex items-center gap-2 py-4 text-gray-400">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                            <span className="text-sm">Loading…</span>
                        </div>
                    ) : modules.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No modules yet</p>
                    ) : (
                        <div className="space-y-3">
                            {modules.map((mod, idx) => (
                                <ModuleCard
                                    key={mod._id}
                                    module={mod}
                                    lessons={lessonsByModule[mod._id?.toString()] || []}
                                    courseId={course._id}
                                    idx={idx}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminModuleReview() {
    const { data, isLoading } = useQuery({
        queryKey: ['all-courses'],
        queryFn: () => coursesAPI.getAll(),
    })

    const courses = data?.data?.courses || []

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="page-title">Module Review</h1>
                <p className="text-gray-500 mt-1">
                    Course → Module → per-trainee lesson completion and scores
                </p>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                </div>
            ) : courses.length === 0 ? (
                <div className="text-center py-20">
                    <BookOpen size={48} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-500">No courses yet</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {courses.map(course => (
                        <CourseRow key={course._id} course={course} />
                    ))}
                </div>
            )}
        </div>
    )
}
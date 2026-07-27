// frontend/src/pages/trainee/CourseView.jsx

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  coursesAPI, testsAPI, attemptsAPI, enrollmentsAPI,
  modulesAPI, lessonsAPI, lessonProgressAPI, rolePlayAPI,
} from '../../services/api'
import VideoPlayer from '../../components/VideoPlayer'
import TestTaker from '../../components/TestTaker'
import LessonAINotes from '../../components/LessonAINotes'
import LessonTestPanel from '../../components/LessonTest'
import RolePlayPanel from '../../components/RolePlay'
import {
  BookOpen, Mic, ClipboardList, ChevronLeft, Lock, Play,
  CheckCircle, ChevronDown, ChevronRight, FileText, BookMarked,
  Award, Clock, XCircle, Layers, Video, Users,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Lesson content area ────────────────────────────────────────────────────────
function LessonContent({ lesson, onComplete, onVideoEnd }) {
  const qc = useQueryClient()
  const hasQuiz = lesson.quiz_questions?.length > 0
  const hasTest = !!lesson.test_id
  const contentUrl = lesson.content_url || lesson.video_url
  const contentType = lesson.content_type || (['youtube', 'gumlet'].includes(lesson.video_source) ? 'video' : 'unknown')
  const hasContent = !!contentUrl
  const hasVideo = hasContent && contentType === 'video'
  const hasText = !!lesson.text_content
  const hasNotes = !!lesson.study_notes
  const hasAI = lesson.transcript_status === 'ready'
  const hasRolePlay = lesson.transcript_status === 'ready' && !!lesson.transcript

  const { data: rolePlayData, isLoading: rolePlayLoading } = useQuery({
    queryKey: ['role-play-progress', lesson._id],
    queryFn: () => rolePlayAPI.getProgress(lesson._id),
    enabled: !!lesson._id && hasRolePlay,
  })

  const rolePlayProgress = rolePlayData?.data?.progress
  const assessmentLocked = hasRolePlay && (hasQuiz || hasTest) && !rolePlayProgress?.unlocked
  const hasLearningContent = hasContent || hasText || hasNotes || hasAI

  const availableTabs = [
    hasLearningContent && { key: 'learn', label: 'Content & Notes', icon: contentType === 'video' ? Video : FileText },
    hasRolePlay && { key: 'roleplay', label: 'Role Playing', icon: Users },
    (hasQuiz || hasTest) && { key: 'quiz', label: 'Assessment', icon: assessmentLocked ? Lock : ClipboardList },
  ].filter(Boolean)

  const [tab, setTab] = useState(availableTabs[0]?.key || 'learn')

  useEffect(() => {
    if (!availableTabs.some(t => t.key === tab)) {
      setTab(availableTabs[0]?.key || 'learn')
    }
  }, [lesson._id, availableTabs.map(t => t.key).join('|')]) // eslint-disable-line

  // Auto-complete text/notes-only lessons
  useEffect(() => {
    if (!lesson.is_completed && !hasVideo && !hasQuiz && !hasTest && (hasContent || hasText || hasNotes)) {
      const t = setTimeout(() => onComplete(null), 1500)
      return () => clearTimeout(t)
    }
  }, [lesson._id, hasContent, hasVideo, hasQuiz, hasTest, hasText, hasNotes]) // eslint-disable-line

  if (!availableTabs.length) return (
    <div className="card text-center py-16 text-gray-400">
      <BookOpen size={36} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm">No content added yet</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-gray-800">{lesson.title}</h2>
          {lesson.description && <p className="text-gray-500 text-sm mt-1">{lesson.description}</p>}
          {lesson.duration_minutes && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 mt-1.5">
              <Clock size={11} /> {lesson.duration_minutes} min
            </span>
          )}
        </div>
        {lesson.is_completed && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 px-3 py-1.5 rounded-full flex-shrink-0">
            <CheckCircle size={12} /> Completed
          </span>
        )}
      </div>

      {/* Tabs */}
      {availableTabs.length > 1 && (
        <div className="flex gap-2 mb-5 bg-gray-100 p-1 rounded-2xl w-fit flex-wrap">
          {availableTabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === key ? 'bg-white shadow-soft text-brand-600' : 'text-gray-600 hover:text-gray-800'
                }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'learn' && (
        <div className="space-y-4">
          {hasContent && (
            <div className="card">
              <VideoPlayer
                videoUrl={contentUrl}
                videoSource={lesson.video_source}
                contentType={contentType}
                embedUrl={lesson.embed_url}
                title={lesson.title}
                onEnded={onVideoEnd}
              />
            </div>
          )}
          {hasAI && <LessonAINotes lesson={lesson} />}
          {(hasNotes || hasText) && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <BookMarked size={16} className="text-sage-600" />
                <h3 className="font-semibold text-gray-800">Notes</h3>
              </div>
              {hasNotes && (
                <div className="bg-sage-50 rounded-2xl p-5 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                  {lesson.study_notes}
                </div>
              )}
              {hasText && (
                <div className={`${hasNotes ? 'mt-4 pt-4 border-t border-gray-100' : ''} text-sm text-gray-700 leading-relaxed whitespace-pre-wrap`}>
                  {lesson.text_content}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'quiz' && (
        <div className="card">
          <LessonTestPanel
            lesson={lesson}
            onComplete={onComplete}
            locked={assessmentLocked}
            rolePlayProgress={rolePlayProgress}
            rolePlayLoading={rolePlayLoading}
          />
        </div>
      )}

      {tab === 'roleplay' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand-500" />
              <h3 className="font-semibold text-gray-800">Role Playing Practice</h3>
            </div>
            <span className="text-xs text-gray-400">Score {rolePlayProgress?.threshold || 70}% to unlock assessment</span>
          </div>
          <RolePlayPanel
            lesson={lesson}
            progress={rolePlayProgress}
            onProgressUpdate={() => {
              qc.invalidateQueries({ queryKey: ['role-play-progress', lesson._id] })
              qc.invalidateQueries({ queryKey: ['course-role-play-progress', lesson.course_id?._id || lesson.course_id] })
            }}
          />
        </div>
      )}

    </div>
  )
}

// ── Module sidebar ─────────────────────────────────────────────────────────────
function ModuleSidebar({ modules, lessons, selectedLesson, onSelect }) {
  const [expanded, setExpanded] = useState(() => {
    const first = modules.find(m => !m.is_locked)
    return first ? { [first._id]: true } : {}
  })

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const forModule = (mid) => lessons.filter(l => {
    const id = l.module_id?._id || l.module_id
    return id?.toString() === mid?.toString()
  })

  return (
    <div className="space-y-0.5">
      {modules.map((mod, idx) => {
        const modLessons = forModule(mod._id)
        const isOpen = !!expanded[mod._id]
        const doneCount = modLessons.filter(l => l.is_completed).length
        const allDone = modLessons.length > 0 && doneCount === modLessons.length

        return (
          <div key={mod._id}>
            <button onClick={() => !mod.is_locked && toggle(mod._id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors text-left ${mod.is_locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'
                }`}>
              {mod.is_locked ? <Lock size={13} className="text-gray-400 flex-shrink-0" />
                : allDone ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                  : isOpen ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
                    : <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />}
              <span className={`text-sm font-semibold flex-1 truncate ${mod.is_locked ? 'text-gray-400' : 'text-gray-700'}`}>
                {mod.title}
              </span>
              {!mod.is_locked && modLessons.length > 0 && (
                <span className={`text-xs flex-shrink-0 font-medium ${allDone ? 'text-green-600' : 'text-gray-400'}`}>
                  {doneCount}/{modLessons.length}
                </span>
              )}
            </button>

            {mod.is_locked && (
              <p className="text-xs text-gray-400 px-8 pb-1">Complete Module {idx} first</p>
            )}

            {isOpen && !mod.is_locked && (
              <div className="ml-4 space-y-0.5 mb-1">
                {modLessons.map(lesson => {
                  const active = selectedLesson?._id === lesson._id
                  const hasAssessment = lesson.test_id || lesson.quiz_questions?.length > 0
                  const hasRP = lesson.transcript_status === 'ready'
                  return (
                    <button key={lesson._id} onClick={() => onSelect(lesson)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm transition-colors ${active ? 'bg-brand-500 text-white'
                          : lesson.is_completed ? 'text-green-700 hover:bg-green-50'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}>
                      {lesson.is_completed
                        ? <CheckCircle size={11} className={active ? 'text-white' : 'text-green-500'} />
                        : <Play size={10} className="flex-shrink-0" />}
                      <span className="truncate flex-1">{lesson.title}</span>
                      {hasAssessment && (
                        <ClipboardList size={10} className={`flex-shrink-0 ${active ? 'text-white/70' : 'text-gray-400'}`} />
                      )}
                      {hasRP && !hasAssessment && (
                        <Users size={10} className={`flex-shrink-0 ${active ? 'text-white/70' : 'text-gray-400'}`} />
                      )}
                      {lesson.duration_minutes && (
                        <span className={`text-xs flex-shrink-0 ${active ? 'text-white/70' : 'text-gray-400'}`}>
                          {lesson.duration_minutes}m
                        </span>
                      )}
                    </button>
                  )
                })}
                {!modLessons.length && (
                  <p className="px-3 py-2 text-xs text-gray-400 italic">No lessons yet</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main CourseView ────────────────────────────────────────────────────────────
export default function CourseView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState('video')
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [voiceLanguage, setVoiceLanguage] = useState('en')

  const { data: courseData, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesAPI.getOne(id),
  })

  const { data: courseRolePlayData } = useQuery({
    queryKey: ['course-role-play-progress', id],
    queryFn: () => rolePlayAPI.getCourseProgress(id),
    enabled: !!id,
  })

  const { data: modulesData } = useQuery({
    queryKey: ['modules', id],
    queryFn: () => modulesAPI.getByCourse(id),
    enabled: !!id,
  })

  const { data: lessonsData, refetch: refetchLessons } = useQuery({
    queryKey: ['course-lessons', id],
    queryFn: () => lessonsAPI.getByCourse(id),
    enabled: !!id,
  })

  const { data: testsData } = useQuery({
    queryKey: ['tests', id],
    queryFn: () => testsAPI.getByCourse(id),
    enabled: tab === 'test',
  })

  const { data: enrollData } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => enrollmentsAPI.getMy(),
    select: d => d?.data?.enrollments?.find(e => {
      const cid = e.course_id?._id || e.course_id
      return cid === id || cid?.toString() === id
    }),
  })

  const progressMutation = useMutation({
    mutationFn: ({ enrollmentId, progress }) =>
      enrollmentsAPI.updateProgress(enrollmentId, { progress }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-enrollments'] }),
  })

  const completeMutation = useMutation({
    mutationFn: ({ lesson_id, module_id, course_id, score }) =>
      lessonProgressAPI.complete({ lesson_id, module_id, course_id, score }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['modules', id] })
      qc.invalidateQueries({ queryKey: ['my-enrollments'] })
      refetchLessons()
      if (data?.data?.module_completed) {
        toast.success('Module complete! Next module unlocked 🎉', { duration: 4000 })
      }
      setSelectedLesson(prev =>
        prev ? { ...prev, is_completed: true, lesson_score: data?.data?.progress?.score ?? null } : prev
      )
    },
  })

  const handleComplete = useCallback((score = null) => {
    if (!selectedLesson || selectedLesson.is_completed) return
    const moduleId = selectedLesson.module_id?._id || selectedLesson.module_id
    completeMutation.mutate({ lesson_id: selectedLesson._id, module_id: moduleId, course_id: id, score })
  }, [selectedLesson, id]) // eslint-disable-line

  const handleVideoEnd = useCallback(() => {
    if (selectedLesson && !selectedLesson.quiz_questions?.length && !selectedLesson.test_id) {
      handleComplete(null)
    }
    if (enrollData) progressMutation.mutate({ enrollmentId: enrollData._id, progress: 50 })
  }, [selectedLesson, enrollData, handleComplete]) // eslint-disable-line

  const handleLessonSelect = (lesson) => {
    const mod = modules.find(m => {
      const mid = m._id?.toString()
      const lid = lesson.module_id?._id?.toString() || lesson.module_id?.toString()
      return mid === lid
    })
    if (mod?.is_locked) {
      toast.error('Complete the previous module first', { icon: '🔒' })
      return
    }
    setSelectedLesson(lesson)
  }

  const handleWrittenSubmit = async (answers) => {
    if (!test) return
    const res = await attemptsAPI.submitWritten({ test_id: test._id, course_id: id, answers })
    qc.invalidateQueries({ queryKey: ['my-enrollments'] })
    qc.invalidateQueries({ queryKey: ['tests', id] })
    toast.success('Test submitted!')
    navigate(`/trainee/results/${res.data.attempt._id}`)
  }

  const course = courseData?.data?.course
  const courseLock = courseRolePlayData?.data
  const courseLocked = !!courseLock?.locked
  const test = testsData?.data?.tests?.[0]
  const modules = modulesData?.data?.modules || []
  const lessons = lessonsData?.data?.lessons || []
  const hasModules = modules.length > 0
  const legacyAttempt = test?.assessment_attempt

  useEffect(() => {
    if (selectedLesson || !lessons.length) return
    const firstUnlocked = modules.find(m => !m.is_locked)
    if (firstUnlocked) {
      const firstLesson = lessons.find(l => {
        const mid = l.module_id?._id || l.module_id
        return mid?.toString() === firstUnlocked._id?.toString()
      })
      if (firstLesson) setSelectedLesson(firstLesson)
      return
    }
    setSelectedLesson(lessons[0])
  }, [selectedLesson, modules, lessons])

  const freshSelectedLesson = selectedLesson
    ? (lessons.find(l => l._id === selectedLesson._id) || selectedLesson)
    : null

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
  if (!course) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <BookOpen size={48} className="text-gray-300" />
      <p className="text-gray-500">Course not found</p>
      <button onClick={() => navigate('/trainee')} className="btn-secondary">Go back</button>
    </div>
  )

  if (courseLocked) return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => navigate('/trainee')}
        className="flex items-center gap-1 text-gray-500 hover:text-brand-600 text-sm mb-4 transition-colors">
        <ChevronLeft size={15} /> Back to courses
      </button>
      <div className="card text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Lock size={34} className="text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Course locked</h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          You have used 10 role playing attempts without reaching the required score. Contact your trainer to unlock this course.
        </p>
        {courseLock?.locked_progress?.lesson_id?.title && (
          <p className="text-xs text-gray-400 mt-3">
            Locked at: {courseLock.locked_progress.lesson_id.title}
          </p>
        )}
      </div>
    </div>
  )

  // ── Module + Lesson view ───────────────────────────────────────────────────────
  if (hasModules) {
    const totalLessons = lessons.length
    const completedLessons = lessons.filter(l => l.is_completed).length
    const completedModules = modules.filter(m => m.is_completed).length
    const overallPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <button onClick={() => navigate('/trainee')}
          className="flex items-center gap-1 text-gray-500 hover:text-brand-600 text-sm mb-4 transition-colors">
          <ChevronLeft size={15} /> Back to courses
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers size={13} className="text-brand-500" />
              <span className="text-xs text-brand-600 font-semibold">
                {completedModules}/{modules.length} module{modules.length !== 1 ? 's' : ''} complete · {completedLessons}/{totalLessons} lessons done
              </span>
            </div>
            <h1 className="page-title">{course.title}</h1>
            {course.description && <p className="text-gray-500 mt-1 max-w-2xl text-sm">{course.description}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="relative w-12 h-12">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#6366f1" strokeWidth="3"
                    strokeDasharray={`${overallPct * 0.942} 100`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-brand-600">
                  {overallPct}%
                </span>
              </div>
            </div>
            {totalLessons > 0 && completedLessons === totalLessons && (
              <span className="badge badge-green flex items-center gap-1"><CheckCircle size={12} /> Completed</span>
            )}
          </div>
        </div>

        <div className="flex gap-5 items-start">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0 card p-3 sticky top-4 max-h-[80vh] overflow-y-auto">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-3">Course Content</p>
            {lessons.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-4 text-center">No lessons yet</p>
            ) : (
              <ModuleSidebar modules={modules} lessons={lessons}
                selectedLesson={freshSelectedLesson} onSelect={handleLessonSelect} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {freshSelectedLesson ? (
              <LessonContent lesson={freshSelectedLesson}
                onComplete={handleComplete} onVideoEnd={handleVideoEnd} />
            ) : (
              <div className="card text-center py-20 text-gray-400">
                <Play size={38} className="mx-auto mb-3 opacity-30" />
                <p>Select a lesson from the sidebar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Legacy view (no modules) ──────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/trainee')}
        className="flex items-center gap-1 text-gray-500 hover:text-brand-600 text-sm mb-4 transition-colors">
        <ChevronLeft size={15} /> Back to courses
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="page-title">{course.title}</h1>
          {course.description && <p className="text-gray-500 mt-1 max-w-2xl">{course.description}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {course.requires_voice_test && (
            <span className="badge badge-coral flex items-center gap-1"><Mic size={12} /> Voice Required</span>
          )}
          {enrollData?.status === 'completed' && (
            <span className="badge badge-green flex items-center gap-1"><CheckCircle size={12} /> Completed</span>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-2xl w-fit">
        {[
          { key: 'video', label: 'Watch Video', icon: Play },
          { key: 'test', label: 'Take Test', icon: course.requires_voice_test ? Mic : ClipboardList },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === key ? 'bg-white shadow-soft text-brand-600' : 'text-gray-600 hover:text-gray-800'
              }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === 'video' && (
        <div className="card">
          <VideoPlayer videoUrl={course.video_url} videoSource={course.video_source}
            title={course.title}
            onEnded={() => {
              if (enrollData) progressMutation.mutate({ enrollmentId: enrollData._id, progress: 50 })
            }} />
          <div className="mt-6">
            <button onClick={() => setTab('test')} className="btn-primary flex items-center gap-2">
              {course.requires_voice_test ? <Mic size={15} /> : <ClipboardList size={15} />}
              Proceed to Test
            </button>
          </div>
        </div>
      )}

      {tab === 'test' && (
        !test ? (
          <div className="card text-center py-16">
            <Lock size={38} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No test available yet</p>
          </div>
        ) : course.requires_voice_test ? (
          <div className="card text-center py-12">
            {legacyAttempt && (
              <div className={`mb-5 rounded-2xl border p-4 text-left ${legacyAttempt.passed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className={`text-sm font-semibold ${legacyAttempt.passed ? 'text-green-800' : 'text-amber-800'}`}>
                  Previous assessment score: {Math.round(legacyAttempt.latest_score)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Best score: {Math.round(legacyAttempt.best_score)}% · Attempts: {legacyAttempt.attempts_used}/{legacyAttempt.max_attempts}
                </p>
              </div>
            )}
            <div className="w-16 h-16 rounded-2xl bg-coral-50 flex items-center justify-center mx-auto mb-4">
              <Mic size={26} className="text-coral-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Voice Assessment</h2>
            <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
              The AI will speak questions and listen to your verbal responses.
            </p>
            <div className="max-w-xs mx-auto mb-5 text-left">
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">Question language</label>
              <select
                className="input-field text-sm"
                value={voiceLanguage}
                onChange={e => setVoiceLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>
            <button onClick={() => navigate(`/voice-test/${course._id}?language=${voiceLanguage}`)}
              disabled={legacyAttempt?.attempts_remaining === 0}
              className="btn-primary flex items-center gap-2 mx-auto">
              <Mic size={15} /> {legacyAttempt ? 'Retake Voice Test' : 'Start Voice Test'}
            </button>
            {legacyAttempt?.attempts_remaining === 0 && (
              <p className="text-xs text-red-500 mt-3">Maximum attempts reached.</p>
            )}
          </div>
        ) : (
          <div className="card">
            {legacyAttempt && (
              <div className={`mb-5 rounded-2xl border p-4 ${legacyAttempt.passed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className={`text-sm font-semibold ${legacyAttempt.passed ? 'text-green-800' : 'text-amber-800'}`}>
                  Previous assessment score: {Math.round(legacyAttempt.latest_score)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Best score: {Math.round(legacyAttempt.best_score)}% · Attempts: {legacyAttempt.attempts_used}/{legacyAttempt.max_attempts}
                </p>
              </div>
            )}
            {legacyAttempt?.attempts_remaining === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Lock size={30} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Maximum attempts reached.</p>
              </div>
            ) : (
              <TestTaker test={test} onSubmit={handleWrittenSubmit} />
            )}
          </div>
        )
      )}
    </div>
  )
}

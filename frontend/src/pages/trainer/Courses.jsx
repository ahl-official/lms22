import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { coursesAPI, modulesAPI, testsAPI, enrollmentsAPI, usersAPI, lessonsAPI } from '../../services/api'
import {
  BookOpen, Plus, Zap, Globe, EyeOff, Mic, Edit2, Users,
  RefreshCw, Loader2, FileText, X, CheckCircle, AlertCircle,
  Trash2, Eye, PenLine, Search, Lock, ChevronUp, ChevronDown,
  ChevronRight, Video, Layers, ChevronDown as Expand, FileSearch,
  ClipboardList, BookMarked, Play, Tag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'

const Unlock = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
)

// ── transcript status badge ───────────────────────────────────────────────────
const transcriptBadge = {
  ready: 'bg-green-100 text-green-700',
  fetching: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  none: 'bg-gray-100 text-gray-500',
}

// ── Test review panel — shown after AI generation ────────────────────────────
function TestReviewPanel({ lesson, onApproved, onDeleted }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lesson-test', lesson._id],
    queryFn: () => lessonsAPI.getLessonTest(lesson._id),
    enabled: !!lesson.test_id,
  })
  const [approving, setApproving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const test = data?.data?.test

  const handleApprove = async () => {
    setApproving(true)
    try {
      await lessonsAPI.approveLessonTest(lesson._id)
      toast.success('Test approved — trainees can see it now')
      onApproved()
    } catch { toast.error('Failed to approve') }
    finally { setApproving(false) }
  }

  const handleDelete = async () => {
    if (!confirm('Discard this test?')) return
    setDeleting(true)
    try {
      await lessonsAPI.deleteLessonTest(lesson._id)
      toast.success('Test discarded')
      onDeleted()
    } catch { toast.error('Failed') }
    finally { setDeleting(false) }
  }

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-gray-400 px-4">
      <Loader2 size={14} className="animate-spin" />
      <span className="text-sm">Loading generated test…</span>
    </div>
  )

  if (!test) return null

  return (
    <div className="border-t border-amber-200 bg-amber-50 p-4 space-y-3">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-800">Review Generated Test</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {test.questions?.length} questions · {test.test_type} · Pass {test.passing_score}%
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-amber-100 text-amber-700 flex-shrink-0">
          ⏳ Awaiting approval
        </span>
      </div>

      {/* questions */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {(test.questions || []).map((q, i) => (
          <div key={i} className="border border-gray-200 rounded-xl p-3 bg-white">
            <p className="text-sm font-medium text-gray-800 mb-2 flex items-start gap-2">
              <span className="inline-flex w-5 h-5 rounded bg-brand-100 text-brand-600 text-xs font-bold items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {q.question}
            </p>
            {q.type === 'mcq' && q.options?.length > 0 && (
              <div className="ml-7 space-y-1">
                {q.options.map((opt, oi) => (
                  <div key={oi} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg ${opt === q.correct_answer
                      ? 'bg-green-100 text-green-700 font-semibold'
                      : 'bg-gray-50 text-gray-600 border border-gray-100'
                    }`}>
                    {opt === q.correct_answer && <CheckCircle size={10} className="flex-shrink-0" />}
                    {opt}
                  </div>
                ))}
              </div>
            )}
            {q.type === 'short_answer' && q.correct_answer && (
              <p className="ml-7 text-xs text-gray-400 italic mt-1">
                Expected: {q.correct_answer}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
        >
          <Trash2 size={13} />
          {deleting ? 'Discarding…' : 'Discard & Regenerate'}
        </button>
        <button
          onClick={handleApprove}
          disabled={approving}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold transition-colors disabled:opacity-40"
        >
          {approving
            ? <><Loader2 size={13} className="animate-spin" /> Approving…</>
            : <><CheckCircle size={13} /> Approve & Publish Test</>
          }
        </button>
      </div>
    </div>
  )
}

// ── Lesson row inside the inline dropdown ─────────────────────────────────────
function InlineLessonRow({ lesson, courseId, onRefresh }) {
  const [fetchingTranscript, setFetchingTranscript] = useState(false)
  const [generatingTest, setGeneratingTest] = useState(false)
  const [showTestReview, setShowTestReview] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)

  const contentUrl = lesson.content_url || lesson.video_url
  const contentType = lesson.content_type || (['youtube', 'gumlet'].includes(lesson.video_source) ? 'video' : 'unknown')
  const hasContent = !!contentUrl
  const hasTranscript = lesson.transcript_status === 'ready'
  const hasTest = !!lesson.test_id
  const testIsLive = lesson.test_id?.is_active === true
  const testIsDraft = hasTest && !testIsLive

  const handleFetchTranscript = async () => {
    if (!hasContent) return toast.error('Add a content URL to this lesson first')
    setFetchingTranscript(true)
    try {
      await lessonsAPI.fetchTranscript(lesson._id)
      toast.success('Transcript fetched!')
      onRefresh()
    } catch (err) {
      const msg = err.response?.data?.message || 'Fetch failed'
      toast.error(msg, { duration: 6000 })
      onRefresh()
    } finally {
      setFetchingTranscript(false)
    }
  }

  const handleGenerateTest = async (testType) => {
    if (!hasTranscript) return toast.error('Fetch transcript first')
    setShowTypePicker(false)
    setGeneratingTest(true)
    try {
      await lessonsAPI.generateLessonTest(lesson._id, { test_type: testType, question_count: 5 })
      toast.success(testType === 'voice' ? 'Voice test generated — review & approve' : 'MCQ test generated — review & approve')
      onRefresh()
      setShowTestReview(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Generation failed')
    } finally { setGeneratingTest(false) }
  }

  const handleDeleteTest = async () => {
    if (!confirm('Delete this lesson test?')) return
    try {
      await lessonsAPI.deleteLessonTest(lesson._id)
      toast.success('Test deleted')
      setShowTestReview(false)
      onRefresh()
    } catch { toast.error('Failed') }
  }

  const handlePublish = async () => {
    try {
      await lessonsAPI.publish(lesson._id, !lesson.is_published)
      onRefresh()
    } catch { toast.error('Failed') }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete lesson "${lesson.title}"?`)) return
    try {
      await lessonsAPI.delete(lesson._id)
      toast.success('Lesson deleted')
      onRefresh()
    } catch { toast.error('Failed') }
  }

  return (
    <div className="border border-gray-100 rounded-xl bg-white overflow-hidden">
      {/* ── lesson header ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasContent && (contentType === 'video'
            ? <Video size={13} className="text-brand-400" />
            : <FileText size={13} className="text-brand-400" />
          )}
          {lesson.text_content && <FileText size={13} className="text-blue-400" />}
          {lesson.study_notes && <BookMarked size={13} className="text-sage-500" />}
          {lesson.quiz_questions?.length > 0 && <ClipboardList size={13} className="text-amber-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{lesson.title}</p>
          {lesson.duration_minutes && (
            <p className="text-xs text-gray-400">{lesson.duration_minutes} min</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${transcriptBadge[lesson.transcript_status] || transcriptBadge.none}`}>
            {lesson.transcript_status === 'ready' ? '✓ Transcript'
              : lesson.transcript_status === 'fetching' ? 'Fetching…'
                : lesson.transcript_status === 'error' ? '✗ Error'
                  : 'No transcript'}
          </span>

          {hasTest && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${testIsLive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {testIsLive ? '✓ Test live' : '⏳ Review test'}
            </span>
          )}

          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lesson.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {lesson.is_published ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>

      {/* ── action bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-t border-gray-100 flex-wrap">

        {/* TRANSCRIPT */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 font-medium">Transcript:</span>
          <button
            onClick={handleFetchTranscript}
            disabled={fetchingTranscript || !hasContent}
            title={!hasContent ? 'Add a content URL first' : 'Auto-extract text from content link'}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {fetchingTranscript ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {fetchingTranscript ? 'Fetching…' : 'Auto-fetch'}
          </button>
          <TranscriptPasteButton lesson={lesson} onRefresh={onRefresh} />
        </div>

        <div className="w-px h-4 bg-gray-200 mx-1" />

        {/* TEST */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Test:</span>
          {generatingTest ? (
            <span className="flex items-center gap-1 text-xs text-amber-700">
              <Loader2 size={11} className="animate-spin" /> Generating…
            </span>
          ) : !hasTest ? (
            // ── type picker ──
            showTypePicker ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleGenerateTest('written')}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 transition-colors font-semibold"
                >
                  <ClipboardList size={11} /> MCQ
                </button>
                <button
                  onClick={() => handleGenerateTest('voice')}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-coral-50 border border-coral-200 text-coral-700 hover:bg-coral-100 transition-colors font-semibold"
                >
                  <Mic size={11} /> Voice
                </button>
                <button
                  onClick={() => setShowTypePicker(false)}
                  className="text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (!hasTranscript) return toast.error('Fetch transcript first')
                  setShowTypePicker(true)
                }}
                disabled={!hasTranscript}
                title={!hasTranscript ? 'Fetch transcript first' : 'Choose test type and generate'}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Zap size={11} /> AI Generate
              </button>
            )
          ) : testIsLive ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle size={11} />
                {lesson.test_id?.test_type === 'voice' ? 'Voice test live' : 'MCQ live'}
              </span>
              <button onClick={handleDeleteTest}
                className="text-xs px-2 py-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 size={11} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTestReview(v => !v)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <Eye size={11} />
              {showTestReview ? 'Hide questions' : 'Review & Approve'}
            </button>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 mx-1" />

        {/* LESSON ACTIONS */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={handlePublish}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${lesson.is_published
                ? 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
                : 'bg-brand-50 border-brand-200 text-brand-600 hover:bg-brand-100'
              }`}>
            {lesson.is_published
              ? <><EyeOff size={11} className="inline mr-1" />Hide</>
              : <><Eye size={11} className="inline mr-1" />Publish</>}
          </button>
          <button onClick={handleDelete}
            className="text-xs px-2 py-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* ── Test review panel (shows after generation or clicking Review) ── */}
      {testIsDraft && showTestReview && (
        <TestReviewPanel
          lesson={lesson}
          onApproved={() => { setShowTestReview(false); onRefresh() }}
          onDeleted={() => { setShowTestReview(false); onRefresh() }}
        />
      )}

      {/* hints */}
      {!hasContent && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-600 flex items-center gap-1.5">
            <AlertCircle size={11} />
            No content URL - edit this lesson to add a video, PDF, DOCX, Google Docs, or Drive link before extracting text
          </p>
        </div>
      )}
      {hasTranscript && !hasTest && (
        <div className="px-4 py-2 bg-brand-50 border-t border-brand-100">
          <p className="text-xs text-brand-600 flex items-center gap-1.5">
            <Zap size={11} />
            Transcript ready — click AI Generate to create a test
          </p>
        </div>
      )}
    </div>
  )
}

// ── Paste transcript mini-modal ───────────────────────────────────────────────
function TranscriptPasteButton({ lesson, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(lesson.transcript || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!text.trim()) return toast.error('Paste some transcript text first')
    setSaving(true)
    try {
      await lessonsAPI.saveTranscript(lesson._id, text)
      toast.success('Transcript saved!')
      onRefresh()
      setOpen(false)
    } catch { toast.error('Failed') }
    finally { setSaving(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors">
        <FileText size={11} /> Paste
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-800">Paste Transcript</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">For: <strong>{lesson.title}</strong></p>
            <textarea
              className="input-field min-h-[180px] resize-y text-sm font-mono"
              placeholder="Paste transcript text here…"
              value={text}
              onChange={e => setText(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1 mb-4">{text.length} characters</p>
            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving || !text.trim()} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save Transcript'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Add Lesson form (inline simple) ──────────────────────────────────────────
function AddLessonForm({ moduleId, courseId, onSaved, onCancel }) {
  const [title, setTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      const contentUrl = videoUrl.trim() || null
      await lessonsAPI.create({
        module_id: moduleId,
        course_id: courseId,
        title: title.trim(),
        content_url: contentUrl,
        video_url: contentUrl,
      })
      toast.success('Lesson created')
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="border-2 border-dashed border-brand-200 rounded-xl p-4 bg-brand-50 space-y-3">
      <p className="text-sm font-semibold text-brand-700">New Lesson</p>
      <input className="input-field text-sm" placeholder="Lesson title *"
        value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      <input className="input-field text-sm" placeholder="Content URL (YouTube, Gumlet, PDF, DOCX, Drive) - optional"
        value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
      <p className="text-xs text-gray-400">You can add text content, study notes, and quiz questions after creating.</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-secondary text-sm py-1.5 flex-1">Cancel</button>
        <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary text-sm py-1.5 flex-1">
          {saving ? 'Creating…' : 'Create Lesson'}
        </button>
      </div>
    </div>
  )
}

// ── Add / Edit Module Modal ───────────────────────────────────────────────────
function ModuleModal({ courseId, existing, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: existing?.title || '',
    description: existing?.description || '',
    requires_voice_test: existing?.requires_voice_test || false,
    passing_score: existing?.passing_score || 60,
  })
  const [saving, setSaving] = useState(false)
  const isEdit = !!existing

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      if (isEdit) {
        await modulesAPI.update(existing._id, form)
        toast.success('Module updated')
      } else {
        await modulesAPI.create({ ...form, course_id: courseId })
        toast.success('Module created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-gray-800">{isEdit ? 'Edit Module' : 'New Module'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Title *</label>
            <input className="input-field" placeholder="e.g. Introduction to Sales"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Description</label>
            <textarea className="input-field resize-none min-h-[70px]"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Passing Score (%)</label>
              <input type="number" className="input-field" min={0} max={100}
                value={form.passing_score} onChange={e => setForm(f => ({ ...f, passing_score: Number(e.target.value) }))} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setForm(f => ({ ...f, requires_voice_test: !f.requires_voice_test }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.requires_voice_test ? 'bg-coral-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.requires_voice_test ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <Mic size={13} className="text-coral-500" /> Voice test
                </span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Module'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Enroll Modal ──────────────────────────────────────────────────────────────
function EnrollModal({ course, onClose }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const { user } = useAuthStore()

  const { data: traineeData } = useQuery({
    queryKey: ['trainees-search', search],
    queryFn: () => usersAPI.getAll({ role: 'trainee', search }),
  })
  const allTrainees = traineeData?.data?.users || []
  const filtered = allTrainees.filter(t => !selected.find(s => s._id === t._id))

  const toggle = (trainee) => setSelected(s =>
    s.find(x => x._id === trainee._id) ? s.filter(x => x._id !== trainee._id) : [...s, trainee]
  )

  const handleEnroll = async () => {
    if (!selected.length) return toast.error('Select at least one trainee')
    setLoading(true)
    try {
      await enrollmentsAPI.bulkEnroll({ trainee_ids: selected.map(t => t._id), course_id: course._id })
      toast.success(`${selected.length} trainee${selected.length !== 1 ? 's' : ''} enrolled!`)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-display font-bold">Enroll Trainees</h2>
            <p className="text-sm text-gray-500 mt-0.5">{course.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map(t => (
                <span key={t._id} className="flex items-center gap-1.5 bg-brand-100 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  {t.name}
                  <button onClick={() => toggle(t)} className="hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pl-9 text-sm" placeholder="Search trainees…"
              value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-6">No trainees found</p>
            )}
            {filtered.map(t => (
              <button key={t._id} onClick={() => toggle(t)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-50 text-left">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {t.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{t.name}</p>
                  <p className="text-xs text-gray-500 truncate">{t.email}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleEnroll} disabled={loading || !selected.length} className="btn-primary flex-1">
            {loading ? 'Enrolling…' : `Enroll ${selected.length || ''} Trainee${selected.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Module Row with INLINE lesson dropdown ────────────────────────────────────
function ModuleRow({ module, courseId, idx, total, onEdit, onDelete, onRefresh, isReordering, onReorder }) {
  const [lessonsOpen, setLessonsOpen] = useState(false)
  const [showAddLesson, setShowAddLesson] = useState(false)

  const { data: lessonsData, refetch: refetchLessons } = useQuery({
    queryKey: ['lessons', module._id],
    queryFn: () => lessonsAPI.getByModule(module._id),
    enabled: lessonsOpen,
  })

  const lessons = (lessonsData?.data?.lessons || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const handlePublishToggle = async () => {
    try {
      await modulesAPI.publish(module._id, !module.is_published)
      toast.success(module.is_published ? 'Module hidden' : 'Module published')
      onRefresh()
    } catch { toast.error('Failed') }
  }

  const handleLessonAdded = () => {
    refetchLessons()
    setShowAddLesson(false)
  }

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      {/* ── Module header row ── */}
      <div className="flex items-center gap-3 p-3 bg-gray-50">
        {/* reorder arrows */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button onClick={() => onReorder(module, 'up')} disabled={idx === 0 || isReordering}
            className="p-0.5 rounded text-gray-400 hover:text-brand-500 disabled:opacity-20">
            <ChevronUp size={12} />
          </button>
          <div className="w-6 h-6 rounded-lg bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center">
            {idx + 1}
          </div>
          <button onClick={() => onReorder(module, 'down')} disabled={idx === total - 1 || isReordering}
            className="p-0.5 rounded text-gray-400 hover:text-brand-500 disabled:opacity-20">
            <ChevronDown size={12} />
          </button>
        </div>

        {/* module info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="font-semibold text-gray-800 text-sm">{module.title}</p>
            {module.requires_voice_test && (
              <span className="badge badge-coral text-xs flex items-center gap-1"><Mic size={9} /> Voice</span>
            )}
            <span className={`badge text-xs ${module.is_published ? 'badge-green' : 'badge-gray'}`}>
              {module.is_published ? 'Published' : 'Hidden'}
            </span>
            {idx === 0
              ? <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded-full"><Unlock size={9} /> First</span>
              : <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full"><Lock size={9} /> Locked until {idx} done</span>
            }
          </div>
          {module.description && <p className="text-xs text-gray-400 truncate">{module.description}</p>}
        </div>

        {/* actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={handlePublishToggle}
            className={`text-xs py-1 px-2.5 rounded-xl font-semibold flex items-center gap-1 transition-colors ${module.is_published ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}>
            {module.is_published ? <><EyeOff size={11} /> Hide</> : <><Globe size={11} /> Publish</>}
          </button>
          <button onClick={() => onEdit(module)} className="p-1.5 rounded-xl text-gray-400 hover:text-brand-500 hover:bg-brand-50">
            <Edit2 size={13} />
          </button>
          <button onClick={() => onDelete(module)} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Lessons toggle button ── */}
      <button
        onClick={() => setLessonsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white border-t border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="text-brand-500" />
          <span className="text-sm font-semibold text-gray-700">Lessons</span>
          {lessonsData && (
            <span className="text-xs text-gray-400">
              ({lessons.length} lesson{lessons.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${lessonsOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Inline lessons list ── */}
      {lessonsOpen && (
        <div className="border-t border-gray-100 bg-white p-4 space-y-3">
          {/* lesson rows */}
          {lessons.length > 0 ? (
            <div className="space-y-2">
              {lessons.map(lesson => (
                <InlineLessonRow
                  key={lesson._id}
                  lesson={lesson}
                  courseId={courseId}
                  onRefresh={refetchLessons}
                />
              ))}
            </div>
          ) : (
            !showAddLesson && (
              <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                <BookOpen size={22} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No lessons yet</p>
              </div>
            )
          )}

          {/* Add lesson form or button */}
          {showAddLesson ? (
            <AddLessonForm
              moduleId={module._id}
              courseId={courseId}
              onSaved={handleLessonAdded}
              onCancel={() => setShowAddLesson(false)}
            />
          ) : (
            <button
              onClick={() => setShowAddLesson(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-500 transition-colors"
            >
              <Plus size={14} /> Add Lesson
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Course Card ───────────────────────────────────────────────────────────────
function CourseCard({ course, onDelete }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [showEnroll, setShowEnroll] = useState(false)
  const [editModule, setEditModule] = useState(null)
  const [showAddModule, setShowAddModule] = useState(false)
  const [reordering, setReordering] = useState(false)

  const { data: modulesData, refetch: refetchModules } = useQuery({
    queryKey: ['trainer-modules', course._id],
    queryFn: () => modulesAPI.getByCourse(course._id),
    enabled: expanded,
  })

  const modules = (modulesData?.data?.modules || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const publishMutation = useMutation({
    mutationFn: ({ id, publish }) => coursesAPI.publish(id, publish),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-courses'] }); toast.success('Updated') },
  })

  const handleDeleteModule = async (mod) => {
    if (!confirm(`Delete module "${mod.title}"? All its lessons and tests will also be deleted.`)) return
    try {
      await modulesAPI.delete(mod._id)
      toast.success('Module deleted')
      refetchModules()
    } catch { toast.error('Failed') }
  }

  const handleReorderModule = async (mod, direction) => {
    if (reordering) return
    setReordering(true)
    const idx = modules.findIndex(m => m._id === mod._id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= modules.length) { setReordering(false); return }
    const swap = modules[swapIdx]
    try {
      await Promise.all([
        modulesAPI.reorder(mod._id, swap.order ?? swapIdx),
        modulesAPI.reorder(swap._id, mod.order ?? idx),
      ])
      refetchModules()
    } catch { toast.error('Failed to reorder') }
    finally { setReordering(false) }
  }

  return (
    <>
      <div className="card">
        {/* Course header */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <BookOpen size={22} className="text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-gray-800">{course.title}</h3>
              <span className={`badge text-xs ${course.is_published ? 'badge-green' : 'badge-gray'}`}>
                {course.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
            {course.description && <p className="text-sm text-gray-500 truncate">{course.description}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <button onClick={() => setShowEnroll(true)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Users size={13} /> Enroll
            </button>
            <button
              onClick={() => publishMutation.mutate({ id: course._id, publish: !course.is_published })}
              disabled={publishMutation.isPending}
              className={`text-xs py-1.5 px-3 rounded-xl font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${course.is_published ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}>
              {course.is_published ? <><EyeOff size={12} /> Unpublish</> : <><Globe size={12} /> Publish</>}
            </button>
            <Link to={`/trainer/courses/${course._id}/edit`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Edit2 size={13} /> Edit
            </Link>
            <button onClick={() => onDelete(course)} className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50">
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-colors">
              <Layers size={13} /> Modules
              <ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>

        {/* Modules section */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">
                Modules <span className="text-gray-400 font-normal">({modules.length})</span>
              </p>
              <button onClick={() => setShowAddModule(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-colors">
                <Plus size={13} /> Add Module
              </button>
            </div>

            {modules.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-2xl">
                <Video size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No modules yet</p>
                <button onClick={() => setShowAddModule(true)} className="text-xs text-brand-500 font-semibold mt-1 hover:underline">
                  Add your first module
                </button>
              </div>
            ) : (
              modules.map((mod, idx) => (
                <ModuleRow
                  key={mod._id}
                  module={mod}
                  courseId={course._id}
                  idx={idx}
                  total={modules.length}
                  onEdit={setEditModule}
                  onDelete={handleDeleteModule}
                  onRefresh={refetchModules}
                  isReordering={reordering}
                  onReorder={handleReorderModule}
                />
              ))
            )}
          </div>
        )}
      </div>

      {showEnroll && <EnrollModal course={course} onClose={() => setShowEnroll(false)} />}
      {showAddModule && (
        <ModuleModal courseId={course._id} onClose={() => setShowAddModule(false)} onSaved={refetchModules} />
      )}
      {editModule && (
        <ModuleModal courseId={course._id} existing={editModule} onClose={() => setEditModule(null)} onSaved={refetchModules} />
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrainerCourses() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => coursesAPI.getAll(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => coursesAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-courses'] }); toast.success('Course deleted') },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  })

  const handleDelete = (course) => {
    if (!window.confirm(`Delete "${course.title}"? This cannot be undone.`)) return
    deleteMutation.mutate(course._id)
  }

  const courses = data?.data?.courses || []

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title">My Courses</h1>
          <p className="text-gray-500 mt-1">{courses.length} courses</p>
        </div>
        <Link to="/trainer/courses/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Course
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-4">No courses yet</p>
          <Link to="/trainer/courses/new" className="btn-primary">Create your first course</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map(course => (
            <CourseCard key={course._id} course={course} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

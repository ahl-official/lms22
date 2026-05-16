// frontend/src/pages/trainer/LessonManager.jsx
// UPDATED: adds per-lesson test management (generate AI test, approve, delete)

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { lessonsAPI } from '../../services/api'
import {
    X, Plus, Pencil, Trash2, Save, Loader2, Video,
    FileText, BookMarked, ClipboardList, ChevronUp, ChevronDown,
    Eye, EyeOff, Check, Zap, CheckCircle, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Content type config ────────────────────────────────────────────────────────
const CONTENT_TABS = [
    { key: 'video', label: 'Link', icon: Video },
    { key: 'text', label: 'Text', icon: FileText },
    { key: 'notes', label: 'Study Notes', icon: BookMarked },
    { key: 'quiz', label: 'Quiz', icon: ClipboardList },
]

const contentTags = (lesson) => {
    const tags = []
    const contentUrl = lesson.content_url || lesson.video_url
    const contentType = lesson.content_type || (['youtube', 'gumlet'].includes(lesson.video_source) ? 'video' : 'unknown')
    if (contentUrl) {
        const isVideo = contentType === 'video'
        tags.push({ key: 'content', icon: isVideo ? Video : FileText, label: isVideo ? 'Video' : contentType === 'pdf' ? 'PDF' : 'Doc' })
    }
    if (lesson.text_content) tags.push({ key: 'text', icon: FileText, label: 'Text' })
    if (lesson.study_notes) tags.push({ key: 'notes', icon: BookMarked, label: 'Notes' })
    if (lesson.quiz_questions?.length) tags.push({ key: 'quiz', icon: ClipboardList, label: 'Quiz' })
    if (lesson.test_id) tags.push({ key: 'test', icon: CheckCircle, label: 'Test' })
    return tags
}

// ── Lesson Test Panel (per lesson, in trainer view) ───────────────────────────
function LessonTestManager({ lesson, onRefresh }) {
    const [generating, setGenerating] = useState(false)

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['lesson-test', lesson._id],
        queryFn: () => lessonsAPI.getLessonTest(lesson._id),
    })

    const test = data?.data?.test

    const handleGenerate = async () => {
        if (!lesson.transcript) return toast.error('Fetch or paste transcript first')
        setGenerating(true)
        try {
            await lessonsAPI.generateLessonTest(lesson._id, { test_type: 'written', question_count: 5 })
            toast.success('Test generated! Click Approve to publish it.')
            refetch()
            onRefresh()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Generation failed')
        } finally {
            setGenerating(false)
        }
    }

    const handleApprove = async () => {
        try {
            await lessonsAPI.approveLessonTest(lesson._id)
            toast.success('Test approved — trainees can now see it')
            refetch()
        } catch { toast.error('Failed') }
    }

    const handleDelete = async () => {
        if (!confirm('Delete this lesson test?')) return
        try {
            await lessonsAPI.deleteLessonTest(lesson._id)
            toast.success('Test deleted')
            refetch()
            onRefresh()
        } catch { toast.error('Failed') }
    }

    if (isLoading) return (
        <div className="flex items-center gap-2 py-3 text-gray-400">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading test…</span>
        </div>
    )

    return (
        <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500">Lesson Assessment</p>
                <div className="flex items-center gap-2">
                    {!test && (
                        <button onClick={handleGenerate} disabled={generating}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
                            {generating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                            {generating ? 'Generating…' : 'AI Test'}
                        </button>
                    )}
                    {test && !test.is_active && (
                        <button onClick={handleApprove}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl bg-green-100 text-green-700 hover:bg-green-200">
                            <CheckCircle size={11} /> Approve
                        </button>
                    )}
                    {test && (
                        <button onClick={handleDelete}
                            className="p-1 rounded text-gray-300 hover:text-red-400">
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
            </div>

            {!test ? (
                <p className="text-xs text-gray-400 italic">
                    No assessment yet. {lesson.transcript ? 'Click AI Test to generate.' : 'Add a transcript first.'}
                </p>
            ) : (
                <div className={`flex items-center gap-2 p-2 rounded-xl border text-xs ${test.is_active ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                    {test.is_active
                        ? <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                        : <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />}
                    <span className="font-medium text-gray-700 truncate flex-1">{test.title}</span>
                    <span className={`badge text-xs flex-shrink-0 ${test.is_active ? 'badge-green' : 'badge-amber'}`}>
                        {test.is_active ? 'Live' : 'Draft'}
                    </span>
                    <span className="text-gray-400 flex-shrink-0">{test.questions?.length}Q</span>
                </div>
            )}
        </div>
    )
}

// ── Lesson form ────────────────────────────────────────────────────────────────
function LessonForm({ moduleId, courseId, existing, onClose, onSaved }) {
    const isEdit = !!existing
    const [tab, setTab] = useState('video')
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState({
        title: existing?.title || '',
        description: existing?.description || '',
        duration_minutes: existing?.duration_minutes || '',
        is_published: existing?.is_published ?? false,
        content_url: existing?.content_url || existing?.video_url || '',
        text_content: existing?.text_content || '',
        study_notes: existing?.study_notes || '',
        quiz_questions: existing?.quiz_questions || [],
        quiz_passing_score: existing?.quiz_passing_score ?? 60,
    })

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

    const addQ = () => set('quiz_questions', [...form.quiz_questions,
    { question: '', type: 'mcq', options: ['', '', '', ''], correct_answer: '', points: 1 }])
    const removeQ = (i) => set('quiz_questions', form.quiz_questions.filter((_, idx) => idx !== i))
    const updateQ = (i, field, val) => {
        const qs = [...form.quiz_questions]
        qs[i] = { ...qs[i], [field]: val }
        set('quiz_questions', qs)
    }
    const updateOpt = (qi, oi, val) => {
        const qs = [...form.quiz_questions]
        const opts = [...(qs[qi].options || [])]
        opts[oi] = val
        qs[qi] = { ...qs[qi], options: opts }
        set('quiz_questions', qs)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.title.trim()) return toast.error('Title is required')
        setSaving(true)
        try {
            const payload = {
                ...form,
                module_id: moduleId,
                course_id: courseId,
                duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
                content_url: form.content_url.trim() || null,
                video_url: form.content_url.trim() || null,
                text_content: form.text_content.trim() || null,
                study_notes: form.study_notes.trim() || null,
            }
            if (isEdit) {
                await lessonsAPI.update(existing._id, payload)
                toast.success('Lesson updated')
            } else {
                await lessonsAPI.create(payload)
                toast.success('Lesson created')
            }
            onSaved()
            onClose()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed')
        } finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-4">
                <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
                    <h3 className="text-lg font-display font-bold text-gray-800">
                        {isEdit ? 'Edit Lesson' : 'New Lesson'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="px-7 py-5 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="text-sm font-semibold text-gray-700 block mb-1">
                                    Title <span className="text-red-400">*</span>
                                </label>
                                <input className="input-field" placeholder="e.g. What is Consultative Selling?"
                                    value={form.title} onChange={e => set('title', e.target.value)} required autoFocus />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-gray-700 block mb-1">Description</label>
                                <input className="input-field" placeholder="Brief overview"
                                    value={form.description} onChange={e => set('description', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-gray-700 block mb-1">Duration (min)</label>
                                <input type="number" min={0} className="input-field" placeholder="e.g. 10"
                                    value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} />
                            </div>
                        </div>

                        {/* Content tabs */}
                        <div>
                            <p className="text-sm font-semibold text-gray-700 mb-2">Content</p>
                            <div className="flex gap-2 mb-4 flex-wrap">
                                {CONTENT_TABS.map(({ key, label, icon: Icon }) => (
                                    <button key={key} type="button" onClick={() => setTab(key)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border-2 ${tab === key ? 'border-brand-400 text-brand-600 bg-brand-50' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}>
                                        <Icon size={12} /> {label}
                                    </button>
                                ))}
                            </div>

                            {tab === 'video' && (
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-1">Content URL</label>
                                    <input className="input-field" placeholder="YouTube, Gumlet, Google Drive, PDF, or DOCX URL"
                                        value={form.content_url} onChange={e => set('content_url', e.target.value)} />
                                    <p className="text-xs text-gray-400 mt-1">
                                        The system auto-detects videos, PDFs, DOCX files, Google Docs, and Drive preview links.
                                    </p>
                                </div>
                            )}
                            {tab === 'text' && (
                                <textarea className="input-field resize-y min-h-[140px] text-sm"
                                    placeholder="Write lesson content here…"
                                    value={form.text_content} onChange={e => set('text_content', e.target.value)} />
                            )}
                            {tab === 'notes' && (
                                <textarea className="input-field resize-y min-h-[140px]"
                                    placeholder="Key takeaways, bullet points, summary…"
                                    value={form.study_notes} onChange={e => set('study_notes', e.target.value)} />
                            )}
                            {tab === 'quiz' && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 block mb-1">Passing Score (%)</label>
                                            <input type="number" min={0} max={100} className="input-field w-28 text-sm"
                                                value={form.quiz_passing_score} onChange={e => set('quiz_passing_score', Number(e.target.value))} />
                                        </div>
                                        <button type="button" onClick={addQ}
                                            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 ml-auto">
                                            <Plus size={13} /> Add Question
                                        </button>
                                    </div>
                                    {form.quiz_questions.length === 0 && (
                                        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-2xl">
                                            <ClipboardList size={26} className="mx-auto text-gray-300 mb-2" />
                                            <p className="text-sm text-gray-400">No questions yet</p>
                                        </div>
                                    )}
                                    {form.quiz_questions.map((q, i) => (
                                        <div key={i} className="border-2 border-gray-100 rounded-2xl p-4 space-y-3">
                                            <div className="flex items-start gap-2">
                                                <span className="w-6 h-6 rounded-lg bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    {i + 1}
                                                </span>
                                                <div className="flex-1 space-y-3">
                                                    <input className="input-field text-sm" placeholder="Question text"
                                                        value={q.question} onChange={e => updateQ(i, 'question', e.target.value)} />
                                                    <select className="input-field text-sm w-auto" value={q.type}
                                                        onChange={e => updateQ(i, 'type', e.target.value)}>
                                                        <option value="mcq">Multiple Choice</option>
                                                        <option value="short_answer">Short Answer</option>
                                                    </select>
                                                    {q.type === 'mcq' && (
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-semibold text-gray-500">Click ✓ to mark correct answer</p>
                                                            {(q.options || ['', '', '', '']).map((opt, oi) => (
                                                                <div key={oi} className="flex items-center gap-2">
                                                                    <button type="button" onClick={() => updateQ(i, 'correct_answer', opt)}
                                                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${q.correct_answer === opt ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-green-400'
                                                                            }`}>
                                                                        {q.correct_answer === opt && <Check size={10} className="text-white" />}
                                                                    </button>
                                                                    <input className="input-field text-sm py-1.5" placeholder={`Option ${oi + 1}`}
                                                                        value={opt} onChange={e => updateOpt(i, oi, e.target.value)} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <button type="button" onClick={() => removeQ(i)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-gray-100">
                            <button type="button" onClick={() => set('is_published', !form.is_published)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${form.is_published ? 'bg-brand-500' : 'bg-gray-200'}`}>
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_published ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-sm text-gray-700">Published (visible to trainees)</span>
                        </label>
                    </div>

                    <div className="flex gap-3 px-7 pb-6">
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> {isEdit ? 'Save Changes' : 'Create Lesson'}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ── Lesson row ─────────────────────────────────────────────────────────────────
function LessonRow({ lesson, idx, total, onEdit, onDelete, onReorder, onTogglePublish, reordering, onRefresh }) {
    const [showTest, setShowTest] = useState(false)
    const tags = contentTags(lesson)

    return (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors group">
                {/* Reorder */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => onReorder(lesson, 'up')} disabled={idx === 0 || reordering}
                        className="p-0.5 text-gray-300 hover:text-brand-500 disabled:opacity-20">
                        <ChevronUp size={11} />
                    </button>
                    <span className="w-5 h-5 rounded bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                    <button onClick={() => onReorder(lesson, 'down')} disabled={idx === total - 1 || reordering}
                        className="p-0.5 text-gray-300 hover:text-brand-500 disabled:opacity-20">
                        <ChevronDown size={11} />
                    </button>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 truncate">{lesson.title}</p>
                        {!lesson.is_published && <span className="badge badge-gray text-xs">Draft</span>}
                        {lesson.test_id && (
                            <span className="badge badge-green text-xs flex items-center gap-1">
                                <CheckCircle size={9} /> Test
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {tags.map(({ key, icon: Icon, label }) => (
                            <span key={key} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-brand-50 text-brand-600">
                                <Icon size={9} /> {label}
                            </span>
                        ))}
                        {lesson.duration_minutes && <span className="text-xs text-gray-400">{lesson.duration_minutes}m</span>}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setShowTest(v => !v)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50"
                        title="Manage test">
                        <ClipboardList size={13} />
                    </button>
                    <button onClick={() => onTogglePublish(lesson)}
                        className={`p-1.5 rounded-lg transition-colors ${lesson.is_published ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                        title={lesson.is_published ? 'Unpublish' : 'Publish'}>
                        {lesson.is_published ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button onClick={() => onEdit(lesson)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50">
                        <Pencil size={13} />
                    </button>
                    <button onClick={() => onDelete(lesson)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50">
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>

            {/* Inline test panel */}
            {showTest && (
                <div className="border-t border-gray-100 px-3 pb-3">
                    <LessonTestManager lesson={lesson} onRefresh={onRefresh} />
                </div>
            )}
        </div>
    )
}

// ── Main LessonManager modal ───────────────────────────────────────────────────
export default function LessonManager({ module, courseId, onClose }) {
    const qc = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [editLesson, setEditLesson] = useState(null)
    const [reordering, setReordering] = useState(false)

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['lessons', module._id],
        queryFn: () => lessonsAPI.getByModule(module._id),
    })

    const lessons = (data?.data?.lessons || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    const deleteMutation = useMutation({
        mutationFn: (id) => lessonsAPI.delete(id),
        onSuccess: () => { refetch(); toast.success('Lesson deleted') },
        onError: () => toast.error('Failed to delete'),
    })

    const toggleMutation = useMutation({
        mutationFn: (lesson) => lessonsAPI.publish(lesson._id, !lesson.is_published),
        onSuccess: () => refetch(),
        onError: () => toast.error('Failed'),
    })

    const handleReorder = async (lesson, direction) => {
        if (reordering) return
        setReordering(true)
        const idx = lessons.findIndex((l) => l._id === lesson._id)
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= lessons.length) { setReordering(false); return }
        const swap = lessons[swapIdx]
        try {
            await Promise.all([
                lessonsAPI.reorder(lesson._id, swap.order ?? swapIdx),
                lessonsAPI.reorder(swap._id, lesson.order ?? idx),
            ])
            refetch()
        } catch { toast.error('Failed to reorder') }
        finally { setReordering(false) }
    }

    const handleDelete = (lesson) => {
        if (!confirm(`Delete "${lesson.title}"?`)) return
        deleteMutation.mutate(lesson._id)
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
                        <div>
                            <h2 className="text-lg font-display font-bold text-gray-800">Lessons</h2>
                            <p className="text-xs text-gray-400 mt-0.5">{module.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
                                <Plus size={14} /> Add Lesson
                            </button>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                    </div>

                    <div className="p-5 overflow-y-auto flex-1">
                        {isLoading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                            </div>
                        ) : lessons.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                                <p className="text-sm text-gray-400 mb-3">No lessons yet</p>
                                <button onClick={() => setShowForm(true)} className="btn-primary text-sm">Add first lesson</button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {lessons.map((lesson, idx) => (
                                    <LessonRow key={lesson._id} lesson={lesson} idx={idx} total={lessons.length}
                                        onEdit={setEditLesson} onDelete={handleDelete} onReorder={handleReorder}
                                        onTogglePublish={(l) => toggleMutation.mutate(l)} reordering={reordering}
                                        onRefresh={refetch} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showForm && (
                <LessonForm moduleId={module._id} courseId={courseId}
                    onClose={() => setShowForm(false)} onSaved={refetch} />
            )}
            {editLesson && (
                <LessonForm moduleId={module._id} courseId={courseId} existing={editLesson}
                    onClose={() => setEditLesson(null)} onSaved={refetch} />
            )}
        </>
    )
}

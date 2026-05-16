// frontend/src/components/LessonAINotes/index.jsx
// Lesson-level AI notes panel. Uses lesson.transcript (not course.transcript).
// Notes are cached on the server â€” no re-generation on every open.

import { useState, useEffect, useRef } from 'react'
import { Sparkles, BookOpen, GitFork, ChevronDown, ChevronUp, Loader2, RotateCcw, CheckSquare, Download } from 'lucide-react'
import { lessonsAPI } from '../../services/api'

// â”€â”€ Mermaid loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function useMermaid() {
    const [ready, setReady] = useState(false)
    useEffect(() => {
        if (window.mermaid) { setReady(true); return }
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.6.1/mermaid.min.js'
        s.onload = () => {
            window.mermaid.initialize({ startOnLoad: false, theme: 'default' })
            setReady(true)
        }
        document.head.appendChild(s)
    }, [])
    return ready
}

function MermaidDiagram({ code }) {
    const ref = useRef(null)
    const mermaidReady = useMermaid()
    useEffect(() => {
        if (!mermaidReady || !ref.current || !code) return
        ref.current.innerHTML = ''
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.textContent = code
        ref.current.appendChild(div)
        window.mermaid.run({ nodes: [div] }).catch(() => {
            ref.current.innerHTML = `<pre class="text-xs text-gray-500 whitespace-pre-wrap p-2">${code}</pre>`
        })
    }, [mermaidReady, code])
    return <div ref={ref} className="w-full overflow-x-auto" />
}

// â”€â”€ Flashcard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Flashcard({ front, back, index }) {
    const [flipped, setFlipped] = useState(false)
    return (
        <div onClick={() => setFlipped(f => !f)} className="cursor-pointer select-none"
            style={{ perspective: '900px', height: '120px' }}>
            <div style={{
                position: 'relative', width: '100%', height: '100%',
                transformStyle: 'preserve-3d', transition: 'transform 0.4s ease',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}>
                <div className="absolute inset-0 bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center px-4 py-3"
                    style={{ backfaceVisibility: 'hidden' }}>
                    <p className="text-xs text-gray-400 mb-1.5 font-semibold tracking-wide">
                        Q{String(index + 1).padStart(2, '0')} Â· tap to reveal
                    </p>
                    <p className="text-sm text-gray-700 text-center leading-snug">{front}</p>
                </div>
                <div className="absolute inset-0 bg-brand-50 border border-brand-200 rounded-2xl flex flex-col items-center justify-center px-4 py-3"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <p className="text-xs text-brand-500 mb-1.5 font-semibold tracking-wide">ANSWER</p>
                    <p className="text-sm text-gray-700 text-center leading-snug">{back}</p>
                </div>
            </div>
        </div>
    )
}

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const normalizeList = (items) => {
    if (!Array.isArray(items)) return []
    return items
        .map((item) => {
            if (typeof item === 'string') return item
            if (typeof item?.item === 'string') return item.item
            if (typeof item?.text === 'string') return item.text
            return ''
        })
        .map((item) => item.trim())
        .filter(Boolean)
}

function downloadNotes(notes, checklistItems, lessonTitle) {
    const lines = []
    const divider = 'â”€'.repeat(60)

    lines.push(`AI STUDY NOTES â€” ${lessonTitle || 'Lesson'}`)
    lines.push(divider)
    lines.push('')

    if (notes.summary) {
        lines.push('SUMMARY')
        lines.push(divider)
        lines.push(notes.summary)
        lines.push('')
    }

    if (checklistItems?.length) {
        lines.push('ACTION CHECKLIST')
        lines.push(divider)
        checklistItems.forEach((item, i) => lines.push(`  [ ]  ${i + 1}. ${item}`))
        lines.push('')
    }

    if (notes.keyPoints?.length) {
        lines.push('KEY POINTS')
        lines.push(divider)
        notes.keyPoints.forEach((pt) => lines.push(`  â€¢ ${pt}`))
        lines.push('')
    }

    if (notes.flashcards?.length) {
        lines.push('FLASHCARDS')
        lines.push(divider)
        notes.flashcards.forEach((card, i) => {
            lines.push(`  Q${String(i + 1).padStart(2, '0')}: ${card.front}`)
            lines.push(`  A${String(i + 1).padStart(2, '0')}: ${card.back}`)
            lines.push('')
        })
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(lessonTitle || 'lesson').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_study_notes.txt`
    a.click()
    URL.revokeObjectURL(url)
}

export default function LessonAINotes({ lesson }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [notes, setNotes] = useState(lesson.ai_notes?.summary ? lesson.ai_notes : null)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('flashcards')
    const [activeDiag, setActiveDiag] = useState(0)

    const hasTranscript = lesson.transcript_status === 'ready' && lesson.transcript
    const generatedChecklist = notes ? normalizeList(notes.checklist) : []
    const fallbackChecklist = notes ? normalizeList(notes.keyPoints).map((pt) => (
        pt.match(/^(ask|confirm|explain|offer|share|book|clarify|review|practice|follow)/i) ? pt : `Review: ${pt}`
    )) : []
    const checklistItems = generatedChecklist.length ? generatedChecklist : fallbackChecklist

    const generate = async (force = false) => {
        if (!hasTranscript) return
        setLoading(true)
        setError(null)
        try {
            const res = await lessonsAPI.generateAINotes(lesson._id, force)
            setNotes(res.data.notes)
            setActiveTab('flashcards')
            setActiveDiag(0)
        } catch {
            setError('Failed to generate notes. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    // Auto-load cached notes when panel is opened
    useEffect(() => {
        if (open && !notes && !loading && hasTranscript) {
            generate(false)
        }
    }, [open]) // eslint-disable-line

    return (
        <div className="mt-6 border border-gray-200 rounded-2xl overflow-hidden">
            <button onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-brand-500" />
                    <span className="font-semibold text-gray-700 text-sm">AI Study Notes</span>
                    <span className="text-xs text-gray-400">Â· Checklist, Flashcards & Diagrams</span>
                </div>
                {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {open && (
                <div className="p-5">
                    {!notes && !loading && (
                        <div className="text-center py-4">
                            {hasTranscript ? (
                                <>
                                    <p className="text-sm text-gray-500 mb-4">
                                        Generate flashcards and diagrams from this lesson to help you study.
                                    </p>
                                    <button onClick={() => generate(false)} className="btn-primary flex items-center gap-2 mx-auto">
                                        <Sparkles size={14} /> Generate Study Notes
                                    </button>
                                </>
                            ) : (
                                <p className="text-sm text-gray-400">
                                    Study notes will be available once a transcript is added to this lesson.
                                </p>
                            )}
                            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center gap-3 py-8">
                            <Loader2 size={20} className="text-brand-500 animate-spin" />
                            <p className="text-sm text-gray-500">Generating your study notesâ€¦</p>
                        </div>
                    )}

                    {notes && (
                        <div>
                            {/* Summary */}
                            <p className="text-sm text-gray-600 leading-relaxed mb-4 bg-gray-50 rounded-xl px-4 py-3 border-l-2 border-brand-400">
                                {notes.summary}
                            </p>

                            {/* Checklist */}
                            {checklistItems.length > 0 && (
                                <div className="mb-4 bg-green-50 border border-green-100 rounded-2xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <CheckSquare size={15} className="text-green-600" />
                                        <p className="text-xs font-semibold text-green-700 tracking-wide">ACTION CHECKLIST</p>
                                    </div>
                                    <ul className="space-y-2">
                                        {checklistItems.map((item, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                                <span className="mt-0.5 w-4 h-4 rounded border border-green-300 bg-white flex-shrink-0" />
                                                <span className="leading-relaxed">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Key points */}
                            <div className="mb-4">
                                <p className="text-xs font-semibold text-gray-500 tracking-wide mb-2">KEY POINTS</p>
                                <ul className="space-y-1.5">
                                    {notes.keyPoints?.map((pt, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                            <span className="text-brand-400 font-bold mt-0.5 flex-shrink-0">Â·</span>
                                            {pt}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-2 mb-4">
                                {[
                                    { key: 'flashcards', icon: BookOpen, label: 'Flashcards' },
                                    { key: 'diagrams', icon: GitFork, label: 'Diagrams' },
                                ].map(({ key, icon: Icon, label }) => (
                                    <button key={key} onClick={() => setActiveTab(key)}
                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === key ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}>
                                        <Icon size={13} /> {label}
                                    </button>
                                ))}
                                <div className="ml-auto flex items-center gap-1">
                                    <button
                                        onClick={() => downloadNotes(notes, checklistItems, lesson.title)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-all"
                                        title="Download study notes">
                                        <Download size={13} /> Download
                                    </button>
                                    <button onClick={() => generate(true)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                                        title="Regenerate">
                                        <RotateCcw size={12} />
                                    </button>
                                </div>
                            </div>

                            {/* Flashcards */}
                            {activeTab === 'flashcards' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {notes.flashcards?.map((card, i) => (
                                        <Flashcard key={i} front={card.front} back={card.back} index={i} />
                                    ))}
                                </div>
                            )}

                            {/* Diagrams */}
                            {activeTab === 'diagrams' && notes.diagrams?.length > 0 && (
                                <div>
                                    <div className="flex gap-2 mb-3">
                                        {notes.diagrams.map((d, i) => (
                                            <button key={i} onClick={() => setActiveDiag(i)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeDiag === i ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}>
                                                {d.title}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                        <MermaidDiagram code={notes.diagrams[activeDiag]?.code} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

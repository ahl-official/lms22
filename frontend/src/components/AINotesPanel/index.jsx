import { useState, useEffect, useRef } from 'react'
import { Sparkles, BookOpen, GitFork, ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react'
import { aiAPI } from '../../services/api'

// ── Mermaid loader ────────────────────────────────────────────────
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

// ── Flashcard ─────────────────────────────────────────────────────
function Flashcard({ front, back, index }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <div
      onClick={() => setFlipped(f => !f)}
      className="cursor-pointer select-none"
      style={{ perspective: '900px', height: '120px' }}
    >
      <div
        style={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.4s ease',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center px-4 py-3"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="text-xs text-gray-400 mb-1.5 font-semibold tracking-wide">
            Q{String(index + 1).padStart(2, '0')} · tap to reveal
          </p>
          <p className="text-sm text-gray-700 text-center leading-snug">{front}</p>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 bg-brand-50 border border-brand-200 rounded-2xl flex flex-col items-center justify-center px-4 py-3"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-xs text-brand-500 mb-1.5 font-semibold tracking-wide">ANSWER</p>
          <p className="text-sm text-gray-700 text-center leading-snug">{back}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function AINotesPanel({ course }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('flashcards')
  const [activeDiag, setActiveDiag] = useState(0)

  const hasTranscript = course?.transcript_status === 'ready' && course?.transcript

  const generate = async () => {
    if (!hasTranscript) return
    setLoading(true)
    setError(null)
    setNotes(null)

    const prompt = `You are a study assistant for an LMS. Given this course transcript, generate study materials.

Course: "${course.title}"
Transcript: """${course.transcript.slice(0, 6000)}"""

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "2-3 sentence overview",
  "flashcards": [{"front": "question", "back": "answer"}],
  "diagrams": [{"title": "short title", "code": "valid mermaid code"}],
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"]
}

Rules:
- 6-8 flashcards, progressively harder
- 2 Mermaid diagrams: one flowchart TD, one mindmap
- Keep mermaid node labels under 25 chars, no quotes inside labels
- mindmap: root node must be a single bracketed word`

    try {
      const res = await aiAPI.generateNotes({
        courseTitle: course.title,
        transcript: course.transcript
      })
      setNotes(res.data.notes)
      setActiveTab('flashcards')
      setActiveDiag(0)
    } catch {
      setError('Failed to generate notes. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6 border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" />
          <span className="font-semibold text-gray-700 text-sm">AI Study Notes</span>
          <span className="text-xs text-gray-400">· Flashcards & Diagrams</span>
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
                    Generate flashcards and diagrams from this course to help you study for the assessment.
                  </p>
                  <button onClick={generate} className="btn-primary flex items-center gap-2 mx-auto">
                    <Sparkles size={14} /> Generate Study Notes
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-400">
                  Study notes will be available once the trainer adds a transcript for this course.
                </p>
              )}
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 size={20} className="text-brand-500 animate-spin" />
              <p className="text-sm text-gray-500">Generating your study notes…</p>
            </div>
          )}

          {notes && (
            <div>
              {/* Summary */}
              <p className="text-sm text-gray-600 leading-relaxed mb-4 bg-gray-50 rounded-xl px-4 py-3 border-l-2 border-brand-400">
                {notes.summary}
              </p>

              {/* Key points */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 tracking-wide mb-2">KEY POINTS</p>
                <ul className="space-y-1.5">
                  {notes.keyPoints?.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-brand-400 font-bold mt-0.5 flex-shrink-0">·</span>
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
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === key
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
                <button
                  onClick={generate}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                  title="Regenerate"
                >
                  <RotateCcw size={12} />
                </button>
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
                      <button
                        key={i}
                        onClick={() => setActiveDiag(i)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeDiag === i
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
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
import { useState, useEffect, useRef } from 'react'
import { Sparkles, BookOpen, GitFork, ChevronDown, ChevronUp, Loader2, RotateCcw, Download } from 'lucide-react'
import { aiAPI } from '../../services/api'

// â”€â”€ Mermaid loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Flashcard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            Q{String(index + 1).padStart(2, '0')} Â· tap to reveal
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

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function downloadNotes(notes, courseTitle) {
    const flashcardsHtml = (notes.flashcards || []).map((card, i) => `
        <div class="flashcard">
            <div class="flashcard-q"><span class="label">Q${String(i + 1).padStart(2, '0')}</span>${card.front}</div>
            <div class="flashcard-a"><span class="label">A</span>${card.back}</div>
        </div>`).join('')

    const keyPointsHtml = notes.keyPoints && notes.keyPoints.length ? `
        <section>
            <h2>Key Points</h2>
            <ul class="keypoints">${notes.keyPoints.map(pt => '<li>' + pt + '</li>').join('')}</ul>
        </section>` : ''

    const diagramsHtml = notes.diagrams && notes.diagrams.length ? `
        <section>
            <h2>Diagrams</h2>
            ${notes.diagrams.map(d => `
                <div class="diagram-wrap">
                    <p class="diagram-title">${d.title}</p>
                    <div class="mermaid">${d.code}</div>
                </div>`).join('')}
        </section>` : ''

    const hasDiagrams = !!(notes.diagrams && notes.diagrams.length)

    const printScript = hasDiagrams
        ? `<script>
  window.addEventListener('load', function() {
    if (window.mermaid) {
      window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
      window.mermaid.run().then(function() {
        setTimeout(function() { window.print(); }, 1000);
      }).catch(function() {
        setTimeout(function() { window.print(); }, 1000);
      });
    } else {
      setTimeout(function() { window.print(); }, 800);
    }
  });
<\/script>`
        : `<script>setTimeout(function(){ window.print(); }, 600);<\/script>`

    const mermaidScript = hasDiagrams
        ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.6.1/mermaid.min.js"><\/script>`
        : ''

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Study Notes - ${courseTitle || 'Course'}</title>
${mermaidScript}
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; color: #1a1a2e; background: #fff; padding: 40px; max-width: 800px; margin: auto; }
  header { border-bottom: 3px solid #6366f1; padding-bottom: 18px; margin-bottom: 28px; }
  header h1 { font-size: 22px; font-weight: 700; color: #6366f1; }
  header p { font-size: 12px; color: #888; margin-top: 4px; }
  section { margin-bottom: 28px; }
  h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #6366f1; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  .summary-box { background: #f5f3ff; border-left: 4px solid #6366f1; border-radius: 8px; padding: 14px 16px; font-size: 13.5px; line-height: 1.7; color: #374151; }
  .keypoints { list-style: none; }
  .keypoints li { padding: 5px 0 5px 16px; font-size: 13px; color: #374151; border-bottom: 1px dashed #f0f0f0; position: relative; line-height: 1.55; }
  .keypoints li::before { content: "•"; color: #6366f1; font-weight: 700; position: absolute; left: 0; }
  .flashcard { display: flex; flex-direction: column; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin-bottom: 10px; page-break-inside: avoid; }
  .flashcard-q { background: #fff; padding: 10px 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #e5e7eb; }
  .flashcard-a { background: #f5f3ff; padding: 10px 14px; font-size: 13px; color: #4f46e5; }
  .label { font-weight: 700; font-size: 11px; background: #6366f1; color: #fff; border-radius: 4px; padding: 1px 6px; margin-right: 8px; }
  .flashcard-a .label { background: #a5b4fc; }
  .diagram-wrap { margin-bottom: 20px; page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 16px 20px; background: #fafafa; }
  .diagram-title { font-size: 11px; font-weight: 700; color: #6366f1; margin-bottom: 14px; text-transform: uppercase; letter-spacing: .07em; }
  .mermaid { display: flex; justify-content: center; overflow: hidden; }
  footer { margin-top: 40px; font-size: 11px; color: #bbb; text-align: center; border-top: 1px solid #f0f0f0; padding-top: 14px; }
  @media print { body { padding: 20px; } @page { margin: 18mm; } }
</style>
</head>
<body>
<header>
  <h1>AI Study Notes</h1>
  <p>${courseTitle || 'Course'} &nbsp;|&nbsp; Generated by LMS AI</p>
</header>
${notes.summary ? '<section><h2>Summary</h2><div class="summary-box">' + notes.summary + '</div></section>' : ''}
${keyPointsHtml}
${flashcardsHtml ? '<section><h2>Flashcards</h2>' + flashcardsHtml + '</section>' : ''}
${diagramsHtml}
<footer>Generated on ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</footer>
${printScript}
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
}
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
          <span className="text-xs text-gray-400">Â· Flashcards & Diagrams</span>
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
              <p className="text-sm text-gray-500">Generating your study notesâ€¦</p>
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
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => downloadNotes(notes, course?.title)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-all"
                    title="Download study notes">
                    <Download size={13} /> PDF
                  </button>
                  <button
                    onClick={generate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                    title="Regenerate"
                  >
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
import { useState, useEffect, useCallback } from 'react'
import { Clock, ChevronLeft, ChevronRight, Send, AlertCircle } from 'lucide-react'

export default function TestTaker({ test, onSubmit }) {
  const [answers, setAnswers] = useState({})
  const [current, setCurrent] = useState(0)
  const [timeLeft, setTimeLeft] = useState(test.time_limit_minutes ? test.time_limit_minutes * 60 : null)
  const [submitting, setSubmitting] = useState(false)

  const questions = test.questions || []

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit(answers)
    } finally {
      setSubmitting(false)
    }
  }, [answers, onSubmit, submitting])

  useEffect(() => {
    if (!timeLeft) return
    if (timeLeft === 0) { handleSubmit(); return }
    const t = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(t)
  }, [timeLeft, handleSubmit])

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const q = questions[current]
  const answered = Object.keys(answers).length
  const progress = (answered / questions.length) * 100

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-gray-800">{test.title}</h2>
        {timeLeft !== null && (
          <div className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-xl ${
            timeLeft < 60 ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'
          }`}>
            <Clock size={14} /> {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{answered} of {questions.length} answered</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Question dots */}
      <div className="flex flex-wrap gap-2 mb-6">
        {questions.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
              i === current ? 'bg-brand-500 text-white' :
              answers[i] !== undefined ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >{i + 1}</button>
        ))}
      </div>

      {/* Question */}
      {q && (
        <div className="mb-8">
          <p className="font-semibold text-gray-800 mb-4">
            <span className="text-brand-500 mr-2">Q{current + 1}.</span>
            {q.question}
          </p>

          {q.type === 'mcq' && q.options?.length > 0 ? (
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <button key={oi} onClick={() => setAnswers(a => ({ ...a, [current]: opt }))}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    answers[current] === opt
                      ? 'border-brand-400 bg-brand-50 text-brand-700'
                      : 'border-gray-200 hover:border-brand-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-bold mr-2 text-gray-400">{String.fromCharCode(65 + oi)}.</span>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              className="input-field min-h-[120px] resize-none"
              placeholder="Type your answer here..."
              value={answers[current] || ''}
              onChange={e => setAnswers(a => ({ ...a, [current]: e.target.value }))}
            />
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button disabled={current === 0} onClick={() => setCurrent(c => c - 1)}
          className="btn-secondary flex items-center gap-1 disabled:opacity-40">
          <ChevronLeft size={16} /> Prev
        </button>

        {current < questions.length - 1 ? (
          <button onClick={() => setCurrent(c => c + 1)} className="btn-primary flex items-center gap-1 ml-auto">
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex items-center gap-2 ml-auto">
            {submitting
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Send size={15} />
            }
            {submitting ? 'Submitting...' : 'Submit Test'}
          </button>
        )}
      </div>

      {answered < questions.length && current === questions.length - 1 && (
        <div className="mt-3 flex items-center gap-2 text-amber-600 text-xs">
          <AlertCircle size={13} />
          {questions.length - answered} question{questions.length - answered !== 1 ? 's' : ''} unanswered
        </div>
      )}
    </div>
  )
}

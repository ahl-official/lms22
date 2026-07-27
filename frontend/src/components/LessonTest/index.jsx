// frontend/src/components/LessonTest/index.jsx
// FIX: InlineQuiz short_answer was marking any non-empty answer as correct.
// Now uses keyword-overlap scoring matching the backend logic.

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Mic, Lock, CheckCircle, XCircle, Award } from 'lucide-react'
import TestTaker from '../TestTaker'
import { attemptsAPI } from '../../services/api'
import toast from 'react-hot-toast'

// ── Short-answer scorer (mirrors backend scoreShortAnswer) ────────────────────
const STOP = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'for', 'are', 'was', 'have',
    'been', 'will', 'its', 'our', 'their', 'they', 'which', 'what', 'when',
    'where', 'how', 'can', 'not', 'but', 'all', 'any', 'about', 'into', 'over',
    'also', 'more', 'than', 'just', 'such', 'your', 'each', 'these', 'those',
    'some', 'would', 'should', 'could', 'both', 'while', 'after', 'before',
    'make', 'made', 'must', 'very', 'well', 'even', 'now', 'many', 'most',
    'does', 'then', 'here', 'there', 'use',
])

const kw = (text) =>
    (text || '').toLowerCase().split(/[\s,;:.!?'"()\[\]]+/).filter(w => w.length > 3 && !STOP.has(w))

const scoreInlineShortAnswer = (userAns, correctAns) => {
    const trimmed = (userAns || '').trim()
    if (trimmed.length < 3) return false
    const ul = trimmed.toLowerCase()
    const cl = (correctAns || '').toLowerCase()
    if (cl && ul === cl) return true
    const expected = kw(correctAns)
    if (!expected.length) return trimmed.split(/\s+/).length >= 3
    const userSet = new Set(kw(userAns))
    const matched = expected.filter(k => userSet.has(k) || ul.includes(k))
    return matched.length / expected.length >= 0.4
}

// ── Inline quiz (quiz_questions — no attempt tracking) ────────────────────────
function InlineQuiz({ lesson, onPass }) {
    const [answers, setAnswers] = useState({})
    const [submitted, setSubmitted] = useState(false)
    const [score, setScore] = useState(null)
    const [results, setResults] = useState([])

    if (lesson.is_completed) {
        return (
            <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle size={28} className="text-green-500" />
                </div>
                <p className="font-semibold text-gray-800">Quiz completed!</p>
                {lesson.lesson_score != null && (
                    <p className="text-sm text-gray-500 mt-1">Your score: <strong>{lesson.lesson_score}%</strong></p>
                )}
            </div>
        )
    }

    const questions = lesson.quiz_questions || []
    const passing = lesson.quiz_passing_score || 60

    const handleSubmit = () => {
        if (Object.keys(answers).length < questions.length)
            return toast.error('Please answer all questions first')

        let correct = 0
        const breakdown = questions.map((q, i) => {
            // FIX: short_answer now uses keyword-overlap scoring, not "non-empty = pass"
            const ok = q.type === 'mcq'
                ? answers[i] === q.correct_answer
                : scoreInlineShortAnswer(answers[i] || '', q.correct_answer || '')
            if (ok) correct++
            return { ...q, user_answer: answers[i], is_correct: ok }
        })

        const pct = Math.round((correct / questions.length) * 100)
        setScore(pct)
        setResults(breakdown)
        setSubmitted(true)
        if (pct >= passing) onPass(pct)
    }

    if (submitted) {
        const passed = score >= passing
        return (
            <div className="space-y-4">
                <div className={`rounded-2xl p-5 text-center border-2 ${passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <p className={`text-4xl font-display font-bold mb-2 ${passed ? 'text-green-600' : 'text-red-500'}`}>{score}%</p>
                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {passed ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {passed ? 'Passed — lesson complete!' : `Need ${passing}% to pass`}
                    </span>
                </div>

                {/* Show answer breakdown */}
                {results.length > 0 && (
                    <div className="space-y-2">
                        {results.map((q, i) => (
                            <div key={i} className={`p-3 rounded-xl border ${q.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                <div className="flex items-start gap-2">
                                    {q.is_correct
                                        ? <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                                        : <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                                    }
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-700 truncate">{q.question}</p>
                                        <p className={`text-xs mt-0.5 ${q.is_correct ? 'text-green-700' : 'text-red-700'}`}>
                                            Your answer: <strong>{q.user_answer || '(blank)'}</strong>
                                        </p>
                                        {!q.is_correct && q.correct_answer && (
                                            <p className="text-xs text-green-700 mt-0.5">
                                                Expected: <strong>{q.correct_answer}</strong>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!passed && (
                    <button
                        onClick={() => { setAnswers({}); setSubmitted(false); setScore(null); setResults([]) }}
                        className="btn-secondary w-full"
                    >
                        Try Again
                    </button>
                )}
            </div>
        )
    }

    if (!questions.length) return (
        <div className="text-center py-8 text-gray-400">
            <ClipboardList size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No questions added yet</p>
        </div>
    )

    return (
        <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Award size={14} className="text-amber-500" />
                {questions.length} question{questions.length !== 1 ? 's' : ''} · Pass: {passing}%
            </p>
            {questions.map((q, i) => (
                <div key={i} className="card space-y-3">
                    <p className="text-sm font-medium text-gray-800">
                        <span className="inline-flex w-6 h-6 rounded-lg bg-brand-100 text-brand-600 text-xs font-bold items-center justify-center mr-2">
                            {i + 1}
                        </span>
                        {q.question}
                    </p>
                    {q.type === 'mcq' ? (
                        <div className="space-y-2 pl-8">
                            {(q.options || []).map((opt, oi) => (
                                <label key={oi} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-colors ${answers[i] === opt ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200'
                                    }`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${answers[i] === opt ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                                        }`}>
                                        {answers[i] === opt && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                    <input type="radio" name={`q-${i}`} value={opt} className="hidden"
                                        checked={answers[i] === opt}
                                        onChange={() => setAnswers(a => ({ ...a, [i]: opt }))} />
                                    <span className="text-sm text-gray-700">{opt}</span>
                                </label>
                            ))}
                        </div>
                    ) : (
                        <div className="pl-8">
                            <textarea
                                className="input-field resize-none min-h-[80px] text-sm w-full"
                                placeholder="Type your answer…"
                                value={answers[i] || ''}
                                onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                            />
                            {q.correct_answer && (
                                <p className="text-xs text-gray-400 mt-1">
                                    Tip: make sure your answer covers the key concepts
                                </p>
                            )}
                        </div>
                    )}
                </div>
            ))}
            <button onClick={handleSubmit} className="btn-primary w-full flex items-center justify-center gap-2">
                <ClipboardList size={15} /> Submit Quiz
            </button>
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LessonTestPanel({ lesson, onComplete, locked = false, rolePlayProgress, rolePlayLoading = false }) {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [submitting, setSubmitting] = useState(false)
    const [voiceLanguage, setVoiceLanguage] = useState('en')

    const linkedTest = lesson.test_id
    const hasLinkedTest = !!linkedTest && linkedTest.is_active !== false
    const hasInlineQuiz = (lesson.quiz_questions?.length || 0) > 0
    const priorAttempt = lesson.assessment_attempt

    if (!hasLinkedTest && !hasInlineQuiz) {
        return (
            <div className="text-center py-10 text-gray-400">
                <ClipboardList size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No assessment for this lesson</p>
            </div>
        )
    }

    if (linkedTest && !linkedTest.is_active) {
        return (
            <div className="text-center py-8 text-gray-400">
                <Lock size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Assessment pending approval</p>
                <p className="text-xs mt-1">Your trainer is reviewing this test</p>
            </div>
        )
    }

    if (locked) {
        const attemptsRemaining = rolePlayProgress?.attempts_remaining ?? 10
        const exhausted = rolePlayProgress?.exhausted
        const threshold = rolePlayProgress?.threshold ?? 70

        return (
            <div className="text-center py-10">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <Lock size={28} className="text-gray-400" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2">Assessment locked</h2>
                <p className="text-gray-500 text-sm max-w-sm mx-auto">
                    {rolePlayLoading
                        ? 'Checking role playing score...'
                        : exhausted
                            ? 'Contact trainer to unlock test as failed 10 times.'
                            : `Score ${threshold}% in Role Playing to unlock this assessment. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} left.`}
                </p>
            </div>
        )
    }

    const handleWrittenSubmit = async (answers) => {
        setSubmitting(true)
        try {
            const res = await attemptsAPI.submitWritten({
                test_id: linkedTest._id,
                course_id: lesson.course_id,
                answers,
            })
            toast.success('Test submitted!')
            qc.invalidateQueries({ queryKey: ['course-lessons', lesson.course_id] })
            qc.invalidateQueries({ queryKey: ['modules', lesson.course_id] })
            qc.invalidateQueries({ queryKey: ['my-enrollments'] })
            navigate(`/trainee/results/${res.data.attempt._id}`)
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit')
        } finally {
            setSubmitting(false)
        }
    }

    const AssessmentStatus = () => priorAttempt ? (
        <div className={`mb-5 rounded-2xl border p-4 ${priorAttempt.passed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className={`text-sm font-semibold ${priorAttempt.passed ? 'text-green-800' : 'text-amber-800'}`}>
                        Previous assessment score: {Math.round(priorAttempt.latest_score)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        Best score: {Math.round(priorAttempt.best_score)}% · Attempts: {priorAttempt.attempts_used}/{priorAttempt.max_attempts}
                    </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${priorAttempt.passed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {priorAttempt.passed ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {priorAttempt.passed ? 'Completed' : 'Needs work'}
                </span>
            </div>
            {priorAttempt.attempts_remaining > 0 && (
                <p className="text-xs text-gray-500 mt-2">You can retake this assessment if you want to improve the score.</p>
            )}
        </div>
    ) : null

    if (hasLinkedTest && linkedTest.test_type === 'voice') {
        return (
            <div className="card text-center py-12">
                <AssessmentStatus />
                <div className="w-16 h-16 rounded-2xl bg-coral-50 flex items-center justify-center mx-auto mb-4">
                    <Mic size={26} className="text-coral-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Voice Assessment</h2>
                <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                    The AI will speak each question out loud and listen to your verbal responses.
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
                <button
                    onClick={() => navigate(`/voice-test/${lesson.course_id}?lesson_id=${lesson._id}&language=${voiceLanguage}`)}
                    disabled={priorAttempt?.attempts_remaining === 0}
                    className="btn-primary flex items-center gap-2 mx-auto"
                >
                    <Mic size={15} /> {priorAttempt ? 'Retake Voice Test' : 'Start Voice Test'}
                </button>
                {priorAttempt?.attempts_remaining === 0 && (
                    <p className="text-xs text-red-500 mt-3">Maximum attempts reached.</p>
                )}
            </div>
        )
    }

    if (hasLinkedTest) {
        return (
            <div>
                <AssessmentStatus />
                {priorAttempt?.attempts_remaining === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <Lock size={30} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Maximum attempts reached.</p>
                    </div>
                ) : (
                    <TestTaker test={linkedTest} onSubmit={handleWrittenSubmit} />
                )}
            </div>
        )
    }

    return <InlineQuiz lesson={lesson} onPass={(score) => onComplete(score)} />
}

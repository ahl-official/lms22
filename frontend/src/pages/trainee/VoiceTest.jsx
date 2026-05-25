import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { voiceTestAPI } from '../../services/api'
import useVoiceSpeech from '../../hooks/useVoiceSpeech'
import {
    Mic, Volume2, CheckCircle, AlertCircle,
    ArrowRight, Loader2, MessageSquare, Award, Clock,
    ThumbsUp, ThumbsDown, Minus
} from 'lucide-react'
import toast from 'react-hot-toast'

const THINK_SECONDS = 5

function Waveform({ active }) {
    return (
        <div className="flex items-center gap-1 h-10">
            {[...Array(7)].map((_, i) => (
                <div key={i} className={`w-1.5 rounded-full ${active ? 'bg-brand-500' : 'bg-gray-300'}`}
                    style={{
                        height: active ? `${16 + (i % 3) * 8}px` : '8px',
                        animation: active ? `wave 0.8s ease-in-out ${i * 0.1}s infinite alternate` : 'none',
                    }} />
            ))}
            <style>{`@keyframes wave{from{height:8px}to{height:32px}}`}</style>
        </div>
    )
}

const feedbackTierFromScore = (score, fallbackTier = 'constructive') => {
    const numeric = Number(score)
    if (Number.isFinite(numeric)) {
        if (numeric >= 8) return 'positive'
        if (numeric >= 5) return 'constructive'
        return 'corrective'
    }
    return fallbackTier || 'constructive'
}

function FeedbackBadge({ tier, score }) {
    const displayTier = feedbackTierFromScore(score, tier)
    if (displayTier === 'positive') return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
            <ThumbsUp size={11} /> Excellent
        </span>
    )
    if (displayTier === 'corrective') return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
            <ThumbsDown size={11} /> Needs Work
        </span>
    )
    return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
            <Minus size={11} /> Good Try
        </span>
    )
}

function ResultScreen({ result, courseTitle, conversation, onDone }) {
    const score = result?.score || 0
    const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-amber-500' : 'text-red-500'
    const bg = score >= 80 ? 'bg-green-50' : score >= 60 ? 'bg-amber-50' : 'bg-red-50'

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-2xl">
                <div className="text-center mb-8">
                    <div className={`w-20 h-20 rounded-full ${bg} flex items-center justify-center mx-auto mb-4`}>
                        <Award size={36} className={color} />
                    </div>
                    <h2 className="text-2xl font-display font-bold text-gray-800">Assessment Complete!</h2>
                    <p className="text-gray-500 mt-1">{courseTitle}</p>
                </div>

                <div className={`rounded-2xl ${bg} p-6 text-center mb-6`}>
                    <p className={`text-5xl font-display font-bold ${color}`}>{score}%</p>
                    <p className="text-sm text-gray-600 mt-1">Overall Score</p>
                </div>

                {result?.rubric_breakdown && (
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        {Object.entries(result.rubric_breakdown).map(([key, val]) => (
                            <div key={key} className="bg-gray-50 rounded-xl p-3">
                                <p className="text-xs text-gray-500 capitalize mb-1">{key.replace(/_/g, ' ')}</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${val}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-gray-700">{val}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {result?.feedback && (
                    <div className="bg-brand-50 rounded-2xl p-4 mb-6">
                        <p className="text-sm font-semibold text-brand-700 mb-1">Overall Feedback</p>
                        <p className="text-sm text-gray-700">{result.feedback}</p>
                    </div>
                )}

                {conversation.length > 0 && (
                    <div className="space-y-3 mb-6">
                        <p className="text-sm font-semibold text-gray-700">Question Breakdown</p>
                        {conversation.map((turn, i) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-3">
                                <p className="text-xs font-semibold text-gray-600 mb-1">Q{i + 1}: {turn.question}</p>
                                <p className="text-xs text-gray-500 italic mb-2">Your answer: "{turn.answer}"</p>
                                {turn.evaluation && (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <FeedbackBadge tier={turn.evaluation.feedback_tier} score={turn.evaluation.overall_score} />
                                            {turn.evaluation.overall_score != null && (
                                                <span className="text-xs font-bold text-gray-600">
                                                    {Math.round(turn.evaluation.overall_score * 10) / 10}/10
                                                </span>
                                            )}
                                        </div>
                                        {turn.evaluation.feedback && (
                                            <p className="text-xs text-gray-600 mt-1">{turn.evaluation.feedback}</p>
                                        )}
                                        {turn.evaluation.what_correct && (
                                            <p className="text-xs text-green-700">✓ {turn.evaluation.what_correct}</p>
                                        )}
                                        {turn.evaluation.what_missed && (
                                            <p className="text-xs text-amber-700">△ {turn.evaluation.what_missed}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <button onClick={onDone} className="btn-primary w-full">Back to Courses</button>
            </div>
        </div>
    )
}

export default function VoiceTest() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const lessonId = searchParams.get('lesson_id')
    const { speak, startListening, stopListening, getTranscript, isListening, isSpeaking, liveTranscript, supported } = useVoiceSpeech()

    const [phase, setPhase] = useState('loading')
    const [countdown, setCountdown] = useState(THINK_SECONDS)
    const [currentQ, setCurrentQ] = useState(0)
    const [questions, setQuestions] = useState([])
    const [conversation, setConversation] = useState([])
    const [courseTitle, setCourseTitle] = useState('')
    const [testId, setTestId] = useState(null)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [currentFeedback, setCurrentFeedback] = useState(null)
    const [currentAnswer, setCurrentAnswer] = useState('')

    const questionsRef = useRef([])
    const currentQRef = useRef(0)
    const conversationRef = useRef([])
    const testIdRef = useRef(null)
    const isProcessingRef = useRef(false)
    const countdownTimerRef = useRef(null)
    const onSilenceRef = useRef(null)
    const liveRef = useRef('')
    const speakRef = useRef(speak)
    const startCountdownRef = useRef(null)

    useEffect(() => { liveRef.current = liveTranscript }, [liveTranscript])
    useEffect(() => { currentQRef.current = currentQ }, [currentQ])
    useEffect(() => { conversationRef.current = conversation }, [conversation])
    useEffect(() => { testIdRef.current = testId }, [testId])
    useEffect(() => { questionsRef.current = questions }, [questions])
    useEffect(() => { speakRef.current = speak }, [speak])
    useEffect(() => () => clearInterval(countdownTimerRef.current), [])

    const settleCapturedAnswer = useCallback(async (candidate, reason) => {
        await new Promise(resolve => setTimeout(resolve, 250))
        const captured = getTranscript() || liveRef.current || candidate || ''
        console.log('[voice-test:settled_capture]', {
            questionIndex: currentQRef.current,
            reason,
            candidateLength: candidate?.length || 0,
            liveLength: liveRef.current?.length || 0,
            capturedLength: captured.length,
            preview: captured.slice(0, 160),
        })
        return captured
    }, [getTranscript])

    useEffect(() => {
        const init = async () => {
            try {
                const res = await voiceTestAPI.start(courseId, lessonId)
                const { test_id, course_title, fallback_questions } = res.data
                setCourseTitle(course_title)
                setTestId(test_id)
                testIdRef.current = test_id
                const qs = (fallback_questions || []).map(q =>
                    typeof q === 'string'
                        ? { question: q, expected_answer: '', key_points: [], is_objection: false }
                        : q
                )
                setQuestions(qs)
                questionsRef.current = qs
                setPhase('intro')
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to start test')
                setPhase('error')
            }
        }
        init()
    }, [courseId, lessonId])

    const startCountdownThenListen = useCallback((silenceCallback) => {
        clearInterval(countdownTimerRef.current)
        setCountdown(THINK_SECONDS)
        setPhase('countdown')
        let remaining = THINK_SECONDS
        countdownTimerRef.current = setInterval(() => {
            remaining -= 1
            setCountdown(remaining)
            if (remaining <= 0) {
                clearInterval(countdownTimerRef.current)
                setPhase('listening')
                onSilenceRef.current = silenceCallback
                console.log('[voice-test:listening_opened]', {
                    questionIndex: currentQRef.current,
                    reason: 'countdown_complete',
                })
                startListening((transcript) => {
                    const cb = onSilenceRef.current
                    onSilenceRef.current = null
                    if (cb) cb(transcript || liveRef.current)
                })
            }
        }, 1000)
    }, [startListening])

    useEffect(() => { startCountdownRef.current = startCountdownThenListen }, [startCountdownThenListen])

    const askQuestion = useCallback((qIndex) => {
        const qs = questionsRef.current
        const questionObj = qs[qIndex]
        if (!questionObj) return
        const questionText = questionObj.question || questionObj.question_text || ''
        setPhase('speaking')
        speakRef.current(questionText, () => {
            startCountdownRef.current(async (transcript) => {
                const captured = await settleCapturedAnswer(transcript, 'auto_silence')
                console.log('[voice-test:auto_capture]', {
                    questionIndex: qIndex,
                    length: captured?.length || 0,
                    preview: captured?.slice?.(0, 120) || '',
                })
                processAnswerRef.current(captured)
            })
        })
    }, [settleCapturedAnswer])

    const askQuestionRef = useRef(askQuestion)
    useEffect(() => { askQuestionRef.current = askQuestion }, [askQuestion])

    const processAnswer = useCallback(async (answer) => {
        if (isProcessingRef.current) return
        isProcessingRef.current = true

        const qIndex = currentQRef.current
        const qs = questionsRef.current
        const questionObj = qs[qIndex] || {}
        const questionText = questionObj.question || questionObj.question_text || ''
        const finalAnswer = answer || '(no response)'

        console.log('[voice-test:process_answer]', {
            questionIndex: qIndex,
            phase,
            answerLength: finalAnswer.length,
            isNoResponse: finalAnswer === '(no response)',
            preview: finalAnswer.slice(0, 160),
        })

        setCurrentAnswer(finalAnswer)
        setPhase('evaluating')

        let evaluation = null
        try {
            const evalRes = await voiceTestAPI.evaluateAnswer({
                course_id: courseId,
                question: questionObj,
                user_answer: finalAnswer,
            })
            evaluation = evalRes.data.evaluation
        } catch (err) {
            console.warn('[voice-test:evaluation_failed]', {
                message: err.message,
                status: err.response?.status,
                response: err.response?.data,
            })
        }

        setCurrentFeedback(evaluation)
        setPhase('feedback')

        const turn = { question: questionText, answer: finalAnswer, evaluation }
        const newConversation = [...conversationRef.current, turn]
        setConversation(newConversation)
        conversationRef.current = newConversation

        const feedbackText = evaluation?.spoken_feedback || null
        if (feedbackText) {
            await new Promise(resolve => speakRef.current(feedbackText, resolve))
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        const nextQ = qIndex + 1

        if (nextQ >= qs.length) {
            setPhase('thinking')
            try {
                const res = await voiceTestAPI.score({
                    course_id: courseId,
                    conversation: newConversation,
                    test_id: testIdRef.current,
                    lesson_id: lessonId,
                })
                setResult(res.data.result)
                setPhase('done')
            } catch (err) {
                console.error('[voice-test:score_failed]', {
                    message: err.message,
                    status: err.response?.status,
                    response: err.response?.data,
                })
                toast.error('Scoring failed — please try again')
                setPhase('listening')
            }
            isProcessingRef.current = false
            return
        }

        setCurrentQ(nextQ)
        currentQRef.current = nextQ
        setCurrentFeedback(null)
        setCurrentAnswer('')
        askQuestionRef.current(nextQ)
        isProcessingRef.current = false
    }, [courseId, lessonId, phase])

    const processAnswerRef = useRef(processAnswer)
    useEffect(() => { processAnswerRef.current = processAnswer }, [processAnswer])

    const beginTest = useCallback(() => askQuestionRef.current(0), [])

    const handleAnswerCountdown = useCallback(() => {
        if (isProcessingRef.current) return
        clearInterval(countdownTimerRef.current)
        setPhase('listening')
        onSilenceRef.current = async (transcript) => {
            const captured = await settleCapturedAnswer(transcript, 'manual_countdown_silence')
            console.log('[voice-test:manual_countdown_capture]', {
                questionIndex: currentQRef.current,
                length: captured?.length || 0,
                preview: captured?.slice?.(0, 120) || '',
            })
            processAnswerRef.current(captured)
        }
        console.log('[voice-test:listening_opened]', {
            questionIndex: currentQRef.current,
            reason: 'answer_button',
        })
        startListening((transcript) => {
            const cb = onSilenceRef.current
            onSilenceRef.current = null
            if (cb) cb(transcript || liveRef.current)
        })
    }, [settleCapturedAnswer, startListening])

    const handleDoneAnswering = useCallback(async () => {
        if (isProcessingRef.current) return
        clearInterval(countdownTimerRef.current)
        const stoppedTranscript = stopListening()
        const captured = await settleCapturedAnswer(stoppedTranscript, 'done_button')
        console.log('[voice-test:done_capture]', {
            questionIndex: currentQRef.current,
            length: captured?.length || 0,
            preview: captured?.slice?.(0, 120) || '',
        })
        processAnswerRef.current(captured)
    }, [settleCapturedAnswer, stopListening])

    const totalQuestions = questions.length || 5
    const currentQuestionObj = questions[currentQ] || {}
    const currentQuestionText = currentQuestionObj.question || currentQuestionObj.question_text || ''

    if (!supported) return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md text-center">
                <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
                <h2 className="font-bold text-gray-800 text-lg mb-2">Browser Not Supported</h2>
                <p className="text-gray-500 text-sm">Voice tests require Chrome or Edge.</p>
            </div>
        </div>
    )

    if (phase === 'loading') return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500">Preparing your assessment…</p>
            </div>
        </div>
    )

    if (phase === 'error') return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md text-center">
                <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
                <h2 className="font-bold text-gray-800 mb-2">Cannot Start Test</h2>
                <p className="text-gray-500 text-sm mb-4">{error}</p>
                <button onClick={() => navigate(-1)} className="btn-secondary">Go Back</button>
            </div>
        </div>
    )

    if (phase === 'done' && result) return (
        <ResultScreen result={result} courseTitle={courseTitle} conversation={conversation} onDone={() => navigate('/trainee')} />
    )

    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-6">
            <div className="w-full max-w-lg space-y-4">

                <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-brand-500 flex items-center justify-center mx-auto mb-3">
                        <Mic size={26} className="text-white" />
                    </div>
                    <h1 className="text-xl font-display font-bold text-gray-800">{courseTitle}</h1>
                    <p className="text-sm text-gray-500 mt-1">Voice Assessment</p>
                </div>

                {phase !== 'intro' && (
                    <>
                        <div className="flex items-center gap-2">
                            {[...Array(totalQuestions)].map((_, i) => (
                                <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${i < currentQ ? 'bg-brand-500' : i === currentQ ? 'bg-brand-300' : 'bg-gray-200'}`} />
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 text-center">Question {Math.min(currentQ + 1, totalQuestions)} of {totalQuestions}</p>
                    </>
                )}

                {phase === 'intro' && (
                    <div className="bg-white rounded-3xl shadow-card p-8 text-center">
                        <Volume2 size={32} className="mx-auto text-brand-500 mb-4" />
                        <h2 className="font-bold text-gray-800 text-lg mb-3">Ready to Begin?</h2>
                        <div className="text-sm text-gray-500 space-y-2 mb-6 text-left bg-gray-50 rounded-2xl p-4">
                            <p>🎤 The AI will speak each question out loud</p>
                            <p>⏱️ You get <strong>{THINK_SECONDS} seconds</strong> to think before the mic opens</p>
                            <p>💬 Speak your answer, then wait 3s or press Done</p>
                            <p>⚡ You get <strong>instant feedback</strong> after every answer</p>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">{totalQuestions} questions · Voice assessment</p>
                        <button onClick={beginTest} className="btn-primary w-full flex items-center justify-center gap-2">
                            <ArrowRight size={16} /> Start Assessment
                        </button>
                    </div>
                )}

                {phase === 'speaking' && (
                    <div className="bg-brand-50 rounded-3xl shadow-card p-5 border-2 border-brand-200">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                                <Volume2 size={18} className="text-white" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-brand-600 mb-1">Question {currentQ + 1} of {totalQuestions}</p>
                                <p className="text-sm text-gray-800 font-medium leading-relaxed">{currentQuestionText}</p>
                            </div>
                        </div>
                    </div>
                )}

                {phase === 'countdown' && (
                    <div className="bg-amber-50 rounded-3xl shadow-card p-5 border-2 border-amber-200">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-2xl font-bold text-amber-600">{countdown}</span>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                                    <Clock size={14} /> Take a moment to think…
                                </p>
                                <p className="text-xs text-amber-600 mt-0.5">Mic opens in {countdown}s</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl p-3 mb-3">
                            <p className="text-sm text-gray-700">{currentQuestionText}</p>
                        </div>
                        <button onClick={handleAnswerCountdown}
                            className="w-full py-2 rounded-2xl border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                            Answer
                        </button>
                    </div>
                )}

                {phase === 'listening' && (
                    <div className="bg-white rounded-3xl shadow-card p-5 border-2 border-green-200">
                        <div className="bg-brand-50 rounded-2xl p-3 mb-4">
                            <p className="text-xs text-brand-600 font-semibold mb-1">Question {currentQ + 1}</p>
                            <p className="text-sm text-gray-700">{currentQuestionText}</p>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                                <Mic size={16} className="text-white" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-semibold text-green-700">Listening…</p>
                                <p className="text-xs text-green-600">Auto-stops after 3s silence</p>
                            </div>
                            <Waveform active={true} />
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-3 min-h-[60px] mb-3">
                            <p className="text-sm text-gray-700 leading-relaxed">
                                {liveTranscript || <span className="text-gray-300 italic">Start speaking…</span>}
                            </p>
                        </div>
                        <button onClick={handleDoneAnswering}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors">
                            <CheckCircle size={16} /> Done Answering
                        </button>
                    </div>
                )}

                {phase === 'evaluating' && (
                    <div className="bg-white rounded-3xl shadow-card p-5 border-2 border-gray-100">
                        <div className="flex items-center gap-3">
                            <Loader2 size={20} className="text-brand-500 animate-spin flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-gray-700">Evaluating your answer…</p>
                                {currentAnswer && <p className="text-xs text-gray-400 mt-0.5 italic">"{currentAnswer.slice(0, 80)}{currentAnswer.length > 80 ? '…' : ''}"</p>}
                            </div>
                        </div>
                    </div>
                )}

                {phase === 'feedback' && currentFeedback && (
                    <div className={`rounded-3xl shadow-card p-5 border-2 ${feedbackTierFromScore(currentFeedback.overall_score, currentFeedback.feedback_tier) === 'positive' ? 'bg-green-50 border-green-200'
                            : feedbackTierFromScore(currentFeedback.overall_score, currentFeedback.feedback_tier) === 'corrective' ? 'bg-red-50 border-red-200'
                                : 'bg-amber-50 border-amber-200'
                        }`}>
                        <div className="flex items-center gap-2 mb-3">
                            <Volume2 size={15} className="text-gray-500 animate-pulse" />
                            <p className="text-xs font-semibold text-gray-600">AI Feedback</p>
                            <FeedbackBadge tier={currentFeedback.feedback_tier} score={currentFeedback.overall_score} />
                            {currentFeedback.overall_score != null && (
                                <span className="ml-auto text-sm font-bold text-gray-700">
                                    {Math.round(currentFeedback.overall_score * 10) / 10}/10
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed mb-2">
                            {currentFeedback.feedback || currentFeedback.spoken_feedback}
                        </p>
                        {currentFeedback.what_correct && (
                            <p className="text-xs text-green-700 bg-green-100 rounded-xl px-3 py-1.5 mb-1">✓ {currentFeedback.what_correct}</p>
                        )}
                        {currentFeedback.what_missed && (
                            <p className="text-xs text-amber-700 bg-amber-100 rounded-xl px-3 py-1.5">△ {currentFeedback.what_missed}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-3 text-center animate-pulse">Preparing next question…</p>
                    </div>
                )}

                {phase === 'thinking' && (
                    <div className="bg-brand-50 rounded-3xl shadow-card p-5 border-2 border-brand-200">
                        <div className="flex items-center gap-4">
                            <Loader2 size={22} className="text-brand-500 animate-spin flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-brand-700">Generating your report…</p>
                                <p className="text-xs text-brand-600 mt-0.5">Analysing all your answers</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

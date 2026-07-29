import { useState, useRef, useEffect, useCallback } from 'react'
import {
    Mic, RefreshCw, Award, Loader2, Users, Target,
    Trophy, RotateCcw, Star, AlertCircle, Square, Lock,
    Volume2, CheckCircle, MessageSquare,
} from 'lucide-react'
import { rolePlayAPI } from '../../services/api'
import useVoiceRecorder from '../../hooks/useVoiceRecorder'
import toast from 'react-hot-toast'

const MAX_ROLEPLAY_QUESTIONS = 5

const ROLEPLAY_UI_LABELS = {
    sales: {
        counterpart: 'Customer',
        personaTitle: 'Choose a customer persona',
        questionTitle: 'Customer question',
        minAnswersToast: 'Answer at least 2 customer questions before scoring',
        historyFallback: 'Customer question',
    },
    technical_service: {
        counterpart: 'Client',
        personaTitle: 'Choose a client persona',
        questionTitle: 'Client question',
        minAnswersToast: 'Answer at least 2 client questions before scoring',
        historyFallback: 'Client question',
    },
    content: {
        counterpart: 'Stakeholder',
        personaTitle: 'Choose a stakeholder persona',
        questionTitle: 'Stakeholder question',
        minAnswersToast: 'Answer at least 2 stakeholder questions before scoring',
        historyFallback: 'Stakeholder question',
    },
    support: {
        counterpart: 'Customer',
        personaTitle: 'Choose a customer persona',
        questionTitle: 'Customer question',
        minAnswersToast: 'Answer at least 2 customer questions before scoring',
        historyFallback: 'Customer question',
    },
    internal: {
        counterpart: 'Colleague',
        personaTitle: 'Choose a workplace persona',
        questionTitle: 'Colleague question',
        minAnswersToast: 'Answer at least 2 colleague questions before scoring',
        historyFallback: 'Colleague question',
    },
    auto: {
        counterpart: 'Counterpart',
        personaTitle: 'Choose a persona',
        questionTitle: 'Their question',
        minAnswersToast: 'Answer at least 2 questions before scoring',
        historyFallback: 'Question',
    },
}

const getRolePlayUiLabels = (roleplayType) =>
    ROLEPLAY_UI_LABELS[roleplayType] || ROLEPLAY_UI_LABELS.auto

const speak = (text) => new Promise(resolve => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return resolve()
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1
    utterance.onend = resolve
    utterance.onerror = resolve
    window.speechSynthesis.speak(utterance)
})

function ProgressDots({ count }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                {[...Array(MAX_ROLEPLAY_QUESTIONS)].map((_, i) => (
                    <div
                        key={i}
                        className={`flex-1 h-1.5 rounded-full transition-colors ${i < count ? 'bg-brand-500' : i === count ? 'bg-brand-300' : 'bg-gray-200'}`}
                    />
                ))}
            </div>
            <p className="text-xs text-gray-400 text-center">
                Question {Math.min(count + 1, MAX_ROLEPLAY_QUESTIONS)} of {MAX_ROLEPLAY_QUESTIONS}
            </p>
        </div>
    )
}

function VoiceInput({ onSubmit, disabled }) {
    const { state, formattedDuration, audioBlob, audioUrl, isRecording, isStopped, startRecording, stopRecording, reset, STATES } = useVoiceRecorder()
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!audioBlob || submitting) return
        setSubmitting(true)
        try {
            await onSubmit(audioBlob)
            reset()
        } finally {
            setSubmitting(false)
        }
    }

    if (isStopped && audioUrl) {
        return (
            <div className="space-y-2">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                        <Mic size={13} className="text-brand-500" />
                        <span className="text-xs font-semibold text-gray-600">Recording ({formattedDuration})</span>
                    </div>
                    <audio controls src={audioUrl} className="w-full h-8" style={{ height: '32px' }} />
                </div>
                <div className="flex gap-2">
                    <button onClick={reset} disabled={submitting} className="btn-secondary flex items-center gap-1.5 text-sm py-2 flex-1 justify-center">
                        <RotateCcw size={13} /> Re-record
                    </button>
                    <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex items-center gap-1.5 text-sm py-2 flex-1 justify-center">
                        {submitting
                            ? <><Loader2 size={13} className="animate-spin" /> Sending...</>
                            : <><CheckCircle size={13} /> Submit Answer</>
                        }
                    </button>
                </div>
            </div>
        )
    }

    if (isRecording) {
        return (
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <button
                    onClick={stopRecording}
                    className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0 hover:bg-red-600 transition-colors"
                    title="Stop recording"
                >
                    <Square size={14} fill="white" />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        <span className="text-sm font-semibold text-red-700">Recording... {formattedDuration}</span>
                    </div>
                    <p className="text-xs text-red-500 mt-0.5">Tap the square to stop</p>
                </div>
            </div>
        )
    }

    return (
        <button
            onClick={startRecording}
            disabled={disabled || state === STATES.requesting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
        >
            {state === STATES.requesting
                ? <><Loader2 size={15} className="animate-spin" /> Requesting mic...</>
                : <><Mic size={15} /> Record Answer</>
            }
        </button>
    )
}

function SummaryScreen({ summary, onRestart }) {
    const score = summary.overall_score ?? 0
    const progress = summary.role_play_progress
    const cfg =
        score >= 70 ? { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' } :
            score >= 55 ? { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' } :
                { color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100' }

    return (
        <div className="space-y-4 py-1">
            <div className={`rounded-2xl p-5 text-center border ${cfg.bg} ${cfg.border}`}>
                <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Trophy size={24} className={cfg.color} />
                </div>
                <p className={`text-5xl font-display font-bold ${cfg.color}`}>{score}%</p>
                {summary.grade && (
                    <span className={`inline-block mt-1 text-sm font-bold px-3 py-0.5 rounded-full ${cfg.color} bg-white border ${cfg.border}`}>
                        {summary.grade}
                    </span>
                )}
                {summary.summary && (
                    <p className="text-sm text-gray-600 mt-3 max-w-xs mx-auto leading-relaxed">{summary.summary}</p>
                )}
            </div>

            {progress && (
                <div className={`rounded-xl border p-3 text-sm ${progress.unlocked
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : progress.exhausted
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                    <p className="font-semibold">
                        {progress.unlocked
                            ? 'Assessment unlocked'
                            : progress.exhausted
                                ? 'Assessment locked'
                                : `${progress.attempts_remaining} roleplay attempt${progress.attempts_remaining !== 1 ? 's' : ''} left`}
                    </p>
                    {!progress.unlocked && (
                        <p className="text-xs mt-1">
                            {progress.exhausted
                                ? 'Contact trainer to unlock test as failed 10 times.'
                                : `Score ${progress.threshold}% or higher to unlock the assessment.`}
                        </p>
                    )}
                </div>
            )}

            {summary.strengths?.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">What worked well</p>
                    <div className="space-y-1.5">
                        {summary.strengths.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 p-3 bg-green-50 rounded-xl border border-green-100">
                                <Star size={12} className="text-green-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-green-800">{s}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {summary.improvements?.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Areas to improve</p>
                    <div className="space-y-2">
                        {summary.improvements.map((item, i) => (
                            <div key={i} className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <p className="text-xs font-bold text-amber-800 mb-1">{item.area}</p>
                                <p className="text-sm text-amber-700">{item.tip}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <button onClick={onRestart} className="btn-primary w-full flex items-center justify-center gap-2">
                <RotateCcw size={15} /> Practice Again
            </button>
        </div>
    )
}

export default function RolePlayPanel({ lesson, progress, onProgressUpdate }) {
    const [personas, setPersonas] = useState([])
    const [selectedPersonaKey, setSelectedPersonaKey] = useState('')
    const [personasLoading, setPersonasLoading] = useState(false)
    const [roleplayType, setRoleplayType] = useState('auto')
    const [scenario, setScenario] = useState(null)
    const [conversation, setConversation] = useState([])
    const [phase, setPhase] = useState('idle')
    const [starting, setStarting] = useState(false)
    const [loading, setLoading] = useState(false)
    const [summary, setSummary] = useState(null)
    const [gateProgress, setGateProgress] = useState(progress)
    const [latestFeedback, setLatestFeedback] = useState(null)
    const [latestTranscript, setLatestTranscript] = useState('')
    const conversationRef = useRef([])

    const uiLabels = getRolePlayUiLabels(scenario?.roleplay_type || roleplayType)

    useEffect(() => setGateProgress(progress), [progress])
    useEffect(() => { conversationRef.current = conversation }, [conversation])
    useEffect(() => () => window.speechSynthesis?.cancel(), [])
    useEffect(() => {
        if (lesson.transcript_status !== 'ready' || !lesson.transcript) return

        let mounted = true
        setPersonasLoading(true)
        rolePlayAPI.getPersonas(lesson._id)
            .then(res => {
                if (!mounted) return
                const nextPersonas = res.data.personas || []
                setPersonas(nextPersonas)
                setRoleplayType(res.data.roleplay_type || 'auto')
                setSelectedPersonaKey(current => current || nextPersonas[0]?.key || '')
            })
            .catch(() => toast.error('Could not generate lesson personas'))
            .finally(() => mounted && setPersonasLoading(false))

        return () => { mounted = false }
    }, [lesson._id, lesson.transcript, lesson.transcript_status])

    const reset = useCallback(() => {
        window.speechSynthesis?.cancel()
        setSummary(null)
        setScenario(null)
        setConversation([])
        setLatestFeedback(null)
        setLatestTranscript('')
        setPhase('idle')
    }, [])

    const finishSession = useCallback(async (conversationOverride = conversationRef.current) => {
        if (!scenario) return
        const userTurns = conversationOverride.filter(m => m.role === 'user').length
        if (userTurns < 2) {
            toast.error(getRolePlayUiLabels(scenario?.roleplay_type || roleplayType).minAnswersToast)
            return
        }

        setLoading(true)
        setPhase('scoring')
        try {
            const res = await rolePlayAPI.getScenarioSummary({
                lesson_id: lesson._id,
                scenario,
                conversation: conversationOverride.map(m => ({ role: m.role, content: m.content })),
            })
            const nextSummary = res.data.summary

            try {
                const progressRes = await rolePlayAPI.recordProgress({
                    lesson_id: lesson._id,
                    score: nextSummary.overall_score,
                    scenario_type: scenario.scenario_type || selectedPersonaKey || 'transcript-persona',
                    question_count: conversationOverride.filter(m => m.role === 'user').length,
                    scenario,
                    conversation: conversationOverride,
                    summary: nextSummary,
                })
                const nextProgress = progressRes.data.progress
                setGateProgress(nextProgress)
                onProgressUpdate?.(nextProgress)
                setSummary({ ...nextSummary, role_play_progress: nextProgress })
                await speak(`Your roleplay score is ${nextSummary.overall_score} percent. ${nextSummary.summary || ''}`)
            } catch (err) {
                const lockedProgress = err.response?.data?.progress
                if (lockedProgress) {
                    setGateProgress(lockedProgress)
                    onProgressUpdate?.(lockedProgress)
                    setSummary({ ...nextSummary, role_play_progress: lockedProgress })
                } else {
                    setSummary(nextSummary)
                }
                toast.error(err.response?.data?.message || 'Unlock status failed to update')
            }
        } catch {
            toast.error('Failed to generate summary')
            setPhase('ready')
        } finally {
            setLoading(false)
        }
    }, [lesson._id, loading, onProgressUpdate, roleplayType, scenario, selectedPersonaKey])

    const startScenario = async () => {
        if (gateProgress?.exhausted && !gateProgress?.unlocked) {
            toast.error('Contact trainer to unlock test as failed 10 times.')
            return
        }

        setStarting(true)
        reset()
        try {
            const selectedPersona = personas.find(p => p.key === selectedPersonaKey) || personas[0] || null
            const res = await rolePlayAPI.startScenario({ lesson_id: lesson._id, persona: selectedPersona })
            const sc = res.data.scenario
            const opening = { role: 'character', content: sc.opening_line, coaching: null }
            setScenario(sc)
            setConversation([opening])
            setPhase('ready')
            await speak(sc.opening_line)
        } catch {
            toast.error('Failed to start scenario. Try again')
        } finally {
            setStarting(false)
        }
    }

    const sendAudio = async (audioBlob) => {
        if (!scenario || loading) return
        setLoading(true)
        setPhase('listening')
        setLatestFeedback(null)
        setLatestTranscript('')

        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')
            formData.append('lesson_id', lesson._id)
            formData.append('scenario', JSON.stringify(scenario))
            formData.append('conversation', JSON.stringify(conversationRef.current.map(m => ({ role: m.role, content: m.content }))))

            const res = await rolePlayAPI.sendAudioTurn(formData)
            const transcription = res.data.transcription
            const coaching = res.data.coaching
            const reply = res.data.character_reply
            const nextUserCount = conversationRef.current.filter(m => m.role === 'user').length + 1
            const userMessage = { role: 'user', content: transcription, coaching, source: 'voice' }
            const nextConversation = nextUserCount >= MAX_ROLEPLAY_QUESTIONS
                ? [...conversationRef.current, userMessage]
                : [...conversationRef.current, userMessage, { role: 'character', content: reply, coaching: null }]

            setConversation(nextConversation)
            conversationRef.current = nextConversation
            setLatestTranscript(transcription)
            setLatestFeedback(coaching)
            setPhase('feedback')

            const spokenFeedback = coaching?.spoken_feedback || coaching?.tip || ''
            await speak(nextUserCount >= MAX_ROLEPLAY_QUESTIONS ? spokenFeedback : `${spokenFeedback} ${reply}`)

            if (nextUserCount >= MAX_ROLEPLAY_QUESTIONS) {
                await finishSession(nextConversation)
            } else {
                setPhase('ready')
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not process audio. Try again')
            setPhase('ready')
        } finally {
            setLoading(false)
        }
    }

    if (lesson.transcript_status !== 'ready' || !lesson.transcript) {
        return (
            <div className="text-center py-12">
                <AlertCircle size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-500">Role Playing unavailable</p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">A lesson transcript is needed to generate practice scenarios.</p>
            </div>
        )
    }

    if (summary) return <SummaryScreen summary={summary} onRestart={reset} />

    if (gateProgress?.exhausted && !gateProgress?.unlocked) {
        return (
            <div className="text-center py-12">
                <Lock size={34} className="mx-auto mb-3 text-red-300" />
                <p className="text-sm font-semibold text-gray-700">Role Playing locked</p>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                    Contact trainer to unlock test as failed 10 times.
                </p>
            </div>
        )
    }

    if (!scenario) {
        return (
            <div className="space-y-4">
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{uiLabels.personaTitle}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {personasLoading ? (
                            <div className="sm:col-span-2 p-4 rounded-xl border border-gray-200 bg-gray-50 flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 size={15} className="animate-spin" /> Generating lesson personas...
                            </div>
                        ) : personas.length === 0 ? (
                            <div className="sm:col-span-2 p-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
                                Personas will be generated from this lesson transcript when you start.
                            </div>
                        ) : personas.map(persona => {
                            const active = selectedPersonaKey === persona.key
                            return (
                                <button key={persona.key} onClick={() => setSelectedPersonaKey(persona.key)}
                                    className={`p-3 rounded-xl border-2 text-left transition-all ${active
                                        ? 'border-brand-400 bg-brand-50 text-brand-800'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                                        }`}>
                                    <p className="font-semibold text-sm">{persona.label}</p>
                                    <p className={`text-xs mt-0.5 ${active ? 'text-brand-700' : 'text-gray-400'}`}>{persona.customer_role}</p>
                                    <p className={`text-xs mt-2 line-clamp-2 ${active ? 'text-brand-700' : 'text-gray-500'}`}>{persona.concern || persona.situation}</p>
                                    {persona.focus_areas?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {persona.focus_areas.slice(0, 3).map((focus, idx) => (
                                                <span key={idx} className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {focus}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
                <button onClick={startScenario} disabled={starting || personasLoading} className="btn-primary w-full flex items-center justify-center gap-2">
                    {starting ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
                    {starting ? 'Setting up scenario...' : 'Start Voice Practice'}
                </button>
                <p className="text-xs text-gray-400 text-center">
                    {MAX_ROLEPLAY_QUESTIONS} spoken questions max. Score {gateProgress?.threshold || 70}% to unlock assessment.
                    {gateProgress && !gateProgress.unlocked ? ` ${gateProgress.attempts_remaining} attempts left.` : ''}
                </p>
            </div>
        )
    }
    const userTurnCount = conversation.filter(m => m.role === 'user').length
    const currentPrompt = [...conversation].reverse().find(m => m.role === 'character')?.content || scenario.opening_line
    const feedbackTier = latestFeedback?.tier || 'constructive'

    return (
        <div className="space-y-4">
            <ProgressDots count={userTurnCount} />

            <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {scenario.character_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-brand-800 text-sm">{scenario.character_name}</p>
                        <p className="text-xs text-brand-600">{scenario.character_role}</p>
                        <div className="mt-2 space-y-1">
                            <p className="text-xs text-gray-600"><span className="font-semibold">Situation:</span> {scenario.situation}</p>
                            <p className="text-xs text-gray-600 flex items-start gap-1.5">
                                <Target size={11} className="text-brand-500 flex-shrink-0 mt-0.5" />
                                <span><span className="font-semibold">Goal:</span> {scenario.goal}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
                        <Volume2 size={17} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-semibold text-brand-600 mb-1">{uiLabels.questionTitle}</p>
                        <p className="text-sm text-gray-800 leading-relaxed">{currentPrompt}</p>
                        <button
                            onClick={() => speak(currentPrompt)}
                            className="mt-3 text-xs text-brand-600 font-semibold hover:underline"
                        >
                            Replay question
                        </button>
                    </div>
                </div>
            </div>

            {latestTranscript && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1.5">
                        <MessageSquare size={12} /> Your last answer
                    </p>
                    <p className="text-sm text-gray-700 italic">"{latestTranscript}"</p>
                </div>
            )}

            {latestFeedback && (
                <div className={`rounded-xl border p-3 text-sm ${feedbackTier === 'positive'
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : feedbackTier === 'corrective'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                        <Volume2 size={13} />
                        <p className="font-semibold">AI voice feedback</p>
                        {latestFeedback.score != null && <span className="ml-auto text-xs font-bold">{latestFeedback.score}/10</span>}
                    </div>
                    <p className="text-xs leading-relaxed">{latestFeedback.tip || latestFeedback.what_worked}</p>
                </div>
            )}

            {phase === 'scoring' ? (
                <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 flex items-center gap-3">
                    <Loader2 size={18} className="animate-spin text-brand-500" />
                    <div>
                        <p className="text-sm font-semibold text-brand-700">Scoring your roleplay...</p>
                        <p className="text-xs text-brand-600">This attempt is ending after {MAX_ROLEPLAY_QUESTIONS} questions.</p>
                    </div>
                </div>
            ) : (
                <VoiceInput onSubmit={sendAudio} disabled={loading || userTurnCount >= MAX_ROLEPLAY_QUESTIONS} />
            )}

            <div className="flex gap-2">
                <button
                    onClick={reset}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1"
                    disabled={loading}
                >
                    <RefreshCw size={12} /> New Scenario
                </button>
                <button
                    onClick={() => finishSession()}
                    disabled={loading || userTurnCount < 2}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1 disabled:opacity-40"
                >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                    End & Get Score
                </button>
            </div>
        </div>
    )
}

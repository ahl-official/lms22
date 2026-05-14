// frontend/src/components/RolePlay/index.jsx
// Trainee responds via text OR voice recording.
// AI replies as a character (text only — no TTS).
// Audio is transcribed server-side via AssemblyAI.

import { useState, useRef, useEffect, useCallback } from 'react'
import {
    Send, RefreshCw, Award, Loader2, Users, Target,
    ChevronDown, ChevronUp, ThumbsUp, Lightbulb,
    Trophy, RotateCcw, Star, AlertCircle, Mic, Type,
    Square, Lock,
} from 'lucide-react'
import { rolePlayAPI } from '../../services/api'
import useVoiceRecorder from '../../hooks/useVoiceRecorder'
import toast from 'react-hot-toast'

// ── Scenario types ────────────────────────────────────────────────────────────
const SCENARIO_TYPES = [
    { key: 'objection', label: 'Objection Handling', desc: 'Customer raises concerns about price, timing, or trust', activeClass: 'border-coral-400 bg-coral-50 text-coral-700' },
    { key: 'consultation', label: 'Needs Assessment', desc: 'Understand what the customer actually needs', activeClass: 'border-brand-400 bg-brand-50 text-brand-700' },
    { key: 'demo', label: 'Product Demo', desc: 'Walk a customer through the product or service', activeClass: 'border-amber-400 bg-amber-50 text-amber-700' },
    { key: 'closing', label: 'Closing the Deal', desc: 'Convert an interested prospect into a commitment', activeClass: 'border-sage-500 bg-sage-50 text-sage-700' },
]

// ── CoachingNote ──────────────────────────────────────────────────────────────
function CoachingNote({ coaching, isLatest }) {
    const [open, setOpen] = useState(isLatest)
    if (!coaching) return null

    const cfg = {
        positive: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', accent: 'text-green-600' },
        constructive: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', accent: 'text-amber-600' },
        corrective: { bg: 'bg-red-50   border-red-200', text: 'text-red-800', accent: 'text-red-600' },
    }[coaching.tier || 'constructive'] || { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', accent: 'text-gray-500' }

    return (
        <div className={`rounded-xl border text-xs overflow-hidden ${cfg.bg} ${cfg.text}`}>
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <Lightbulb size={11} className={`flex-shrink-0 ${cfg.accent}`} />
                <span className="font-semibold flex-1">Coach · {coaching.score}/10</span>
                {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {open && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-current border-opacity-20">
                    {coaching.what_worked && (
                        <p className="flex items-start gap-1.5">
                            <ThumbsUp size={11} className="flex-shrink-0 mt-0.5" />
                            <span>{coaching.what_worked}</span>
                        </p>
                    )}
                    {coaching.tip && (
                        <p className="flex items-start gap-1.5 font-medium">
                            <span className="flex-shrink-0">→</span>
                            <span>{coaching.tip}</span>
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

// ── SummaryScreen ─────────────────────────────────────────────────────────────
function SummaryScreen({ summary, onRestart }) {
    const score = summary.overall_score ?? 0
    const progress = summary.role_play_progress
    const cfg =
        score >= 80 ? { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' } :
            score >= 60 ? { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' } :
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
                                : 'Score 80% or higher to unlock the assessment.'}
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

            {summary.best_moment && (
                <div className="p-3 bg-brand-50 rounded-xl border border-brand-100">
                    <p className="text-xs font-bold text-brand-700 mb-1">Best moment</p>
                    <p className="text-sm text-brand-600 italic">"{summary.best_moment}"</p>
                </div>
            )}

            {summary.recommended_focus && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-xs font-bold text-gray-600 mb-1">Focus for next practice</p>
                    <p className="text-sm text-gray-700">{summary.recommended_focus}</p>
                </div>
            )}

            <button onClick={onRestart} className="btn-primary w-full flex items-center justify-center gap-2">
                <RotateCcw size={15} /> Practice Again
            </button>
        </div>
    )
}

// ── VoiceInput ────────────────────────────────────────────────────────────────
function VoiceInput({ onSubmit, disabled }) {
    const { state, formattedDuration, audioBlob, audioUrl, isRecording, isStopped, startRecording, stopRecording, reset, STATES } = useVoiceRecorder()
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!audioBlob || submitting) return
        setSubmitting(true)
        try {
            await onSubmit(audioBlob)
            reset()
        } catch (err) {
            // error handled upstream
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
                            ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                            : <><Send size={13} /> Send</>
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
                        <span className="text-sm font-semibold text-red-700">Recording… {formattedDuration}</span>
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
                ? <><Loader2 size={15} className="animate-spin" /> Requesting mic…</>
                : <><Mic size={15} /> Tap to Record</>
            }
        </button>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RolePlayPanel({ lesson, progress, onProgressUpdate }) {
    const [scenarioType, setScenarioType] = useState('objection')
    const [scenario, setScenario] = useState(null)
    const [conversation, setConversation] = useState([])
    // message: { role:'user'|'character', content:string, coaching?:object, source?:'text'|'voice' }
    const [inputMode, setInputMode] = useState('text') // 'text' | 'voice'
    const [textInput, setTextInput] = useState('')
    const [starting, setStarting] = useState(false)
    const [loading, setLoading] = useState(false)
    const [summarizing, setSummarizing] = useState(false)
    const [summary, setSummary] = useState(null)
    const [gateProgress, setGateProgress] = useState(progress)
    const chatEndRef = useRef(null)
    const textInputRef = useRef(null)

    useEffect(() => {
        setGateProgress(progress)
    }, [progress])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [conversation, loading])

    const reset = useCallback(() => {
        setSummary(null); setScenario(null); setConversation([]); setTextInput('')
    }, [])

    const startScenario = async () => {
        if (gateProgress?.exhausted && !gateProgress?.unlocked) {
            toast.error('Contact trainer to unlock test as failed 10 times.')
            return
        }
        setStarting(true)
        reset()
        try {
            const res = await rolePlayAPI.startScenario({ lesson_id: lesson._id, scenario_type: scenarioType })
            const sc = res.data.scenario
            setScenario(sc)
            setConversation([{ role: 'character', content: sc.opening_line, coaching: null }])
            setTimeout(() => textInputRef.current?.focus(), 100)
        } catch {
            toast.error('Failed to start scenario — try again')
        } finally {
            setStarting(false)
        }
    }

    // Shared: after getting a turn response, update conversation
    const applyTurnResponse = (userContent, source, res) => {
        setConversation(prev => [
            ...prev.slice(0, -1), // remove optimistic user msg
            { role: 'user', content: userContent, coaching: res.data.coaching, source },
            { role: 'character', content: res.data.character_reply, coaching: null },
        ])
    }

    const sendText = async () => {
        if (!textInput.trim() || loading || !scenario) return
        const msg = textInput.trim()
        setTextInput('')

        setConversation(prev => [...prev, { role: 'user', content: msg, coaching: null, source: 'text' }])
        setLoading(true)

        try {
            const convoForApi = [...conversation, { role: 'user', content: msg }].map(m => ({ role: m.role, content: m.content }))
            const res = await rolePlayAPI.sendTurn({
                lesson_id: lesson._id,
                scenario,
                conversation: convoForApi.slice(0, -1),
                user_message: msg,
            })
            applyTurnResponse(msg, 'text', res)
        } catch {
            toast.error('Failed to get response')
            setConversation(prev => prev.slice(0, -1))
        } finally {
            setLoading(false)
        }
    }

    const sendAudio = async (audioBlob) => {
        if (!scenario) return
        setLoading(true)

        // Optimistic placeholder while transcribing
        setConversation(prev => [...prev, { role: 'user', content: '…transcribing…', coaching: null, source: 'voice', pending: true }])

        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')
            formData.append('lesson_id', lesson._id)
            formData.append('scenario', JSON.stringify(scenario))
            formData.append('conversation', JSON.stringify(
                [...conversation].map(m => ({ role: m.role, content: m.content }))
            ))

            const res = await rolePlayAPI.sendAudioTurn(formData)
            const transcription = res.data.transcription

            setConversation(prev => [
                ...prev.slice(0, -1), // remove placeholder
                { role: 'user', content: transcription, coaching: res.data.coaching, source: 'voice' },
                { role: 'character', content: res.data.character_reply, coaching: null },
            ])
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not process audio — try again')
            setConversation(prev => prev.slice(0, -1))
        } finally {
            setLoading(false)
        }
    }

    const endSession = async () => {
        if (conversation.filter(m => m.role === 'user').length < 2) {
            toast.error('Have at least 2 exchanges before ending')
            return
        }
        setSummarizing(true)
        try {
            const res = await rolePlayAPI.getScenarioSummary({
                lesson_id: lesson._id,
                scenario,
                conversation: conversation.map(m => ({ role: m.role, content: m.content })),
            })
            const nextSummary = res.data.summary
            try {
                const progressRes = await rolePlayAPI.recordProgress({
                    lesson_id: lesson._id,
                    score: nextSummary.overall_score,
                    scenario_type: scenarioType,
                })
                const nextProgress = progressRes.data.progress
                setGateProgress(nextProgress)
                onProgressUpdate?.(nextProgress)
                setSummary({ ...nextSummary, role_play_progress: nextProgress })
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
        } finally {
            setSummarizing(false)
        }
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
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

    // ── Scenario picker ──
    if (!scenario) {
        return (
            <div className="space-y-4">
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Choose a practice type</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {SCENARIO_TYPES.map(type => (
                            <button key={type.key} onClick={() => setScenarioType(type.key)}
                                className={`p-3 rounded-xl border-2 text-left transition-all ${scenarioType === type.key
                                    ? type.activeClass
                                    : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}>
                                <p className="font-semibold text-sm">{type.label}</p>
                                <p className={`text-xs mt-0.5 ${scenarioType === type.key ? 'opacity-80' : 'text-gray-400'}`}>{type.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
                <button onClick={startScenario} disabled={starting} className="btn-primary w-full flex items-center justify-center gap-2">
                    {starting ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
                    {starting ? 'Setting up scenario…' : 'Start Practice Session'}
                </button>
                <p className="text-xs text-gray-400 text-center">
                    Score 80% to unlock assessment
                    {gateProgress && !gateProgress.unlocked ? ` · ${gateProgress.attempts_remaining} attempts left` : ''}
                    {' '}· respond by text or voice
                </p>
            </div>
        )
    }

    // ── Active session ──
    const userTurnCount = conversation.filter(m => m.role === 'user').length
    const latestUserIdx = conversation.map((m, i) => m.role === 'user' ? i : -1).filter(i => i !== -1).at(-1)

    return (
        <div className="space-y-3">
            {/* Scenario card */}
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

            {/* Chat */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {conversation.map((msg, i) => (
                    <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'character' && (
                            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5">
                                {scenario.character_name?.charAt(0)}
                            </div>
                        )}
                        <div className="max-w-[82%] space-y-1.5">
                            <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-brand-500 text-white rounded-br-sm'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                                } ${msg.pending ? 'opacity-60 italic' : ''}`}>
                                {/* Show mic icon for voice messages */}
                                {msg.role === 'user' && msg.source === 'voice' && !msg.pending && (
                                    <span className="inline-flex items-center gap-1 text-white/70 text-xs mb-1 mr-1">
                                        <Mic size={10} />
                                    </span>
                                )}
                                {msg.content}
                            </div>
                            {msg.role === 'user' && msg.coaching && (
                                <CoachingNote coaching={msg.coaching} isLatest={i === latestUserIdx} />
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex items-center gap-2 pl-9">
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input mode toggle + input */}
            <div className="space-y-2">
                {/* Text / Voice toggle */}
                <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
                        <button
                            onClick={() => setInputMode('text')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${inputMode === 'text' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Type size={12} /> Text
                        </button>
                        <button
                            onClick={() => setInputMode('voice')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${inputMode === 'voice' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Mic size={12} /> Voice
                        </button>
                    </div>
                    <span className="text-xs text-gray-400">
                        {inputMode === 'voice' ? 'Record your response' : 'Type your response'}
                    </span>
                </div>

                {/* Text input */}
                {inputMode === 'text' && (
                    <div className="flex gap-2">
                        <textarea
                            ref={textInputRef}
                            value={textInput}
                            onChange={e => setTextInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Your response… (Enter to send)"
                            rows={2}
                            className="input-field resize-none flex-1 text-sm"
                            disabled={loading}
                        />
                        <button
                            onClick={sendText}
                            disabled={!textInput.trim() || loading}
                            className="btn-primary px-4 self-stretch flex items-center justify-center disabled:opacity-40"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                )}

                {/* Voice input */}
                {inputMode === 'voice' && (
                    <VoiceInput onSubmit={sendAudio} disabled={loading} />
                )}

                {/* Session controls */}
                <div className="flex gap-2">
                    <button
                        onClick={() => { setScenario(null); setConversation([]) }}
                        className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1"
                    >
                        <RefreshCw size={12} /> New Scenario
                    </button>
                    <button
                        onClick={endSession}
                        disabled={summarizing || userTurnCount < 2}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1 disabled:opacity-40"
                        title={userTurnCount < 2 ? 'Have at least 2 exchanges first' : undefined}
                    >
                        {summarizing ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                        {summarizing ? 'Scoring…' : 'End & Get Score'}
                    </button>
                </div>
            </div>
        </div>
    )
}

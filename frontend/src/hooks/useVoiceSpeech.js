import { useRef, useState, useCallback, useEffect } from 'react'
import { voiceTestAPI } from '../services/api'

const SILENCE_MS = 2200
const SPEECH_RMS_THRESHOLD = 0.02
const MIN_SPEECH_MS = 600
const MAX_RECORD_MS = 90000

const pickMimeType = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    if (typeof MediaRecorder === 'undefined') return 'audio/webm'
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm'
}

export default function useVoiceSpeech({ language = 'en-US' } = {}) {
    const useBrowserTts = import.meta.env.VITE_TTS_MODE === 'browser'
    const [isListening, setIsListening] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [liveTranscript, setLiveTranscript] = useState('')
    const [recordingMs, setRecordingMs] = useState(0)
    const [supported, setSupported] = useState(true)
    const [micError, setMicError] = useState(null)

    const audioRef = useRef(null)
    const onSilenceRef = useRef(null)
    const listenGenerationRef = useRef(0)
    const mediaRecorderRef = useRef(null)
    const mediaStreamRef = useRef(null)
    const chunksRef = useRef([])
    const mimeTypeRef = useRef('audio/webm')
    const audioContextRef = useRef(null)
    const analyserRef = useRef(null)
    const rafRef = useRef(null)
    const recordingTimerRef = useRef(null)
    const maxTimerRef = useRef(null)
    const silenceStartedAtRef = useRef(null)
    const speechStartedAtRef = useRef(null)
    const hasSpeechRef = useRef(false)
    const stoppingRef = useRef(false)
    const transcriptRef = useRef('')
    const recordingStartedAtRef = useRef(0)
    const finalizePromiseRef = useRef(null)

    const assessmentLanguage = language === 'hi-IN' ? 'hi' : 'en'

    useEffect(() => {
        const hasMedia = typeof window !== 'undefined'
            && !!navigator.mediaDevices?.getUserMedia
            && typeof MediaRecorder !== 'undefined'
        setSupported(hasMedia)
        return () => {
            listenGenerationRef.current += 1
            cleanupRecording()
            stopTtsPlayback()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const stopTtsPlayback = () => {
        window.speechSynthesis?.cancel()
        const audio = audioRef.current
        if (!audio) return
        try {
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
        } catch (_) { /* ignore */ }
    }

    const cleanupRecording = () => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        clearInterval(recordingTimerRef.current)
        clearTimeout(maxTimerRef.current)
        recordingTimerRef.current = null
        maxTimerRef.current = null

        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.ondataavailable = null
                mediaRecorderRef.current.onstop = null
                mediaRecorderRef.current.stop()
            }
        } catch (_) { /* ignore */ }
        mediaRecorderRef.current = null

        mediaStreamRef.current?.getTracks?.().forEach((track) => {
            try { track.stop() } catch (_) { /* ignore */ }
        })
        mediaStreamRef.current = null

        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {})
            audioContextRef.current = null
        }
        analyserRef.current = null
    }

    const displayTranscriptRef = useRef('')

    const transcribeBlob = useCallback(async (blob) => {
        if (!blob || blob.size < 256) return ''
        setIsTranscribing(true)
        setLiveTranscript((prev) => prev || 'Transcribing your answer…')
        try {
            const res = await voiceTestAPI.transcribe(blob, assessmentLanguage)
            const text = (res.data?.transcript || '').trim()
            const display = (res.data?.display_transcript || text).trim()
            transcriptRef.current = text
            displayTranscriptRef.current = display
            // UI shows Roman Hinglish when provided; scoring still uses canonical text.
            setLiveTranscript(display || text || '')
            console.log('[voice:server_stt]', {
                language: assessmentLanguage,
                bytes: blob.size,
                length: text.length,
                displayLength: display.length,
                preview: text.slice(0, 160),
                displayPreview: display.slice(0, 160),
            })
            return text
        } catch (err) {
            const message = err.response?.data?.message || err.message || 'Transcription failed'
            console.error('[voice:server_stt_failed]', {
                message,
                status: err.response?.status,
            })
            setMicError(message)
            return ''
        } finally {
            setIsTranscribing(false)
        }
    }, [assessmentLanguage])

    const finalizeRecording = useCallback(async (generation, { invokeSilenceCallback }) => {
        if (finalizePromiseRef.current) {
            return finalizePromiseRef.current
        }

        finalizePromiseRef.current = (async () => {
            stoppingRef.current = true

            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
            clearInterval(recordingTimerRef.current)
            clearTimeout(maxTimerRef.current)

            const recorder = mediaRecorderRef.current
            const blob = await new Promise((resolve) => {
                if (!recorder || recorder.state === 'inactive') {
                    const fallback = chunksRef.current.length
                        ? new Blob(chunksRef.current, { type: mimeTypeRef.current })
                        : null
                    resolve(fallback)
                    return
                }

                recorder.onstop = () => {
                    const recorded = chunksRef.current.length
                        ? new Blob(chunksRef.current, { type: mimeTypeRef.current })
                        : null
                    resolve(recorded)
                }

                try {
                    if (recorder.state === 'recording') recorder.requestData?.()
                    recorder.stop()
                } catch (_) {
                    resolve(chunksRef.current.length
                        ? new Blob(chunksRef.current, { type: mimeTypeRef.current })
                        : null)
                }
            })

            mediaStreamRef.current?.getTracks?.().forEach((track) => {
                try { track.stop() } catch (_) { /* ignore */ }
            })
            mediaStreamRef.current = null
            mediaRecorderRef.current = null

            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {})
                audioContextRef.current = null
            }
            analyserRef.current = null

            setIsListening(false)

            // Still transcribe for the active stop request even if a newer
            // generation was opened; Done Answering must always get text.
            const text = await transcribeBlob(blob)

            if (invokeSilenceCallback && generation === listenGenerationRef.current) {
                const cb = onSilenceRef.current
                onSilenceRef.current = null
                if (cb) cb(text)
            } else if (!invokeSilenceCallback) {
                onSilenceRef.current = null
            }

            return text
        })()

        try {
            return await finalizePromiseRef.current
        } finally {
            finalizePromiseRef.current = null
            stoppingRef.current = false
        }
    }, [transcribeBlob])

    const monitorVolume = useCallback((generation) => {
        const analyser = analyserRef.current
        if (!analyser) return

        const data = new Uint8Array(analyser.fftSize)
        const tick = () => {
            if (generation !== listenGenerationRef.current || stoppingRef.current) return

            analyser.getByteTimeDomainData(data)
            let sum = 0
            for (let i = 0; i < data.length; i += 1) {
                const centered = (data[i] - 128) / 128
                sum += centered * centered
            }
            const rms = Math.sqrt(sum / data.length)
            const now = Date.now()

            if (rms >= SPEECH_RMS_THRESHOLD) {
                if (!speechStartedAtRef.current) speechStartedAtRef.current = now
                if (now - speechStartedAtRef.current >= MIN_SPEECH_MS) {
                    hasSpeechRef.current = true
                    setLiveTranscript((prev) => (
                        prev && !prev.startsWith('Transcribing') && !prev.startsWith('Listening')
                            ? prev
                            : 'Hearing you… keep speaking'
                    ))
                }
                silenceStartedAtRef.current = null
            } else if (hasSpeechRef.current) {
                if (!silenceStartedAtRef.current) silenceStartedAtRef.current = now
                if (now - silenceStartedAtRef.current >= SILENCE_MS) {
                    console.log('[voice:energy_silence_detected]')
                    void finalizeRecording(generation, { invokeSilenceCallback: true })
                    return
                }
            }

            rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
    }, [finalizeRecording])

    const startListening = useCallback(async (onSilence) => {
        if (!supported) {
            setMicError('This browser cannot record audio. Use Chrome or Edge.')
            return
        }
        if (mediaRecorderRef.current || finalizePromiseRef.current) return

        const generation = ++listenGenerationRef.current
        stoppingRef.current = false
        onSilenceRef.current = onSilence || null
        chunksRef.current = []
        transcriptRef.current = ''
        displayTranscriptRef.current = ''
        hasSpeechRef.current = false
        speechStartedAtRef.current = null
        silenceStartedAtRef.current = null
        setLiveTranscript('')
        setMicError(null)
        setRecordingMs(0)
        stopTtsPlayback()

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            })

            if (generation !== listenGenerationRef.current) {
                stream.getTracks().forEach((track) => track.stop())
                return
            }

            mediaStreamRef.current = stream
            mimeTypeRef.current = pickMimeType()
            const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current })
            mediaRecorderRef.current = recorder

            recorder.ondataavailable = (event) => {
                if (event.data?.size > 0) chunksRef.current.push(event.data)
            }

            recorder.onerror = (event) => {
                console.error('[voice:mediarecorder_error]', event.error || event)
                setMicError('Recording failed. Check microphone permissions and try again.')
            }

            // Volume-based silence detection (does not depend on Chrome SpeechRecognition).
            const AudioCtx = window.AudioContext || window.webkitAudioContext
            if (AudioCtx) {
                const ctx = new AudioCtx()
                audioContextRef.current = ctx
                const source = ctx.createMediaStreamSource(stream)
                const analyser = ctx.createAnalyser()
                analyser.fftSize = 2048
                source.connect(analyser)
                analyserRef.current = analyser
                if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
            }

            recorder.start(250)
            recordingStartedAtRef.current = Date.now()
            setIsListening(true)
            setLiveTranscript('Listening… start speaking')
            console.log('[voice:recording_start]', {
                language: assessmentLanguage,
                mimeType: mimeTypeRef.current,
            })

            recordingTimerRef.current = setInterval(() => {
                setRecordingMs(Date.now() - recordingStartedAtRef.current)
            }, 250)

            maxTimerRef.current = setTimeout(() => {
                if (generation !== listenGenerationRef.current) return
                console.log('[voice:max_recording_reached]')
                void finalizeRecording(generation, { invokeSilenceCallback: true })
            }, MAX_RECORD_MS)

            monitorVolume(generation)
        } catch (err) {
            console.error('[voice:mic_permission_denied]', err)
            setIsListening(false)
            setMicError('Microphone permission is required. Allow mic access and retry.')
            onSilenceRef.current = null
        }
    }, [assessmentLanguage, finalizeRecording, monitorVolume, supported])

    const stopListening = useCallback(async () => {
        const generation = listenGenerationRef.current
        onSilenceRef.current = null
        const text = await finalizeRecording(generation, { invokeSilenceCallback: false })
        listenGenerationRef.current += 1
        console.log('[voice:listening_stop]', {
            length: text.length,
            preview: text.slice(0, 160),
        })
        return text
    }, [finalizeRecording])

    const getTranscript = useCallback(() => transcriptRef.current, [])
    const getDisplayTranscript = useCallback(() => (
        displayTranscriptRef.current || transcriptRef.current || liveTranscript
    ), [liveTranscript])

    const speak = useCallback((text, onDone) => {
        setIsSpeaking(true)
        let finished = false

        const finish = () => {
            if (finished) return
            finished = true
            setIsSpeaking(false)
            if (onDone) onDone()
        }

        const tryBrowserSpeak = () => {
            if (!window.speechSynthesis) {
                console.error('[voice:browser_tts_unavailable]')
                finish()
                return
            }

            window.speechSynthesis.cancel()
            const utter = new SpeechSynthesisUtterance(text)
            utter.lang = language
            utter.rate = 0.95
            utter.pitch = 1

            const voices = window.speechSynthesis.getVoices()
            const preferred = voices.find((v) => v.lang === language) ||
                voices.find((v) => v.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()))
            if (preferred) utter.voice = preferred

            utter.onend = finish
            utter.onerror = (event) => {
                console.error('[voice:browser_tts_error]', event?.error || event)
                finish()
            }
            window.speechSynthesis.speak(utter)
        }

        if (useBrowserTts) {
            tryBrowserSpeak()
            return
        }

        voiceTestAPI.speech({
            text,
            language: assessmentLanguage,
        }).then((response) => {
            const mime = response.headers?.['content-type'] || 'audio/mpeg'
            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: mime })
            const audioUrl = URL.createObjectURL(blob)
            const audio = audioRef.current || new Audio()
            audioRef.current = audio
            audio.src = audioUrl
            audio.muted = false
            audio.volume = 1
            const cleanup = () => {
                URL.revokeObjectURL(audioUrl)
                finish()
            }
            audio.onended = cleanup
            audio.onerror = (event) => {
                console.error('[voice:tts_audio_element_error]', event)
                URL.revokeObjectURL(audioUrl)
                tryBrowserSpeak()
            }
            return audio.play().catch((err) => {
                console.error('[voice:tts_playback_blocked]', {
                    language,
                    message: err?.message || 'Browser blocked audio playback after the async TTS request',
                })
                URL.revokeObjectURL(audioUrl)
                tryBrowserSpeak()
            })
        }).catch((err) => {
            console.error('[voice:server_tts_failed]', {
                status: err.response?.status,
                message: err.response?.data?.message || err.message,
            })
            tryBrowserSpeak()
        })
    }, [assessmentLanguage, language, useBrowserTts])

    const unlockAudio = useCallback(() => {
        const audio = audioRef.current || new Audio()
        audioRef.current = audio
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
        audio.muted = true
        audio.volume = 0
        const result = audio.play()
        if (result?.catch) result.catch(() => {})

        // Warm mic permission on the Start click gesture.
        if (navigator.mediaDevices?.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then((stream) => stream.getTracks().forEach((track) => track.stop()))
                .catch(() => {})
        }
    }, [])

    const cancelSpeech = useCallback(() => {
        stopTtsPlayback()
        setIsSpeaking(false)
    }, [])

    return {
        speak,
        startListening,
        stopListening,
        getTranscript,
        getDisplayTranscript,
        cancelSpeech,
        unlockAudio,
        isListening,
        isSpeaking,
        isTranscribing,
        liveTranscript,
        recordingMs,
        supported,
        micError,
        voicesReady: true,
    }
}

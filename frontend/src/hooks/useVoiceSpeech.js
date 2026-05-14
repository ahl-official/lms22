import { useRef, useState, useCallback, useEffect } from 'react'

export default function useVoiceSpeech() {
    const [isListening, setIsListening] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [liveTranscript, setLiveTranscript] = useState('')
    const [supported, setSupported] = useState(true)

    const recognitionRef = useRef(null)
    const silenceTimerRef = useRef(null)
    const finalTranscriptRef = useRef('')
    const onSilenceRef = useRef(null)
    // Ref mirror of isListening — avoids stale closure bug in callbacks
    const isListeningRef = useRef(false)

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SR) { setSupported(false); return }

        const rec = new SR()
        rec.continuous = true
        rec.interimResults = true
        rec.lang = 'en-US'

        rec.onresult = (event) => {
            let interim = '', final = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript
                if (event.results[i].isFinal) final += t
                else interim += t
            }
            if (final) {
                finalTranscriptRef.current += ' ' + final
                setLiveTranscript(finalTranscriptRef.current.trim())
            } else {
                setLiveTranscript((finalTranscriptRef.current + ' ' + interim).trim())
            }
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = setTimeout(() => {
                try { rec.stop() } catch (e) { }
                isListeningRef.current = false
                setIsListening(false)
                if (onSilenceRef.current) {
                    const cb = onSilenceRef.current
                    onSilenceRef.current = null
                    cb()
                }
            }, 3000)
        }

        rec.onend = () => {
            isListeningRef.current = false
            setIsListening(false)
        }

        rec.onerror = (e) => {
            if (e.error !== 'no-speech') console.error('STT error:', e.error)
            isListeningRef.current = false
            setIsListening(false)
        }

        recognitionRef.current = rec

        return () => {
            window.speechSynthesis?.cancel()
            clearTimeout(silenceTimerRef.current)
            try { recognitionRef.current?.abort() } catch (_) { }
        }
    }, [])

    const speak = useCallback((text, onDone) => {
        if (!window.speechSynthesis) {
            if (onDone) onDone()
            return
        }

        window.speechSynthesis.cancel()
        setIsSpeaking(true)

        const trySpeak = () => {
            const utter = new SpeechSynthesisUtterance(text)
            utter.lang = 'en-US'
            utter.rate = 0.95
            utter.pitch = 1

            const voices = window.speechSynthesis.getVoices()
            const preferred = voices.find(v =>
                v.name.includes('Google US English') ||
                v.name.includes('Samantha') ||
                v.name.includes('Karen') ||
                (v.lang === 'en-US' && !v.name.includes('Google'))
            ) || voices.find(v => v.lang.startsWith('en'))

            if (preferred) utter.voice = preferred

            utter.onend = () => {
                setIsSpeaking(false)
                if (onDone) onDone()
            }
            utter.onerror = () => {
                setIsSpeaking(false)
                if (onDone) onDone()
            }

            window.speechSynthesis.speak(utter)
        }

        const voices = window.speechSynthesis.getVoices()
        if (voices.length > 0) {
            trySpeak()
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.onvoiceschanged = null
                trySpeak()
            }
        }
    }, [])

    const startListening = useCallback((onSilence) => {
        // Use ref — not state — to avoid stale closure bug
        if (!recognitionRef.current || isListeningRef.current) return

        onSilenceRef.current = onSilence || null
        finalTranscriptRef.current = ''
        setLiveTranscript('')
        isListeningRef.current = true
        setIsListening(true)

        try {
            recognitionRef.current.start()
        } catch (e) {
            if (e.name === 'InvalidStateError') {
                // Already started — stop and retry after a short delay
                try { recognitionRef.current.stop() } catch (_) { }
                setTimeout(() => {
                    isListeningRef.current = false
                    setIsListening(false)
                    // Retry once
                    startListening(onSilence)
                }, 300)
            } else {
                console.error('Mic start error:', e)
                isListeningRef.current = false
                setIsListening(false)
            }
        }
    }, []) // No isListening dependency — uses ref instead

    const stopListening = useCallback(() => {
        clearTimeout(silenceTimerRef.current)
        onSilenceRef.current = null
        try { recognitionRef.current?.stop() } catch (e) { }
        isListeningRef.current = false
        setIsListening(false)
        return finalTranscriptRef.current.trim()
    }, [])

    const cancelSpeech = useCallback(() => {
        window.speechSynthesis?.cancel()
        setIsSpeaking(false)
    }, [])

    return {
        speak,
        startListening,
        stopListening,
        cancelSpeech,
        isListening,
        isSpeaking,
        liveTranscript,
        supported,
        voicesReady: true,
    }
}
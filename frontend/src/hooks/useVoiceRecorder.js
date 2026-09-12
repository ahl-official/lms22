import { useState, useRef, useCallback } from 'react'

const STATES = { idle: 'idle', requesting: 'requesting', recording: 'recording', stopped: 'stopped', error: 'error' }

export default function useVoiceRecorder() {
  const [state, setState] = useState(STATES.idle)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const getMimeType = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    return types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm'
  }

  const startRecording = useCallback(async () => {
    try {
      setState(STATES.requesting)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
        setState(STATES.stopped)
      }

      recorder.start(250)
      mediaRecorderRef.current = recorder
      setState(STATES.recording)
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch (err) {
      setError(err.message)
      setState(STATES.error)
    }
  }, [])

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    clearInterval(timerRef.current)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    mediaRecorderRef.current?.stop()
    setState(STATES.idle)
    setDuration(0)
    setAudioBlob(null)
    setAudioUrl(null)
    setError(null)
  }, [audioUrl])

  const formatDuration = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return {
    state,
    duration,
    formattedDuration: formatDuration(duration),
    audioBlob,
    audioUrl,
    error,
    isRecording: state === STATES.recording,
    isStopped: state === STATES.stopped,
    startRecording,
    stopRecording,
    reset,
    STATES,
  }
}

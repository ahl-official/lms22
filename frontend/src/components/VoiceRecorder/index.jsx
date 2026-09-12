import { useState } from 'react'
import { Mic, Square, Play, RotateCcw, Send, AlertCircle } from 'lucide-react'
import useVoiceRecorder from '../../hooks/useVoiceRecorder'

export default function VoiceRecorder({ onSubmit, disabled }) {
  const [submitting, setSubmitting] = useState(false)
  const {
    state, formattedDuration, audioBlob, audioUrl, error,
    isRecording, isStopped, startRecording, stopRecording, reset, STATES
  } = useVoiceRecorder()

  const handleSubmit = async () => {
    if (!audioBlob) return
    setSubmitting(true)
    try {
      await onSubmit(audioBlob)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Recording button */}
      <div className="flex flex-col items-center gap-4">
        {!isRecording && !isStopped && (
          <button
            onClick={startRecording}
            disabled={disabled || state === STATES.requesting}
            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {state === STATES.requesting
              ? <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              : <Mic size={32} />
            }
          </button>
        )}

        {isRecording && (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg recording-pulse"
            >
              <Square size={28} fill="white" />
            </button>
            <div className="flex items-center gap-2 text-red-500 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {formattedDuration}
            </div>
          </div>
        )}

        {!isRecording && !isStopped && state !== STATES.requesting && (
          <p className="text-sm text-gray-500">Tap to start recording</p>
        )}
      </div>

      {/* Playback + actions */}
      {isStopped && audioUrl && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Your recording ({formattedDuration})</p>
            <audio controls src={audioUrl} className="w-full" />
          </div>
          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary flex items-center gap-2 flex-1 justify-center">
              <RotateCcw size={15} /> Re-record
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary flex items-center gap-2 flex-1 justify-center"
            >
              {submitting
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Send size={15} />
              }
              {submitting ? 'Submitting...' : 'Submit Recording'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
    </div>
  )
}

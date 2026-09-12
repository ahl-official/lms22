import { useEffect, useRef } from 'react'
import { Link2, Youtube, Video, AlertCircle, Loader2, FileText } from 'lucide-react'
import useVideoDetector from '../../hooks/useVideoDetector'
import VideoPlayer from '../VideoPlayer'

export default function VideoInput({ value, onChange }) {
  const { videoInfo, detecting, detect } = useVideoDetector()
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (value) {
      debounceRef.current = setTimeout(() => detect(value), 600)
    }
    return () => clearTimeout(debounceRef.current)
  }, [value, detect])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="url"
          className="input-field pl-10 pr-10"
          placeholder="Paste YouTube, Gumlet, PDF, DOCX, Google Docs, or Drive URL..."
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
        {detecting && (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 animate-spin" />
        )}
      </div>

      {videoInfo?.source && (
        <div className="flex items-center gap-2 text-xs">
          {videoInfo.source === 'youtube' && (
            <span className="badge badge-red flex items-center gap-1"><Youtube size={10} /> YouTube detected</span>
          )}
          {videoInfo.source === 'gumlet' && (
            <span className="badge badge-blue flex items-center gap-1"><Video size={10} /> Gumlet detected</span>
          )}
          {videoInfo.source === 'unknown' && (
            videoInfo.content_type === 'pdf' || videoInfo.content_type === 'doc'
              ? <span className="badge badge-blue flex items-center gap-1"><FileText size={10} /> Document detected</span>
              : <span className="badge badge-gray flex items-center gap-1"><AlertCircle size={10} /> Unknown source</span>
          )}
        </div>
      )}

      {videoInfo?.url && (
        <VideoPlayer
          videoUrl={videoInfo.url}
          videoSource={videoInfo.source}
          contentType={videoInfo.content_type}
          embedUrl={videoInfo.embed_url}
          title="Preview"
        />
      )}
    </div>
  )
}

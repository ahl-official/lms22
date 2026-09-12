import { useState } from 'react'
import { ExternalLink, FileText, Play, Youtube, Video } from 'lucide-react'

const getYouTubeId = (url = '') => {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

const getGumletId = (url = '') => {
  const m = url.match(/(?:gumlet\.(?:com|io))\/[^/]+\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

const getDirectType = (url = '') => {
  const path = url.split('?')[0].toLowerCase()
  if (path.endsWith('.pdf')) return 'pdf'
  if (path.endsWith('.doc') || path.endsWith('.docx')) return 'doc'
  return 'unknown'
}

const getDocumentEmbedUrl = (url, embedUrl, contentType) => {
  if (embedUrl) return embedUrl
  if (!url) return null
  const type = contentType === 'unknown' ? getDirectType(url) : contentType
  if (type === 'pdf') return url
  if (type === 'doc') return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
  return null
}

export default function VideoPlayer({
  videoUrl,
  videoSource,
  title,
  onEnded,
  contentType = 'unknown',
  embedUrl = null,
}) {
  const [playing, setPlaying] = useState(false)
  const effectiveType = contentType === 'unknown' ? getDirectType(videoUrl) : contentType
  const isDocument = effectiveType === 'pdf' || effectiveType === 'doc'
  const documentEmbedUrl = getDocumentEmbedUrl(videoUrl, embedUrl, effectiveType)

  if (!videoUrl) {
    return (
      <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center">
        <p className="text-gray-400 text-sm">No content URL</p>
      </div>
    )
  }

  if (isDocument) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-brand-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{title || 'Lesson document'}</p>
              <p className="text-xs text-gray-400">{effectiveType === 'pdf' ? 'PDF notes' : 'Document notes'}</p>
            </div>
          </div>
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 flex-shrink-0"
          >
            <ExternalLink size={12} /> Open
          </a>
        </div>
        {documentEmbedUrl ? (
          <iframe
            src={documentEmbedUrl}
            title={title}
            className="w-full h-[70vh] bg-white"
            allow="fullscreen"
          />
        ) : (
          <div className="min-h-[280px] flex flex-col items-center justify-center text-center px-6">
            <FileText size={34} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600">This document cannot be embedded here.</p>
            <p className="text-xs text-gray-400 mt-1">Open it in a new tab to read the notes.</p>
          </div>
        )}
      </div>
    )
  }

  if (!playing) {
    return (
      <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden cursor-pointer group"
        onClick={() => setPlaying(true)}>
        {videoSource === 'youtube' && getYouTubeId(videoUrl) && (
          <img
            src={`https://img.youtube.com/vi/${getYouTubeId(videoUrl)}/hqdefault.jpg`}
            alt={title} className="w-full h-full object-cover opacity-70"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play size={24} className="text-gray-900 ml-1" fill="currentColor" />
          </div>
        </div>
        <div className="absolute top-3 right-3">
          {videoSource === 'youtube'
            ? <span className="badge badge-red flex items-center gap-1"><Youtube size={12} /> YouTube</span>
            : <span className="badge badge-blue flex items-center gap-1"><Video size={12} /> Gumlet</span>
          }
        </div>
      </div>
    )
  }

  if (videoSource === 'youtube') {
    const ytId = getYouTubeId(videoUrl)
    return (
      <div className="aspect-video rounded-xl overflow-hidden">
        <iframe
          width="100%" height="100%"
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
          title={title} frameBorder="0" allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          onEnded={onEnded}
        />
      </div>
    )
  }

  if (videoSource === 'gumlet') {
    const gumletId = getGumletId(videoUrl)
    return (
      <div className="aspect-video rounded-xl overflow-hidden">
        <iframe
          src={`https://play.gumlet.io/embed/${gumletId}?autoplay=true`}
          width="100%" height="100%" frameBorder="0"
          title={title} allowFullScreen allow="autoplay; fullscreen"
        />
      </div>
    )
  }

  return (
    <div className="aspect-video rounded-xl overflow-hidden bg-black">
      <video src={videoUrl} controls autoPlay className="w-full h-full" onEnded={onEnded} />
    </div>
  )
}

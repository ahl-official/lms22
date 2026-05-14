import { useState } from 'react'
import { Play, Youtube, Video } from 'lucide-react'

const getYouTubeId = (url = '') => {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

const getGumletId = (url = '') => {
  const m = url.match(/(?:gumlet\.(?:com|io))\/[^/]+\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

export default function VideoPlayer({ videoUrl, videoSource, title, onEnded }) {
  const [playing, setPlaying] = useState(false)

  if (!videoUrl) {
    return (
      <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center">
        <p className="text-gray-400 text-sm">No video URL</p>
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

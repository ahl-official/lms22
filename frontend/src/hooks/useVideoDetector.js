import { useState, useCallback } from 'react'
import { coursesAPI } from '../services/api'

const detectLocally = (url) => {
  const path = url.split('?')[0].toLowerCase()
  if (/youtu\.be|youtube\.com/i.test(url)) return { source: 'youtube', content_type: 'video' }
  if (/gumlet\.com|gumlet\.io/i.test(url)) return { source: 'gumlet', content_type: 'video' }
  if (/docs\.google\.com\/document/i.test(url)) return { source: 'unknown', content_type: 'doc' }
  if (/drive\.google\.com/i.test(url)) return { source: 'unknown', content_type: 'doc' }
  if (path.endsWith('.pdf')) return { source: 'unknown', content_type: 'pdf' }
  if (path.endsWith('.doc') || path.endsWith('.docx')) return { source: 'unknown', content_type: 'doc' }
  return { source: 'unknown', content_type: 'unknown' }
}

export default function useVideoDetector() {
  const [videoInfo, setVideoInfo] = useState(null)
  const [detecting, setDetecting] = useState(false)

  const detect = useCallback(async (url) => {
    if (!url) { setVideoInfo(null); return }
    const local = detectLocally(url)
    setVideoInfo({ url, source: local.source, content_type: local.content_type })
    setDetecting(true)
    try {
      const res = await coursesAPI.detectVideo(url)
      const detected = res.data?.detected
      setVideoInfo({
        url,
        source: res.data?.source || local.source,
        content_type: detected?.content_type || local.content_type,
        embed_url: detected?.embed_url || null,
      })
    } catch {
      setVideoInfo({ url, source: local.source, content_type: local.content_type })
    } finally {
      setDetecting(false)
    }
  }, [])

  const reset = useCallback(() => setVideoInfo(null), [])

  return { videoInfo, detecting, detect, reset }
}

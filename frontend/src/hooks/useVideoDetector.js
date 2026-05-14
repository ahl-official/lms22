import { useState, useCallback } from 'react'
import { coursesAPI } from '../services/api'

const detectLocally = (url) => {
  if (/youtu\.be|youtube\.com/i.test(url)) return 'youtube'
  if (/gumlet\.com|gumlet\.io/i.test(url)) return 'gumlet'
  return 'unknown'
}

export default function useVideoDetector() {
  const [videoInfo, setVideoInfo] = useState(null)
  const [detecting, setDetecting] = useState(false)

  const detect = useCallback(async (url) => {
    if (!url) { setVideoInfo(null); return }
    const localSource = detectLocally(url)
    setVideoInfo({ url, source: localSource })
    setDetecting(true)
    try {
      const res = await coursesAPI.detectVideo(url)
      setVideoInfo({ url, source: res.data?.source || localSource })
    } catch {
      setVideoInfo({ url, source: localSource })
    } finally {
      setDetecting(false)
    }
  }, [])

  const reset = useCallback(() => setVideoInfo(null), [])

  return { videoInfo, detecting, detect, reset }
}

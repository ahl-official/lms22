// backend/src/services/transcriptService.js
// FIXED: YouTube fetch was swallowing errors silently. Now throws clear messages.
// Added: language fallback list for YouTube, empty-result detection.

const { YoutubeTranscript } = require('youtube-transcript')
const { AssemblyAI } = require('assemblyai')

// ── Source detection ──────────────────────────────────────────────────────────
const detectVideoSource = (url = '') => {
  if (/youtu\.be|youtube\.com/i.test(url)) return 'youtube'
  if (/gumlet\.com|gumlet\.io/i.test(url)) return 'gumlet'
  return 'unknown'
}

const extractYouTubeId = (url) => {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

// ── YouTube ───────────────────────────────────────────────────────────────────
const fetchYouTubeTranscript = async (url) => {
  const videoId = extractYouTubeId(url)
  if (!videoId) throw new Error('Could not extract YouTube video ID from URL')

  // Try multiple languages in order
  const languages = ['en', 'en-US', 'en-GB', 'en-IN']
  let lines = null
  let lastError = null

  for (const lang of languages) {
    try {
      lines = await YoutubeTranscript.fetchTranscript(videoId, { lang })
      if (lines?.length) break
    } catch (err) {
      lastError = err
    }
  }

  // Final attempt with no language filter (accepts whatever YouTube returns)
  if (!lines?.length) {
    try {
      lines = await YoutubeTranscript.fetchTranscript(videoId)
    } catch (err) {
      lastError = err
    }
  }

  if (!lines?.length) {
    // Give the trainer a clear, actionable error
    throw new Error(
      'This YouTube video does not have captions/subtitles available. ' +
      'Either enable auto-generated captions on YouTube, or paste the transcript manually.'
    )
  }

  return lines
    .map(l => l.text)
    .join(' ')
    .replace(/\[.*?\]/g, '')   // remove [Music], [Applause] etc
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Gumlet ────────────────────────────────────────────────────────────────────
const extractGumletId = (url) => {
  const patterns = [
    /play\.gumlet\.io\/embed\/([A-Za-z0-9_-]+)/,
    /gumlet\.(?:com|io)\/[^/]+\/([A-Za-z0-9_-]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

const extractTextFromWordLevelJson = (data) => {
  if (Array.isArray(data?.words) && data.words.length > 0) {
    return data.words.map(w => w.word || w.text || '').join(' ').replace(/\s+/g, ' ').trim()
  }
  if (Array.isArray(data?.segments) && data.segments.length > 0) {
    return data.segments.map(s => s.text || '').join(' ').replace(/\s+/g, ' ').trim()
  }
  if (typeof data?.transcript === 'string' && data.transcript.length > 10) {
    return data.transcript.trim()
  }
  if (typeof data?.transcription === 'string' && data.transcription.length > 10) {
    return data.transcription.trim()
  }
  return null
}

const fetchGumletTranscript = async (url) => {
  const assetId = extractGumletId(url)
  if (!assetId) throw new Error('Could not extract Gumlet asset ID from URL')

  if (!process.env.GUMLET_API_KEY) {
    throw new Error(
      'GUMLET_API_KEY is not set in your .env file. ' +
      'Add it or paste the transcript manually.'
    )
  }

  const assetRes = await fetch(`https://api.gumlet.com/v1/video/assets/${assetId}`, {
    headers: { Authorization: `Bearer ${process.env.GUMLET_API_KEY}` },
  })

  if (!assetRes.ok) {
    throw new Error(
      `Gumlet API returned ${assetRes.status}. ` +
      'Check your GUMLET_API_KEY and make sure the asset ID is correct.'
    )
  }

  const asset = await assetRes.json()
  const transcriptionUrl = asset?.output?.transcription_word_level_timestamps

  if (!transcriptionUrl) {
    throw new Error(
      'Gumlet has not generated a transcription for this video yet. ' +
      'Enable "Generate Subtitles" in your Gumlet workspace settings, then reprocess the video. ' +
      'Or paste the transcript manually.'
    )
  }

  const tRes = await fetch(transcriptionUrl)
  if (!tRes.ok) throw new Error(`Failed to fetch Gumlet transcription file: ${tRes.status}`)

  const tData = await tRes.json()
  const text = extractTextFromWordLevelJson(tData)

  if (!text) {
    throw new Error(
      'Gumlet transcription file was fetched but contained no readable text. ' +
      'Try pasting the transcript manually.'
    )
  }

  return text
}

// ── AssemblyAI (for direct audio URLs and voice recordings) ──────────────────
const transcribeAudioUrl = async (audioUrl) => {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY is not set in your .env file.')
  }
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY })
  const transcript = await client.transcripts.transcribe({ audio_url: audioUrl })
  if (transcript.status === 'error') throw new Error(`AssemblyAI error: ${transcript.error}`)
  if (!transcript.text?.trim()) throw new Error('AssemblyAI returned an empty transcript.')
  return transcript.text
}

const transcribeAudioBuffer = async (buffer, contentType = 'audio/webm') => {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY is not set in your .env file.')
  }
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY })
  const uploadUrl = await client.files.upload(buffer, { contentType })
  const transcript = await client.transcripts.transcribe({ audio_url: uploadUrl })
  if (transcript.status === 'error') throw new Error(`AssemblyAI error: ${transcript.error}`)
  return transcript.text
}

// ── Main entry point ──────────────────────────────────────────────────────────
const fetchTranscript = async (url) => {
  const source = detectVideoSource(url)

  if (source === 'youtube') return fetchYouTubeTranscript(url)
  if (source === 'gumlet') return fetchGumletTranscript(url)

  // Unknown URL — try AssemblyAI as a last resort
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error(
      'This video source is not YouTube or Gumlet. ' +
      'To auto-transcribe other sources, add ASSEMBLYAI_API_KEY to your .env. ' +
      'Or paste the transcript manually.'
    )
  }
  return transcribeAudioUrl(url)
}

module.exports = {
  detectVideoSource,
  fetchTranscript,
  fetchYouTubeTranscript,
  fetchGumletTranscript,
  transcribeAudioBuffer,
  transcribeAudioUrl,
}
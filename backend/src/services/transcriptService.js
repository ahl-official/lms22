// backend/src/services/transcriptService.js
// Content text extraction for video, PDF, DOCX, Google Drive, and Google Docs links.

const axios = require('axios')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const { YoutubeTranscript } = require('youtube-transcript')
const { AssemblyAI } = require('assemblyai')

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const getUrlPath = (url = '') => {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return String(url).split('?')[0].toLowerCase()
  }
}

const extractYouTubeId = (url = '') => {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

const extractGumletId = (url = '') => {
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

const extractGoogleDocId = (url = '') => {
  const m = url.match(/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/i)
  return m ? m[1] : null
}

const extractDriveFileId = (url = '') => {
  const patterns = [
    /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i,
    /drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/i,
    /drive\.google\.com\/uc\?(?:.*&)?id=([A-Za-z0-9_-]+)/i,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('id')
  } catch {
    return null
  }
}

const detectContentSource = (url = '') => {
  const cleanUrl = String(url || '').trim()
  const path = getUrlPath(cleanUrl)
  const googleDocId = extractGoogleDocId(cleanUrl)
  const driveFileId = extractDriveFileId(cleanUrl)

  if (/youtu\.be|youtube\.com/i.test(cleanUrl)) {
    const videoId = extractYouTubeId(cleanUrl)
    return {
      content_type: 'video',
      content_source: 'youtube',
      video_source: 'youtube',
      embed_url: videoId ? `https://www.youtube.com/embed/${videoId}` : null,
      normalized_url: cleanUrl,
    }
  }

  if (/gumlet\.com|gumlet\.io/i.test(cleanUrl)) {
    const assetId = extractGumletId(cleanUrl)
    return {
      content_type: 'video',
      content_source: 'gumlet',
      video_source: 'gumlet',
      embed_url: assetId ? `https://play.gumlet.io/embed/${assetId}` : cleanUrl,
      normalized_url: cleanUrl,
    }
  }

  if (googleDocId) {
    return {
      content_type: 'doc',
      content_source: 'google_docs',
      video_source: 'unknown',
      embed_url: `https://docs.google.com/document/d/${googleDocId}/preview`,
      normalized_url: cleanUrl,
    }
  }

  if (driveFileId) {
    return {
      content_type: 'doc',
      content_source: 'google_drive',
      video_source: 'unknown',
      embed_url: `https://drive.google.com/file/d/${driveFileId}/preview`,
      normalized_url: cleanUrl,
    }
  }

  if (path.endsWith('.pdf')) {
    return {
      content_type: 'pdf',
      content_source: 'direct',
      video_source: 'unknown',
      embed_url: cleanUrl,
      normalized_url: cleanUrl,
    }
  }

  if (path.endsWith('.docx') || path.endsWith('.doc')) {
    return {
      content_type: 'doc',
      content_source: 'direct',
      video_source: 'unknown',
      embed_url: null,
      normalized_url: cleanUrl,
    }
  }

  return {
    content_type: 'unknown',
    content_source: 'unknown',
    video_source: 'unknown',
    embed_url: null,
    normalized_url: cleanUrl,
  }
}

const detectVideoSource = (url = '') => detectContentSource(url).video_source

const googleDocsExportUrl = (docId) => `https://docs.google.com/document/d/${docId}/export?format=txt`
const googleDriveDownloadUrl = (fileId) => `https://drive.google.com/uc?export=download&id=${fileId}`

const downloadBuffer = async (url) => {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    maxRedirects: 5,
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 LMS Content Fetcher',
      Accept: 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,*/*',
    },
  })
  return {
    buffer: Buffer.from(res.data),
    contentType: String(res.headers['content-type'] || '').toLowerCase(),
    finalUrl: res.request?.res?.responseUrl || url,
  }
}

const normalizeExtractedText = (text = '') => String(text).replace(/\s+/g, ' ').trim()

const extractTextFromPdf = async (buffer) => {
  const data = await pdfParse(buffer)
  const text = normalizeExtractedText(data.text)
  if (!text) throw new Error('The PDF was readable, but no text could be extracted from it.')
  return text
}

const extractTextFromDocx = async (buffer) => {
  const { value } = await mammoth.extractRawText({ buffer })
  const text = normalizeExtractedText(value)
  if (!text) throw new Error('The document was readable, but no text could be extracted from it.')
  return text
}

const fetchDocumentText = async (url, detected = detectContentSource(url)) => {
  const googleDocId = extractGoogleDocId(url)
  const driveFileId = extractDriveFileId(url)

  if (detected.content_source === 'google_docs' && googleDocId) {
    const res = await axios.get(googleDocsExportUrl(googleDocId), {
      responseType: 'text',
      timeout: 30000,
    })
    const text = normalizeExtractedText(res.data)
    if (!text) throw new Error('Google Docs export returned no readable text.')
    return text
  }

  const downloadUrl = detected.content_source === 'google_drive' && driveFileId
    ? googleDriveDownloadUrl(driveFileId)
    : url

  const { buffer, contentType, finalUrl } = await downloadBuffer(downloadUrl)
  const path = getUrlPath(finalUrl || url)

  if (contentType.includes('text/html')) {
    throw new Error(
      'Could not download the document text. If this is a Google Drive file, share it with "Anyone with the link" and try again.'
    )
  }

  if (detected.content_type === 'pdf' || contentType.includes('pdf') || path.endsWith('.pdf')) {
    return extractTextFromPdf(buffer)
  }

  if (
    contentType.includes(DOCX_MIME) ||
    contentType.includes('officedocument.wordprocessingml') ||
    path.endsWith('.docx')
  ) {
    return extractTextFromDocx(buffer)
  }

  if (path.endsWith('.doc')) {
    throw new Error('Old .doc files cannot be parsed automatically. Please upload/export it as DOCX or PDF.')
  }

  if (contentType.includes('text/plain')) {
    const text = normalizeExtractedText(buffer.toString('utf8'))
    if (text) return text
  }

  throw new Error('Unsupported document format. Use YouTube, Gumlet, PDF, DOCX, Google Docs, or a shareable Drive file.')
}

// YouTube
const fetchYouTubeTranscript = async (url) => {
  const videoId = extractYouTubeId(url)
  if (!videoId) throw new Error('Could not extract YouTube video ID from URL')

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

  if (!lines?.length) {
    try {
      lines = await YoutubeTranscript.fetchTranscript(videoId)
    } catch (err) {
      lastError = err
    }
  }

  if (!lines?.length) {
    throw new Error(
      'This YouTube video does not have captions/subtitles available. ' +
      'Either enable auto-generated captions on YouTube, use a PDF/DOCX/Google Docs note link, or paste the transcript manually.'
    )
  }

  return lines
    .map(l => l.text)
    .join(' ')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Gumlet
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
      'Add it, use a PDF/DOCX/Google Docs note link, or paste the transcript manually.'
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
      'Or use a PDF/DOCX/Google Docs note link.'
    )
  }

  const tRes = await fetch(transcriptionUrl)
  if (!tRes.ok) throw new Error(`Failed to fetch Gumlet transcription file: ${tRes.status}`)

  const tData = await tRes.json()
  const text = extractTextFromWordLevelJson(tData)

  if (!text) {
    throw new Error('Gumlet transcription file was fetched but contained no readable text.')
  }

  return text
}

// AssemblyAI for direct audio URLs and voice recordings.
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

const transcribeAudioBuffer = async (buffer, contentType = 'audio/webm', options = {}) => {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY is not set in your .env file.')
  }
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY })
  const uploadUrl = await client.files.upload(buffer, { contentType })

  const request = { audio_url: uploadUrl }
  const language = String(options.language || '').toLowerCase()
  if (language === 'hi' || language === 'hi-in') {
    // Force Hindi. Auto language detection often mislabels short Hinglish
    // clips as English and invents words like "Capita" for "meko kya pata".
    request.language_code = 'hi'
  } else if (language === 'en' || language === 'en-us' || language === 'en-in') {
    request.language_code = 'en'
  } else if (options.languageDetection) {
    request.language_detection = true
  }

  const transcript = await client.transcripts.transcribe(request)
  if (transcript.status === 'error') throw new Error(`AssemblyAI error: ${transcript.error}`)
  return transcript.text || ''
}

const hasDevanagari = (text = '') => /[\u0900-\u097F]/.test(text)

/**
 * Short English-looking STT output on a Hindi test is usually a mishear
 * (e.g. "Capita." for "मेको क्या पता"), not a real answer.
 */
const isWeakHindiTranscript = (text = '') => {
  const cleaned = String(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return true
  if (cleaned.length < 3) return true

  const words = cleaned.split(' ').filter(Boolean)
  if (hasDevanagari(cleaned)) return words.length === 0

  // Latin-only and very short → likely English hallucination on Hindi audio
  if (words.length <= 2 && cleaned.length <= 24) return true
  return false
}


const fetchTranscript = async (url) => {
  const detected = detectContentSource(url)

  if (detected.content_source === 'youtube') return fetchYouTubeTranscript(url)
  if (detected.content_source === 'gumlet') return fetchGumletTranscript(url)
  if (detected.content_type === 'pdf' || detected.content_type === 'doc') {
    return fetchDocumentText(url, detected)
  }

  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error(
      'Unsupported link for automatic text extraction. Use YouTube, Gumlet, PDF, DOCX, Google Docs, or a shareable Drive file.'
    )
  }
  return transcribeAudioUrl(url)
}

module.exports = {
  detectVideoSource,
  detectContentSource,
  fetchTranscript,
  fetchDocumentText,
  fetchYouTubeTranscript,
  fetchGumletTranscript,
  transcribeAudioBuffer,
  transcribeAudioUrl,
  isWeakHindiTranscript,
  hasDevanagari,
}

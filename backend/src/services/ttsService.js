const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const resolvePythonBinary = () => {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  if (process.platform !== 'win32') return 'python3';

  // A background Node process may not inherit the same PATH as an interactive
  // shell, so resolve the local interpreter explicitly when available.
  const localPython = 'C:\\Python314\\python.exe';
  return fs.existsSync(localPython) ? localPython : 'py';
};

const piperPythonPath = () => {
  // Piper is installed in the interpreter selected by PYTHON_BIN. Do not add
  // the failed/partial package directories to PYTHONPATH; they can shadow the
  // working virtual-environment package.
  return process.env.PYTHONPATH || '';
};

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

let piperWorker;
let piperWorkerBuffer = '';
let piperWorkerQueue = [];

const failPiperWorker = (error) => {
  const queued = piperWorkerQueue;
  piperWorkerQueue = [];
  piperWorker = null;
  piperWorkerBuffer = '';
  queued.forEach(({ reject }) => reject(error));
};

const startPiperWorker = () => {
  const modelPath = process.env.TTS_PIPER_MODEL || path.join(__dirname, '../../voices/hi_IN-pratham-medium.onnx');
  const configPath = process.env.TTS_PIPER_CONFIG || `${modelPath}.json`;
  const script = path.join(__dirname, 'piper_tts_worker.py');
  const child = spawn(resolvePythonBinary(), [script, modelPath, configPath], {
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONPATH: piperPythonPath(),
      PYTHONIOENCODING: 'utf-8',
    },
  });
  let errorText = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    piperWorkerBuffer += chunk;
    const lines = piperWorkerBuffer.split('\n');
    piperWorkerBuffer = lines.pop() || '';
    lines.filter(Boolean).forEach((line) => {
      const request = piperWorkerQueue.shift();
      if (!request) return;
      try {
        const response = JSON.parse(line);
        if (!response.audio) throw new Error('Piper worker returned no audio.');
        request.resolve(Buffer.from(response.audio, 'base64'));
      } catch (error) {
        request.reject(error);
      }
    });
  });
  child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
  child.on('error', (error) => failPiperWorker(error));
  child.on('close', (code) => {
    if (piperWorker === child) {
      failPiperWorker(new Error(errorText.trim() || `Piper worker exited with code ${code}`));
    }
  });
  piperWorker = child;
  return child;
};

const synthesizePiperSpeech = (text) => new Promise((resolve, reject) => {
  const worker = piperWorker || startPiperWorker();
  piperWorkerQueue.push({ resolve, reject });
  worker.stdin.write(`${JSON.stringify({ text: String(text).slice(0, 5000) })}\n`);
});

const sanitizeTtsText = (text) => String(text || '')
  .replace(/[\uD800-\uDFFF]/g, '')
  .normalize('NFC');

// Node Edge TTS works on Vercel (no Python). Prefer this path everywhere.
const synthesizeEdgeSpeechNode = async (text, voice) => {
  const { EdgeTTS } = require('edge-tts-universal');
  const tts = new EdgeTTS(sanitizeTtsText(text), voice, {
    rate: '-5%',
    pitch: '+0Hz',
  });
  const result = await tts.synthesize();
  if (!result?.audio) throw new Error('edge-tts-universal returned no audio.');
  const bytes = Buffer.from(await result.audio.arrayBuffer());
  if (!bytes.length) throw new Error('edge-tts-universal returned empty audio.');
  return bytes;
};

// Local Python bridge kept as backup when Node Edge fails off-Vercel.
const synthesizeEdgeSpeechPython = (text, voice) => new Promise((resolve, reject) => {
  const python = resolvePythonBinary();
  const script = path.join(__dirname, 'edge_tts_bridge.py');
  const child = spawn(python, [script], {
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
  });
  const chunks = [];
  let errorText = '';

  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0 && chunks.length) return resolve(Buffer.concat(chunks));
    reject(new Error(errorText.trim() || `edge-tts exited with code ${code}`));
  });

  // Send Devanagari/Hinglish as base64 so Windows stdin cannot corrupt UTF-8.
  const payload = JSON.stringify({
    text_b64: Buffer.from(sanitizeTtsText(text), 'utf8').toString('base64'),
    voice,
    rate: '-5%',
    pitch: '+0Hz',
  });
  child.stdin.end(Buffer.from(payload, 'utf8'));
});

const synthesizeEdgeSpeech = async (text, voice) => {
  try {
    return await synthesizeEdgeSpeechNode(text, voice);
  } catch (nodeErr) {
    // Vercel has no Python runtime — do not attempt the bridge there.
    if (process.env.VERCEL) throw nodeErr;
    console.warn('[tts:edge_node_failed_trying_python]', nodeErr.message);
    return synthesizeEdgeSpeechPython(text, voice);
  }
};

const withMime = (buffer, mimeType, provider) => {
  buffer.mimeType = mimeType;
  buffer.ttsProvider = provider;
  return buffer;
};

/**
 * Primary: Edge TTS (hi-IN-SwaraNeural / en-IN-NeerjaNeural)
 * Optional backup: Piper for Hindi only when TTS_PIPER_FALLBACK=true
 * (kept off by default so Edge can be tested in isolation)
 */
const synthesizeSpeech = async (text, language = 'en') => {
  const normalizedLanguage = language === 'hi' ? 'hi' : 'en';
  const provider = (process.env.TTS_PROVIDER || 'edge').toLowerCase();
  const piperFallbackEnabled = truthy(process.env.TTS_PIPER_FALLBACK);
  const clipped = String(text).slice(0, 5000);
  const edgeVoice = normalizedLanguage === 'hi'
    ? process.env.TTS_HI_VOICE || 'hi-IN-SwaraNeural'
    : process.env.TTS_EN_VOICE || 'en-IN-NeerjaNeural';

  // Explicit Piper-primary mode (local/dev only).
  if (provider === 'piper') {
    if (normalizedLanguage === 'hi') {
      try {
        return withMime(await synthesizePiperSpeech(clipped), 'audio/wav', 'piper');
      } catch (err) {
        const error = new Error(`Piper TTS failed: ${err.message}`);
        error.status = 503;
        error.cause = err;
        throw error;
      }
    }
    try {
      return withMime(await synthesizeEdgeSpeech(clipped, edgeVoice), 'audio/mpeg', 'edge');
    } catch (err) {
      const error = new Error(`English TTS failed: ${err.message}`);
      error.status = 503;
      error.cause = err;
      throw error;
    }
  }

  // Default / production path: Edge first.
  if (provider === 'edge' || provider === 'auto') {
    try {
      const audio = await synthesizeEdgeSpeech(clipped, edgeVoice);
      console.log('[tts:edge_ok]', { language: normalizedLanguage, voice: edgeVoice, bytes: audio.length });
      return withMime(audio, 'audio/mpeg', 'edge');
    } catch (edgeErr) {
      console.error('[tts:edge_failed]', {
        language: normalizedLanguage,
        voice: edgeVoice,
        message: edgeErr.message,
        piperFallbackEnabled,
      });

      // Piper backup is intentionally OFF unless TTS_PIPER_FALLBACK=true.
      if (normalizedLanguage === 'hi' && piperFallbackEnabled) {
        try {
          const audio = await synthesizePiperSpeech(clipped);
          console.warn('[tts:piper_fallback_used]', { bytes: audio.length });
          return withMime(audio, 'audio/wav', 'piper');
        } catch (piperErr) {
          const error = new Error(`Edge TTS failed and Piper fallback failed: ${piperErr.message}`);
          error.status = 503;
          error.cause = piperErr;
          throw error;
        }
      }

      const error = new Error(`Edge TTS failed: ${edgeErr.message}`);
      error.status = 503;
      error.cause = edgeErr;
      throw error;
    }
  }

  if (provider !== 'google') {
    const error = new Error(`Unknown TTS_PROVIDER "${provider}". Use edge, piper, or google.`);
    error.status = 503;
    throw error;
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    const error = new Error('GOOGLE_TTS_API_KEY is not configured.');
    error.status = 503;
    throw error;
  }

  const languageCode = normalizedLanguage === 'hi'
    ? process.env.GOOGLE_TTS_HI_LANGUAGE || 'hi-IN'
    : process.env.GOOGLE_TTS_EN_LANGUAGE || 'en-IN';
  const voiceName = normalizedLanguage === 'hi'
    ? process.env.GOOGLE_TTS_HI_VOICE || 'hi-IN-Wavenet-A'
    : process.env.GOOGLE_TTS_EN_VOICE || 'en-IN-Neural2-A';

  try {
    const response = await axios.post(`${GOOGLE_TTS_URL}?key=${encodeURIComponent(apiKey)}`, {
      input: { text: clipped },
      voice: { languageCode, name: voiceName },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.95,
        pitch: 0,
      },
    }, { timeout: 30000 });

    if (!response.data?.audioContent) {
      throw new Error('Google Cloud TTS returned no audio.');
    }

    return withMime(Buffer.from(response.data.audioContent, 'base64'), 'audio/mpeg', 'google');
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    const error = new Error(`Text-to-speech failed: ${detail}`);
    error.status = err.response?.status === 400 ? 502 : 503;
    error.cause = err;
    throw error;
  }
};

// Warm Piper only when it is the primary provider (not when sitting as disabled backup).
if ((process.env.TTS_PROVIDER || '').toLowerCase() === 'piper') {
  setImmediate(() => synthesizePiperSpeech('').catch(() => {}));
}

module.exports = { synthesizeSpeech };

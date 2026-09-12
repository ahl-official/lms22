import base64
import io
import json
import sys
import wave

from piper import PiperVoice


def main():
    model_path = sys.argv[1]
    config_path = sys.argv[2]
    voice = PiperVoice.load(model_path, config_path=config_path)

    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav_file:
            voice.synthesize_wav(str(request.get('text', ''))[:5000], wav_file)
        encoded = base64.b64encode(output.getvalue()).decode('ascii')
        sys.stdout.write(json.dumps({'audio': encoded}) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()

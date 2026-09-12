import io
import sys
import wave

from piper import PiperVoice


def main():
    model_path = sys.argv[1]
    config_path = sys.argv[2]
    text = sys.stdin.buffer.read().decode('utf-8')
    voice = PiperVoice.load(model_path, config_path=config_path)
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav_file:
        voice.synthesize_wav(text, wav_file)
    sys.stdout.buffer.write(output.getvalue())


if __name__ == '__main__':
    main()

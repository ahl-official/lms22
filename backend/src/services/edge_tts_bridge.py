import asyncio
import base64
import json
import sys


def read_request():
    raw = sys.stdin.buffer.read()
    if not raw:
        raise ValueError("No TTS request payload received on stdin")

    # Windows/Node can mangle Devanagari if stdin is decoded as a text encoding.
    # Prefer UTF-8 JSON; fall back to replacing undecodable bytes.
    try:
        payload = raw.decode("utf-8")
    except UnicodeDecodeError:
        payload = raw.decode("utf-8", errors="surrogatepass")

    request = json.loads(payload)

    # Preferred: base64 text avoids all Windows stdin encoding issues.
    if request.get("text_b64"):
        request["text"] = base64.b64decode(request["text_b64"]).decode("utf-8")
    elif isinstance(request.get("text"), str):
        # Strip lone surrogates that break edge-tts utf-8 encode.
        request["text"] = request["text"].encode("utf-8", errors="surrogatepass").decode("utf-8", errors="ignore")

    if not request.get("text"):
        raise ValueError("TTS text is required")
    if not request.get("voice"):
        raise ValueError("TTS voice is required")

    return request


async def main():
    import edge_tts

    request = read_request()
    communicate = edge_tts.Communicate(
        request["text"],
        request["voice"],
        rate=request.get("rate", "+0%"),
        pitch=request.get("pitch", "+0Hz"),
    )

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            sys.stdout.buffer.write(chunk["data"])
            sys.stdout.buffer.flush()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        sys.stderr.write(f"{exc}\n")
        sys.exit(1)

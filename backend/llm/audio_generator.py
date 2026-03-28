import os
import base64
import tempfile

from sarvamai import SarvamAI
from sarvamai.play import save

_client: SarvamAI | None = None


def _get_client() -> SarvamAI:
    global _client
    if _client is None:
        api_key = os.getenv("SARVAM_TOKEN")
        if not api_key:
            raise RuntimeError("SARVAM_TOKEN is not configured.")
        _client = SarvamAI(api_subscription_key=api_key)
    return _client


def generate_audio(transcript_text: str, lang: str = "hi-IN", output_file: str = "output1.wav"):
    """Generate audio and save to a file."""
    audio = _get_client().text_to_speech.convert(
        target_language_code=lang,
        text=transcript_text,
        model="bulbul:v3",
        speaker="shubh",
        pace=0.9,
    )
    save(audio, output_file)


def generate_audio_base64(transcript_text: str, lang: str = "hi-IN") -> str:
    """Generate audio and return as a base64-encoded string."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        generate_audio(transcript_text, lang, tmp.name)
        with open(tmp.name, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _decode_base64_audio(s: str) -> bytes:
    raw = s.strip()
    pad = (-len(raw)) % 4
    return base64.b64decode(raw + "=" * pad, validate=False)


def transcribe_audio_base64(
    audio_b64: str,
    *,
    language_code: str = "unknown",
    input_audio_codec: str = "webm",
) -> str:
    """Transcribe recorded speech to text (same Sarvam key as TTS)."""
    data = _decode_base64_audio(audio_b64)
    if len(data) > 25 * 1024 * 1024:
        raise ValueError("Audio payload too large (max 25 MB).")
    client = _get_client()
    resp = client.speech_to_text.transcribe(
        file=data,
        model="saaras:v3",
        mode="transcribe",
        language_code=language_code,
        input_audio_codec=input_audio_codec,
    )
    return (resp.transcript or "").strip()


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    transcript = "अब नीचे दिए गए 'Proceed to Checkout' बटन को दबाएं।"
    generate_audio(transcript[:2500])

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.app.models.schemas import (
    AudioRequest,
    AudioResponse,
    GuideRequest,
    GuideResponse,
    ActionInstruction,
)
from backend.llm.audio_generator import generate_audio_base64
from backend.llm.instructions import get_next_action

_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / "backend" / "llm" / ".env")

logger = logging.getLogger(__name__)

app = FastAPI(
    title="UncDoIt API",
    version="0.2.0",
    description="Backend for the UncDoIt browser-extension tutorial overlay.",
)

_cors_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
]
if not _cors_origins:
    _cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_env(name: str) -> None:
    if not os.getenv(name):
        raise HTTPException(503, f"{name} is not configured.")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/guide", response_model=GuideResponse)
def guide(body: GuideRequest):
    """Main endpoint: returns the next tutorial step instruction + audio (base64).

    The frontend sends page context and interactive elements extracted by
    extractNaviElements(). The backend calls the LLM to determine the next
    action the user should take, generates voice audio for the instruction,
    and returns both in a single response.
    """
    _require_env("GOOGLE_API_KEY")

    try:
        result = get_next_action(
            query=body.query,
            elements=[el.model_dump() for el in body.elements],
            steps_completed=body.steps_completed,
            page_context=body.page_context.model_dump(),
        )
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(502, f"LLM error: {e}") from e

    instruction = ActionInstruction(**result)

    audio_b64 = None
    transcription = result.get("transcription", "").strip()
    if transcription and os.getenv("SARVAM_TOKEN"):
        try:
            audio_b64 = generate_audio_base64(
                transcript_text=transcription[:2500],
                lang=result.get("lang", "hi-IN"),
            )
        except Exception:
            logger.exception("Audio generation failed; returning instruction without audio")

    return GuideResponse(instruction=instruction, audio_base64=audio_b64)


@app.post("/api/audio", response_model=AudioResponse)
def audio(body: AudioRequest):
    """Standalone TTS endpoint — returns base64-encoded WAV audio."""
    _require_env("SARVAM_TOKEN")

    try:
        b64 = generate_audio_base64(
            transcript_text=body.text,
            lang=body.lang,
        )
    except Exception as e:
        logger.exception("Audio generation failed")
        raise HTTPException(502, f"Audio error: {e}") from e

    return AudioResponse(audio_base64=b64)

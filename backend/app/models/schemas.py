"""Pydantic models for the UncDoIt API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Shared types ─────────────────────────────────────────────────────

SUPPORTED_LANGS = Literal[
    "hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN",
    "kn-IN", "ml-IN", "mr-IN", "pa-IN", "od-IN", "en-IN",
]

ACTION_TYPE = Literal["click", "type", "scroll", "wait"]


# ── Frontend data shapes (mirrors pagecontext.js output) ────────────

class NaviElement(BaseModel):
    """A single interactive element on the page, tagged with a navi_id."""

    navi_id: int
    tag: str
    id: str = ""
    text: str = ""
    context: str = ""


class PageContext(BaseModel):
    """High-level metadata about the current page."""

    title: str = ""
    url: str = ""
    path: str = ""
    pageText: str = ""


# ── /api/guide ───────────────────────────────────────────────────────

class GuideRequest(BaseModel):
    """Payload sent by the extension to get the next tutorial step."""

    query: str = Field(..., min_length=1, description="What the user wants to accomplish.")
    elements: list[NaviElement] = Field(..., description="Interactive elements from extractNaviElements().")
    page_context: PageContext = Field(default_factory=PageContext)
    steps_completed: list[str] = Field(default_factory=list)


class ActionInstruction(BaseModel):
    """The LLM's single-step instruction output."""

    current_task: str
    navi_id: int
    voice_text: str
    action: ACTION_TYPE
    value: str
    is_done: bool
    lang: SUPPORTED_LANGS
    transcription: str


class GuideResponse(BaseModel):
    """Combined instruction + audio returned to the extension."""

    instruction: ActionInstruction
    audio_base64: str | None = Field(
        default=None,
        description="WAV audio of the transcription, base64-encoded. None if TTS is unavailable.",
    )


# ── /api/audio (standalone TTS) ─────────────────────────────────────

class AudioRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)
    lang: SUPPORTED_LANGS = "hi-IN"


class AudioResponse(BaseModel):
    audio_base64: str


# ── /api/transcribe (speech-to-text) ────────────────────────────────

class TranscribeRequest(BaseModel):
    """Recorded audio from the extension (e.g. MediaRecorder WebM/Opus)."""

    audio_base64: str = Field(..., min_length=1, max_length=12_000_000)
    language_code: str = Field(
        default="unknown",
        description="Sarvam language code or 'unknown' for auto-detect.",
    )
    input_audio_codec: str = Field(
        default="webm",
        description="Codec hint matching the recording (e.g. webm, wav, mp3).",
    )


class TranscribeResponse(BaseModel):
    text: str = Field(..., description="Transcribed user speech.")

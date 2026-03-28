import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from backend.llm.audio_generator import generate_audio
from backend.llm.instructions import get_next_action
from backend.app.routes.analyze import router as analyze_router

_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / "backend" / ".env")

app = FastAPI(title="uncJustClick API", version="0.1.0")
app.include_router(analyze_router)

_cors_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
]
if not _cors_origins:
    _cors_origins = ["*"]
_cors_credentials = "*" not in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _unlink_quiet(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


class NextActionBody(BaseModel):
    query: str = Field(..., min_length=1)
    html: str = Field(..., min_length=1)
    steps_completed: list[str] = Field(default_factory=list)


class AudioBody(BaseModel):
    transcript_text: str = Field(..., min_length=1, max_length=2500)
    lang: str = "hi-IN"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/next-action")
def next_action(body: NextActionBody):
    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_API_KEY is not configured.",
        )
    try:
        return get_next_action(
            query=body.query,
            html=body.html,
            steps_completed=body.steps_completed,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/api/audio")
def audio(body: AudioBody):
    if not os.getenv("SARVAM_TOKEN"):
        raise HTTPException(
            status_code=503,
            detail="SARVAM_TOKEN is not configured.",
        )
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        generate_audio(
            transcript_text=body.transcript_text,
            lang=body.lang,
            output_file=tmp.name,
        )
        return FileResponse(
            tmp.name,
            media_type="audio/wav",
            filename="instruction.wav",
            background=BackgroundTask(_unlink_quiet, tmp.name),
        )
    except Exception as e:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise HTTPException(status_code=502, detail=str(e)) from e

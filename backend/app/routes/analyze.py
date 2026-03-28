"""POST /analyze — convert natural-language intent into browser actions."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from backend.app.models.schemas import AnalyzeRequest, AnalyzeResponse, ActionStep
from backend.app.services.ai_engine import generate_actions
from backend.app.services.validator import validate_actions

router = APIRouter(tags=["analyze"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest):
    """Accept user intent + structured UI context and return action steps."""

    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_API_KEY is not configured.",
        )

    ctx = body.context

    try:
        raw_steps = generate_actions(
            user_intent=body.user_intent,
            buttons=ctx.buttons,
            inputs=ctx.inputs,
            links=ctx.links,
            text=ctx.text,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    # Strip any hallucinated targets the LLM may have produced
    clean_steps = validate_actions(
        steps=raw_steps,
        buttons=ctx.buttons,
        inputs=ctx.inputs,
        links=ctx.links,
        text=ctx.text,
    )

    return AnalyzeResponse(
        steps=[ActionStep(**s) for s in clean_steps],
    )

"""Pydantic models for the /analyze endpoint."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Request ──────────────────────────────────────────────────────────

class UIContext(BaseModel):
    """Structured representation of interactive elements on a webpage."""

    buttons: list[str] = Field(default_factory=list, examples=[["Add to Cart", "Buy Now"]])
    inputs: list[str] = Field(default_factory=list, examples=[["Enter address"]])
    links: list[str] = Field(default_factory=list, examples=[["Go to Cart"]])
    text: list[str] = Field(default_factory=list, examples=[["Product details"]])


class AnalyzeRequest(BaseModel):
    """Payload sent by the browser extension to request action planning."""

    user_intent: str = Field(
        ...,
        min_length=1,
        examples=["Buy this product"],
        description="Natural-language description of what the user wants to do.",
    )
    context: UIContext


# ── Response ─────────────────────────────────────────────────────────

class ActionStep(BaseModel):
    """A single browser action to be executed."""

    action: Literal["click", "type", "scroll", "select", "navigate"] = Field(
        ...,
        description="Kind of browser action.",
    )
    target: str = Field(
        ...,
        description="Label of the UI element to act on (must exist in context).",
    )
    value: str | None = Field(
        default=None,
        description="Value to type or select, if applicable.",
    )


class AnalyzeResponse(BaseModel):
    """Structured step-by-step action plan returned to the extension."""

    steps: list[ActionStep]

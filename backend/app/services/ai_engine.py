"""AI decision engine — converts user intent + UI context into action steps."""

from __future__ import annotations

import json
import os

from google import genai
from google.genai import types

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Lazy-initialise the Gemini client so the module can be imported
    even if the API key isn't set yet (e.g. during testing)."""
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured.")
        _client = genai.Client(api_key=api_key)
    return _client


_SYSTEM_PROMPT = """\
You are ActionPlanner — an AI that converts natural-language user intent into
a minimal sequence of browser actions.

RULES
1. You receive the user's intent and a structured description of every
   interactive element currently visible on the page (buttons, inputs, links,
   and text).
2. Return ONLY actions whose 'target' field matches one of the provided
   element labels.  NEVER invent or hallucinate elements.
3. Use semantic understanding — "Buy Now", "Order", "Purchase" are equivalent.
   Pick the best match from the available elements.
4. Keep the sequence as short as possible.
5. If an action requires typing text (e.g. a search query), set action to
   "type" and put the text in "value".
6. If no sensible action can be determined, return an empty steps list.
7. Return strict JSON only — no markdown, no commentary.\
"""


def _build_user_prompt(
    user_intent: str,
    buttons: list[str],
    inputs: list[str],
    links: list[str],
    text: list[str],
) -> str:
    ctx = {
        "buttons": buttons,
        "inputs": inputs,
        "links": links,
        "text": text,
    }
    return (
        f"User intent: {user_intent}\n\n"
        f"Available UI elements:\n{json.dumps(ctx, indent=2)}\n\n"
        "Return the step-by-step action plan as JSON."
    )


# Gemini structured-output schema
_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "steps": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "action": {
                        "type": "STRING",
                        "enum": ["click", "type", "scroll", "select", "navigate"],
                    },
                    "target": {"type": "STRING"},
                    "value": {"type": "STRING"},
                },
                "required": ["action", "target"],
            },
        }
    },
    "required": ["steps"],
}


def generate_actions(
    user_intent: str,
    buttons: list[str],
    inputs: list[str],
    links: list[str],
    text: list[str],
) -> list[dict]:
    """Call Gemini and return a list of raw action-step dicts."""

    client = _get_client()
    prompt = _build_user_prompt(user_intent, buttons, inputs, links, text)

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=_RESPONSE_SCHEMA,
            temperature=0.1,
            max_output_tokens=2048,
        ),
    )

    data = json.loads(response.text)
    return data.get("steps", [])

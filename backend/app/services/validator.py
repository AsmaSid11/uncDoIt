"""Post-LLM validation — strips hallucinated targets from action steps."""

from __future__ import annotations


def _normalise(label: str) -> str:
    """Lower-case and collapse whitespace for comparison."""
    return " ".join(label.lower().split())


def validate_actions(
    steps: list[dict],
    buttons: list[str],
    inputs: list[str],
    links: list[str],
    text: list[str],
) -> list[dict]:
    """Return only those steps whose *target* exists in the provided context.

    Matching is case-insensitive and whitespace-normalised so that minor
    differences (e.g. "Buy now" vs "Buy Now") don't cause false rejections.
    """

    known_labels = {
        _normalise(lbl)
        for group in (buttons, inputs, links, text)
        for lbl in group
    }

    validated: list[dict] = []
    for step in steps:
        target = step.get("target", "")
        if _normalise(target) in known_labels:
            validated.append(step)
        # Silently drop hallucinated targets

    return validated

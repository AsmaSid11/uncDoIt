import os
import json
from google import genai
from google.genai import types

from dotenv import load_dotenv
from audio_generator import generate_audio

load_dotenv()

_client: genai.Client | None = None

def _get_client() -> genai.Client:
    """Lazy-initialise the Gemini client."""
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured.")
        _client = genai.Client(api_key=api_key)
    return _client


def get_next_action(
    query: str,
    elements: list[dict],
    steps_completed: list[str],
    page_context: dict | None = None
) -> dict:
    page_context = page_context or {}

    system_prompt = """You are NaviGuide — an AI that helps first-time internet users complete tasks on websites.
Your job is to look at the interactive elements of a webpage, the surrounding page context, infer what the user is trying to do, and return the single next action the user must take.

Rules:
- Infer the current_task from the user query, the interactive elements, and the page context. Do not expect it to be told to you.
- One step at a time. Never give two actions at once.
- voice_text must be extremely simple. Imagine speaking to someone who has never used a smartphone before.
- Every element has a navi_id. Return the navi_id of the element the user should interact with next.
- Use the context field of each element to understand what section of the page it belongs to.
- Use the page context to understand the page purpose, headings, instructions, and visible text around the elements.
- Prefer the interactive elements when choosing the next action, and use page context only to improve understanding.
- If the task is already complete based on steps_completed, set is_done to true and explain in voice_text.
- If you cannot find the right element, set navi_id to -1 and explain in voice_text.
- Detect the language from the user query and set lang to the correct language code.
- transcription is the voice_text written in the native script of that language."""

    prompt = f"""User query: {query}
Steps already completed: {json.dumps(steps_completed, ensure_ascii=False)}

Page context:
{json.dumps(page_context, ensure_ascii=False, indent=2)}

Interactive elements on the current page:
{json.dumps(elements, ensure_ascii=False, indent=2)}

Infer the task from the query, page context, and elements, then return the single next action the user should take."""

    response = _get_client().models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "current_task":  {"type": "STRING"},
                    "navi_id":       {"type": "INTEGER"},
                    "voice_text":    {"type": "STRING"},
                    "action":        {"type": "STRING", "enum": ["click", "type", "scroll", "wait"]},
                    "value":         {"type": "STRING"},
                    "is_done":       {"type": "BOOLEAN"},
                    "lang":          {"type": "STRING", "enum": ["hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "od-IN", "en-IN"]},
                    "transcription": {"type": "STRING"}
                },
                "required": ["current_task", "navi_id", "voice_text", "action", "value", "is_done", "lang", "transcription"]
            },
            temperature=0.1,
            max_output_tokens=8096,
        )
    )

    return json.loads(response.text)


if __name__ == "__main__":
    test_page_context = {
        "title": "Traffic Challan Payment",
        "url": "https://example.com/challan",
        "path": "/challan",
        "pageText": "Use this page to check challan details, enter your vehicle number, and continue to payment."
    }

    test_elements = [
        {"navi_id": 0, "tag": "A", "id": "", "text": "Check Online Services", "context": "Main navigation menu"},
        {"navi_id": 1, "tag": "A", "id": "", "text": "Report / Dashboard", "context": "Main navigation menu"},
        {"navi_id": 2, "tag": "A", "id": "", "text": "Grievance", "context": "Main navigation menu"},
        {"navi_id": 3, "tag": "A", "id": "", "text": "Pay Online", "context": "Main navigation menu"},
        {"navi_id": 4, "tag": "INPUT", "id": "txtVehicleNo", "text": "", "context": "Enter vehicle number to get challan details"},
        {"navi_id": 5, "tag": "BUTTON", "id": "btnSearch", "text": "GET DETAIL", "context": "Enter vehicle number to get challan details"},
        {"navi_id": 6, "tag": "A", "id": "", "text": "Contact Us", "context": "Footer"}
    ]

    action = get_next_action(
        query="I need help with paying my car's challan",
        elements=test_elements,
        steps_completed=[],
        page_context=test_page_context
    )

    print(json.dumps(action, ensure_ascii=False, indent=2))
generate_audio(
        transcript_text=action["transcription"],
        lang=action["lang"],
)
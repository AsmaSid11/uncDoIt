import os
import json
from google import genai
from google.genai import types
from audio_generator import generate_audio
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


def get_next_action(
    query: str,
    html: str,
    steps_completed: list[str]
) -> dict:

    system_prompt = """You are NaviGuide — an AI that helps first-time internet users complete tasks on websites.
Your job is to look at the current state of a webpage, infer what the user is trying to do, and return the single next action the user must take.

Rules:
- Infer the current_task from the user query and the HTML on the page. Do not expect it to be told to you.
- One step at a time. Never give two actions at once.
- voice_text must be extremely simple. Imagine speaking to someone who has never used a smartphone before.
- Every interactive element in the HTML has a data-navi-id attribute stamped on it. Return the navi_id of the element the user should interact with next.
- If the task is already complete based on steps_completed, set is_done to true and explain in voice_text.
- If you cannot find the right element, set navi_id to -1 and explain in voice_text.
- Detect the language from the user query and set lang to the correct language code.
- transcription is the voice_text written in the native script of that language."""

    prompt = f"""User query: {query}
Steps already completed: {json.dumps(steps_completed)}

Current page parsed HTML (every interactive element has a data-navi-id) details:
{html}

Infer the task from the query and page, then return the single next action the user should take."""

    response = client.models.generate_content(
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
    test_html = """
    [
    {
        "tag": "A",
        "id": "",
        "text": "Check Online Services"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Report / Dashboard"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Grievance"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Pay Online"
    },
    {
        "tag": "A",
        "id": "",
        "text": "GET DETAIL"
    },
    {
        "tag": "BUTTON",
        "id": "btnSearch",
        "text": "GET DETAIL"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Terms of Use |"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Privacy Policy |"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Copyright Policy |"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Hyperlink Policy |"
    },
    {
        "tag": "A",
        "id": "",
        "text": "Contact Us"
    }
]
    """

    action = get_next_action(
        query="I need help with paying my car's challan",
        html=test_html,
        steps_completed=[
            "Tap on the button that says Pay Online."
        ]
    )

    print(json.dumps(action, ensure_ascii=False, indent=2))
    # generate_audio(
    # transcript_text=action['transcription'],
    # lang=action['lang']
    # )
    
import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv
from audio_generator import generate_audio

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
- selector must be the most specific CSS selector you can find from the HTML provided.
- If the task is already complete based on steps_completed, set is_done to true and explain in voice_text.
- If you cannot find the right element, set selector to empty string and explain in voice_text.
- Detect the language from the user query and set lang to the correct language code.
- transcription is the voice_text written in the native script of that language."""

    prompt = f"""User query: {query}
Steps already completed: {json.dumps(steps_completed)}

Current page HTML:
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
                    "selector":      {"type": "STRING"},
                    "voice_text":    {"type": "STRING"},
                    "action":        {"type": "STRING", "enum": ["click", "type", "scroll", "wait"]},
                    "value":         {"type": "STRING"},
                    "is_done":       {"type": "BOOLEAN"},
                    "lang":          {"type": "STRING", "enum": ["hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "od-IN", "en-IN"]},
                    "transcription": {"type": "STRING"}
                },
                "required": ["current_task", "selector", "voice_text", "action", "value", "is_done", "lang", "transcription"]
            },
            temperature=0.1,
            max_output_tokens=8096,
        )
    )

    return json.loads(response.text)


if __name__ == "__main__":
    test_html = """
    <html>
<body>
    <nav>
        <div class="logo">Swiggy - Checkout</div>
        <button class="back-btn">Go Back</button>
    </nav>

    <div class="checkout-container">
        <h2>Delivery Address</h2>
        <div class="address-section" id="address-selection">
            <p>You haven't added an address yet.</p>
            <button id="add-new-address" class="add-address-btn">Add New Address</button>
        </div>

        <div class="order-summary" id="summary">
            <h3>Order Summary</h3>
            <div class="summary-item">
                <span>Chicken Biryani (x1)</span>
                <span>₹220</span>
            </div>
            <div class="bill-details">
                <div>Item Total: ₹220</div>
                <div>Delivery Fee: ₹30</div>
                <div style="font-weight: bold;">Grand Total: ₹250</div>
            </div>
        </div>

        <div class="payment-section">
            <button id="make-payment" class="pay-btn" disabled>Proceed to Pay</button>
            <p class="error-msg" id="address-warning">Please add an address to continue</p>
        </div>
    </div>
</body>
</html>
    """

    action = get_next_action(
        query="मुझे चिकन बिरयानी ऑर्डर करनी है",
        html=test_html,
        steps_completed=[
            "opened swiggy homepage",
            "clicked on Biryani Place restaurant",
            "saw the menu with biryani options",
            "clicked ADD on Chicken Biryani",
            "Clicked on proceed to checkout"
        ]
    )

    generate_audio(
    transcript_text=action['transcription'],
    lang=action['lang']
    )
    
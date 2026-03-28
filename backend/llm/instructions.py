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

Current page HTML (every interactive element has a data-navi-id):
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
    <html>
    <body>
        <nav>
            <div class="logo">Swiggy</div>
            <input data-navi-id="0" id="search-bar" class="search-input" type="text" placeholder="Search for restaurants and food"/>
            <button data-navi-id="1" class="search-btn">Search</button>
        </nav>

        <div class="menu-section" id="menu">
            <h2>Biryani Place — Menu</h2>
            <div class="menu-item" id="item-1">
                <span class="item-name">Chicken Biryani</span>
                <span class="item-price">₹220</span>
                <p class="item-desc">Aromatic basmati rice with tender chicken pieces</p>
                <div class="item-counter">
                    <button data-navi-id="2" class="decrease-btn" data-item="chicken-biryani">-</button>
                    <span class="item-count">1</span>
                    <button data-navi-id="3" class="increase-btn" data-item="chicken-biryani">+</button>
                </div>
            </div>
            <div class="menu-item" id="item-2">
                <span class="item-name">Mutton Biryani</span>
                <span class="item-price">₹320</span>
                <p class="item-desc">Slow cooked mutton with fragrant spices</p>
                <button data-navi-id="4" class="add-to-cart-btn" data-item="mutton-biryani">ADD</button>
            </div>
            <div class="menu-item" id="item-3">
                <span class="item-name">Veg Biryani</span>
                <span class="item-price">₹160</span>
                <p class="item-desc">Fresh vegetables with saffron rice</p>
                <button data-navi-id="5" class="add-to-cart-btn" data-item="veg-biryani">ADD</button>
            </div>
        </div>

        <div class="cart-section" id="cart">
            <h3>Your Cart</h3>
            <div class="cart-items" id="cart-items">
                <div class="cart-item">
                    <span class="cart-item-name">Chicken Biryani</span>
                    <span class="cart-item-qty">x1</span>
                    <span class="cart-item-price">₹220</span>
                </div>
            </div>
            <div class="cart-total" id="cart-total">Total: ₹220</div>
            <button data-navi-id="6" class="proceed-btn" id="proceed-to-checkout">Proceed to Checkout</button>
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
            "clicked ADD on Chicken Biryani"
        ]
    )

    print(json.dumps(action, ensure_ascii=False, indent=2))
    generate_audio(
    transcript_text=action['transcription'],
    lang=action['lang']
    )
    
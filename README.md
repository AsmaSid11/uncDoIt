# UncDoIt

**A GPS for the web** — a browser extension that guides first-time internet users through any website, one step at a time, with voice instructions in 11 Indian languages.

Built for the **"Build for the Next 1 Billion Users"** hackathon.

---

## The Problem

Hundreds of millions of people in India are coming online for the first time. Government forms, e-commerce checkouts, banking portals — every website is a maze of dropdowns, buttons, and jargon they've never seen before. They don't need simpler websites. They need someone sitting next to them, pointing at the screen and saying *"press this button now"* — in their own language.

## The Solution

UncDoIt is a Chrome extension that overlays any webpage with step-by-step visual guidance. Tell it what you want to do — in Hindi, Tamil, Bengali, or any supported language — and it:

1. **Scans** every interactive element on the page
2. **Highlights** exactly which element to interact with
3. **Tells you what to do** in plain, jargon-free language ("Touch the long white box at the top" instead of "Focus the input field")
4. **Speaks the instruction aloud** in your language
5. **Automatically advances** to the next step when you complete the current one
6. **Survives page navigations** — submit a form, click a link, the guide picks right back up

---

## Architecture

```
Browser Extension                    Backend (FastAPI)
┌──────────────┐                    ┌──────────────────┐
│  content.js  │──── POST ─────────>│  /api/guide      │
│  - scans DOM │     /api/guide     │  - Gemini LLM    │
│  - overlay   │<───────────────────│  - Sarvam TTS    │
│  - highlight │  { instruction,    │  - returns next   │
│  - audio     │    audio_base64 }  │    step + audio   │
└──────────────┘                    └──────────────────┘
```

**One API call per step.** The extension sends the page context (title, URL, visible text) and every interactive element (tagged with a `data-navi-id`). The backend determines the single next action and generates voice audio — both returned in one response.

---

## Supported Languages

| Language   | Code    | Language   | Code    |
|------------|---------|------------|---------|
| Hindi      | hi-IN   | Kannada    | kn-IN   |
| Bengali    | bn-IN   | Malayalam  | ml-IN   |
| Tamil      | ta-IN   | Marathi    | mr-IN   |
| Telugu     | te-IN   | Punjabi    | pa-IN   |
| Gujarati   | gu-IN   | Odia       | od-IN   |
| English    | en-IN   |            |         |

The language is auto-detected from the user's query.

---

## Project Structure

```
uncDoIt/
├── extension/              # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js          # Overlay, spotlight, step watchers, auto-advance
│   ├── content.css         # Overlay styles + spinner
│   ├── background.js       # Service worker — proxies API calls
│   ├── popup.html/js/css   # Extension popup UI
│   └── voice-bridge.js     # Mic recording bridge
│
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app — /api/guide, /api/audio, /health
│   │   └── models/
│   │       └── schemas.py  # Pydantic models (request/response shapes)
│   ├── llm/
│   │   ├── instructions.py # Gemini LLM — determines next action
│   │   ├── audio_generator.py  # Sarvam TTS — text to speech
│   │   └── doc.md          # Language codes & limits reference
│   └── API.md              # Full API documentation
│
├── frontend/               # Reference scripts (context extraction prototypes)
├── requirements.txt
└── .env                    # API keys (not committed)
```

---

## Setup

### Prerequisites

- Python 3.11+
- Chrome or Chromium-based browser
- API keys:
  - [Google Gemini](https://aistudio.google.com/apikey) (`GOOGLE_API_KEY`)
  - [Sarvam AI](https://www.sarvam.ai/) (`SARVAM_TOKEN`)

### Backend

```bash
# Clone the repo
git clone https://github.com/AsmaSid11/uncDoIt.git
cd uncDoIt

# Create virtual environment
python -m venv venv
source venv/bin/activate      # Linux/Mac
venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Create .env with your keys
echo GOOGLE_API_KEY=your-gemini-key > .env
echo SARVAM_TOKEN=your-sarvam-key >> .env

# Run the server
uvicorn backend.app.main:app --reload
```

The API is live at `http://127.0.0.1:8000`. Interactive docs at `/docs`.

### Extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. The UncDoIt icon appears in your toolbar

---

## Usage

1. Navigate to any website (e.g., a PAN card application form, Amazon, a banking portal)
2. Click the UncDoIt extension icon
3. Type your goal — e.g., *"मुझे नया PAN card चाहिए"* or *"I want to buy a laptop"*
4. Click **Start guide**
5. Follow the highlighted elements. The guide auto-advances as you complete each step.
6. Press **Escape** or click **×** to stop at any time.

---

## API Endpoints

| Method | Path          | Description                                    |
|--------|---------------|------------------------------------------------|
| GET    | `/health`     | Health check                                   |
| POST   | `/api/guide`  | Get next step instruction + voice audio (base64) |
| POST   | `/api/audio`  | Standalone text-to-speech                      |

See [`backend/API.md`](backend/API.md) for full request/response documentation with examples.

---

## Tech Stack

| Component      | Technology                          |
|----------------|-------------------------------------|
| Extension      | Chrome Manifest V3, Shadow DOM      |
| Backend        | Python, FastAPI, Uvicorn            |
| LLM            | Google Gemini (gemini-3.1-flash-lite-preview) |
| Text-to-Speech | Sarvam AI (bulbul:v3)               |
| Data Models    | Pydantic v2                         |

---

## Team

Built with care for the next billion users.

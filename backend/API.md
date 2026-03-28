# UncDoIt API Documentation

Base URL: `http://localhost:8000`

Interactive docs (Swagger UI) available at `/docs` when the server is running.

---

## Setup

### Environment variables

Create a `.env` file at the project root with:

```
GOOGLE_API_KEY=<your-gemini-api-key>
SARVAM_TOKEN=<your-sarvam-api-key>
CORS_ORIGINS=*                        # comma-separated origins, or * for all
```

### Install & run

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

---

## Endpoints

### `GET /health`

Health check.

**Response**

```json
{ "status": "ok" }
```

---

### `POST /api/guide`

Main endpoint. Accepts the current page state from the browser extension and returns:
- The single next action the user should take
- Base64-encoded WAV audio of the voice instruction

#### Request body

| Field              | Type             | Required | Description                                          |
|--------------------|------------------|----------|------------------------------------------------------|
| `query`            | string           | yes      | What the user wants to accomplish (e.g. "Apply for PAN card") |
| `elements`         | NaviElement[]    | yes      | Interactive elements on the page (from `extractNaviElements()`) |
| `page_context`     | PageContext      | no       | Page metadata (title, url, path, pageText)           |
| `steps_completed`  | string[]         | no       | Voice-text of steps already completed in this session |

**NaviElement**

| Field     | Type   | Description                              |
|-----------|--------|------------------------------------------|
| `navi_id` | int    | Unique ID assigned via `data-navi-id`    |
| `tag`     | string | HTML tag name (BUTTON, INPUT, SELECT...) |
| `id`      | string | Element's DOM id (if any)                |
| `text`    | string | Visible text / placeholder / value       |
| `context` | string | Nearest heading or label text            |

**PageContext**

| Field      | Type   | Description                          |
|------------|--------|--------------------------------------|
| `title`    | string | `document.title`                     |
| `url`      | string | Full URL                             |
| `path`     | string | `window.location.pathname`           |
| `pageText` | string | Body text (truncated to 2000 chars)  |

#### Example request

```json
{
  "query": "I need help applying for a new PAN card",
  "elements": [
    {
      "navi_id": 14,
      "tag": "A",
      "id": "newappl",
      "text": "New Application",
      "context": "Select PAN Application Type"
    },
    {
      "navi_id": 24,
      "tag": "SELECT",
      "id": "type",
      "text": "----Please Select------\nNew PAN - Indian Citizen (Form 49A)",
      "context": "Select PAN Application Type"
    },
    {
      "navi_id": 46,
      "tag": "BUTTON",
      "id": "submitForm",
      "text": "Submit",
      "context": "Select PAN Application Type"
    }
  ],
  "page_context": {
    "title": "PAN Card Services Online",
    "url": "https://onlineservices.proteantech.in/paam/endUserRegisterContact.html",
    "path": "/paam/endUserRegisterContact.html",
    "pageText": "Online PAN application ..."
  },
  "steps_completed": []
}
```

#### Response

| Field          | Type               | Description                                                    |
|----------------|--------------------|----------------------------------------------------------------|
| `instruction`  | ActionInstruction  | The next step to show the user                                 |
| `audio_base64` | string \| null     | WAV audio as base64. `null` if `SARVAM_TOKEN` is not set or TTS failed |

**ActionInstruction**

| Field          | Type    | Description                                                       |
|----------------|---------|-------------------------------------------------------------------|
| `current_task` | string  | Summary of what's being done                                      |
| `navi_id`      | int     | `data-navi-id` of the target element (-1 if no element found)     |
| `voice_text`   | string  | Simple instruction in plain language for the user                 |
| `action`       | string  | One of: `click`, `type`, `scroll`, `wait`                        |
| `value`        | string  | Text to type (only relevant when action is `type`)               |
| `is_done`      | bool    | `true` when the task is fully completed                           |
| `lang`         | string  | Language code for the voice output (see supported languages)      |
| `transcription`| string  | Voice instruction in the detected language's native script        |

#### Example response

```json
{
  "instruction": {
    "current_task": "Select PAN application type",
    "navi_id": 14,
    "voice_text": "Touch the blue text that says 'New Application'",
    "action": "click",
    "value": "",
    "is_done": false,
    "lang": "hi-IN",
    "transcription": "'New Application' लिखे नीले अक्षरों को दबाएं"
  },
  "audio_base64": "UklGRi4AAABXQVZFZm10IBIA..."
}
```

#### Frontend audio playback

```javascript
const response = await fetch("/api/guide", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) });
const data = await response.json();

if (data.audio_base64) {
  const audio = new Audio("data:audio/wav;base64," + data.audio_base64);
  audio.play();
}
```

---

### `POST /api/audio`

Standalone text-to-speech endpoint.

#### Request body

| Field  | Type   | Required | Default  | Description                    |
|--------|--------|----------|----------|--------------------------------|
| `text` | string | yes      | —        | Text to convert (max 2500 chars) |
| `lang` | string | no       | `hi-IN`  | Target language code           |

#### Example request

```json
{
  "text": "अब नीचे दिए गए बटन को दबाएं।",
  "lang": "hi-IN"
}
```

#### Response

```json
{
  "audio_base64": "UklGRi4AAABXQVZFZm10IBIA..."
}
```

---

## Supported languages

| Language   | Code    |
|------------|---------|
| Hindi      | `hi-IN` |
| Bengali    | `bn-IN` |
| Tamil      | `ta-IN` |
| Telugu     | `te-IN` |
| Gujarati   | `gu-IN` |
| Kannada    | `kn-IN` |
| Malayalam  | `ml-IN` |
| Marathi    | `mr-IN` |
| Punjabi    | `pa-IN` |
| Odia       | `od-IN` |
| English    | `en-IN` |

---

## Error responses

All errors follow this shape:

```json
{ "detail": "Human-readable error message" }
```

| Status | Meaning                                      |
|--------|----------------------------------------------|
| 422    | Validation error (missing/invalid fields)    |
| 502    | Upstream service error (LLM or TTS failed)   |
| 503    | Required API key not configured              |

---

## Typical flow

```
Extension                         Backend
   │                                 │
   │  1. User enters query           │
   │  2. extractNaviElements()       │
   │                                 │
   │  POST /api/guide ──────────────>│
   │  { query, elements,             │── 3. LLM determines next action
   │    page_context,                │── 4. TTS generates audio
   │    steps_completed }            │
   │<────────────────────────────────│
   │  { instruction, audio_base64 }  │
   │                                 │
   │  5. Highlight navi_id element   │
   │  6. Play audio                  │
   │  7. User performs action        │
   │  8. Append voice_text to        │
   │     steps_completed             │
   │                                 │
   │  POST /api/guide ──────────────>│  (repeat until is_done=true)
   │  ...                            │
```

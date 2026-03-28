const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html")

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument()
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Record mic audio for voice goal input"
    })
  }
}

async function closeOffscreen() {
  const existing = await chrome.offscreen.hasDocument()
  if (existing) await chrome.offscreen.closeDocument()
}

function parseErrorBody(text, data) {
  const detail = data?.detail
  return Array.isArray(detail)
    ? detail.map(d => d.msg || d).join("; ")
    : typeof detail === "string"
      ? detail
      : text || ""
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // --- voice: start recording ---
  if (msg?.type === "START_VOICE") {
    ;(async () => {
      try {
        await ensureOffscreen()
        await chrome.runtime.sendMessage({ type: "OFFSCREEN_START" })
        sendResponse({ ok: true })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) })
      }
    })()
    return true
  }

  // --- voice: stop recording ---
  if (msg?.type === "STOP_VOICE") {
    ;(async () => {
      try {
        await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" })
        sendResponse({ ok: true })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) })
      }
    })()
    return true
  }

  // --- offscreen finished recording, transcribe it ---
  if (msg?.type === "OFFSCREEN_RESULT") {
    ;(async () => {
      await closeOffscreen()
      if (!msg.ok) {
        // broadcast result to popup
        chrome.runtime.sendMessage({
          type: "VOICE_TRANSCRIBE_RESULT",
          ok: false,
          error: msg.error
        })
        return
      }
      // get saved apiBaseUrl
      const { apiBaseUrl } = await chrome.storage.local.get({ apiBaseUrl: "http://127.0.0.1:8000" })
      const base = apiBaseUrl.trim().replace(/\/$/, "")
      try {
        const res = await fetch(`${base}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: msg.audio_base64,
            language_code: "unknown",
            input_audio_codec: msg.codec || "webm"
          })
        })
        const raw = await res.text()
        const data = raw ? JSON.parse(raw) : null
        if (!res.ok) {
          chrome.runtime.sendMessage({
            type: "VOICE_TRANSCRIBE_RESULT",
            ok: false,
            error: parseErrorBody(raw, data) || `HTTP ${res.status}`
          })
          return
        }
        chrome.runtime.sendMessage({
          type: "VOICE_TRANSCRIBE_RESULT",
          ok: true,
          text: data?.text || ""
        })
      } catch (e) {
        chrome.runtime.sendMessage({
          type: "VOICE_TRANSCRIBE_RESULT",
          ok: false,
          error: String(e?.message || e)
        })
      }
    })()
    return
  }

  // --- fetch guide ---
  if (msg?.type === "FETCH_GUIDE") {
    ;(async () => {
      const base = String(msg.apiBaseUrl || "").trim().replace(/\/$/, "")
      if (!base) { sendResponse({ ok: false, error: "API base URL is empty." }); return }
      try {
        const res = await fetch(`${base}/api/guide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: msg.query,
            elements: msg.elements,
            page_context: msg.page_context,
            steps_completed: msg.steps_completed || []
          })
        })
        const text = await res.text()
        let data = null
        try { data = text ? JSON.parse(text) : null } catch { data = { detail: text } }
        if (!res.ok) {
          sendResponse({ ok: false, error: parseErrorBody(text, data) || `HTTP ${res.status}`, status: res.status })
          return
        }
        sendResponse({ ok: true, data })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) })
      }
    })()
    return true
  }

  // --- fetch audio (TTS) ---
  if (msg?.type === "FETCH_AUDIO") {
    ;(async () => {
      const base = String(msg.apiBaseUrl || "").trim().replace(/\/$/, "")
      if (!base) { sendResponse({ ok: false, error: "API base URL is empty." }); return }
      try {
        const res = await fetch(`${base}/api/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: String(msg.text || "").slice(0, 2500), lang: msg.lang || "hi-IN" })
        })
        const raw = await res.text()
        let data = null
        try { data = raw ? JSON.parse(raw) : null } catch { data = { detail: raw } }
        if (!res.ok) {
          sendResponse({ ok: false, error: parseErrorBody(raw, data) || `HTTP ${res.status}` })
          return
        }
        const b64 = data?.audio_base64 ?? data?.audioBase64
        if (!b64) { sendResponse({ ok: false, error: "No audio in response." }); return }
        sendResponse({ ok: true, audio_base64: b64 })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) })
      }
    })()
    return true
  }

})
function parseErrorBody(text, data) {
  const detail = data?.detail
  return Array.isArray(detail)
    ? detail.map(d => d.msg || d).join("; ")
    : typeof detail === "string" ? detail : text || ""
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // --- audio from voice-bridge, do the fetch here (no CSP) ---
  if (msg?.type === "TRANSCRIBE_AUDIO") {
    ;(async () => {
      const base = String(msg.apiBaseUrl || "").trim().replace(/\/$/, "")
      if (!base) {
        chrome.runtime.sendMessage({ type: "VOICE_TRANSCRIBE_RESULT", ok: false, error: "API base URL empty" })
        return
      }
      try {
        const res = await fetch(`${base}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: msg.audio_base64,
            language_code: "unknown",
            input_audio_codec: msg.codec || "webm"
          })
        })
        const raw = await res.text()
        let data = null
        try { data = raw ? JSON.parse(raw) : null } catch { data = { detail: raw } }
        if (!res.ok) {
          chrome.runtime.sendMessage({
            type: "VOICE_TRANSCRIBE_RESULT",
            ok: false,
            error: parseErrorBody(raw, data) || `HTTP ${res.status}`
          })
          return
        }
        chrome.runtime.sendMessage({
          type: "VOICE_TRANSCRIBE_RESULT",
          ok: true,
          text: data?.text || ""
        })
      } catch (e) {
        chrome.runtime.sendMessage({
          type: "VOICE_TRANSCRIBE_RESULT",
          ok: false,
          error: String(e?.message || e)
        })
      }
    })()
    return
  }

  // --- fetch guide ---
  if (msg?.type === "FETCH_GUIDE") {
    ;(async () => {
      const base = String(msg.apiBaseUrl || "").trim().replace(/\/$/, "")
      if (!base) { sendResponse({ ok: false, error: "API base URL is empty." }); return }
      try {
        const res = await fetch(`${base}/api/guide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: msg.query,
            elements: msg.elements,
            page_context: msg.page_context,
            steps_completed: msg.steps_completed || []
          })
        })
        const text = await res.text()
        let data = null
        try { data = text ? JSON.parse(text) : null } catch { data = { detail: text } }
        if (!res.ok) {
          sendResponse({ ok: false, error: parseErrorBody(text, data) || `HTTP ${res.status}`, status: res.status })
          return
        }
        sendResponse({ ok: true, data })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) })
      }
    })()
    return true
  }

  // --- fetch audio TTS ---
  if (msg?.type === "FETCH_AUDIO") {
    ;(async () => {
      const base = String(msg.apiBaseUrl || "").trim().replace(/\/$/, "")
      if (!base) { sendResponse({ ok: false, error: "API base URL is empty." }); return }
      try {
        const res = await fetch(`${base}/api/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: String(msg.text || "").slice(0, 2500), lang: msg.lang || "hi-IN" })
        })
        const raw = await res.text()
        let data = null
        try { data = raw ? JSON.parse(raw) : null } catch { data = { detail: raw } }
        if (!res.ok) {
          sendResponse({ ok: false, error: parseErrorBody(raw, data) || `HTTP ${res.status}` })
          return
        }
        const b64 = data?.audio_base64 ?? data?.audioBase64
        if (!b64) { sendResponse({ ok: false, error: "No audio in response." }); return }
        sendResponse({ ok: true, audio_base64: b64 })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) })
      }
    })()
    return true
  }

})
/** Proxies POST /api/guide, /api/audio, /api/transcribe (UncDoIt backend) — avoids page CORS. */

function parseErrorBody(text, data) {
  const detail = data?.detail;
  return Array.isArray(detail)
    ? detail.map((d) => d.msg || d).join("; ")
    : typeof detail === "string"
      ? detail
      : text || "";
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "FETCH_AUDIO") {
    (async () => {
      const base = String(msg.apiBaseUrl || "")
        .trim()
        .replace(/\/$/, "");
      if (!base) {
        sendResponse({ ok: false, error: "API base URL is empty." });
        return;
      }
      const text = String(msg.text || "").trim();
      if (!text) {
        sendResponse({ ok: false, error: "No text for TTS." });
        return;
      }
      const url = `${base}/api/audio`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.slice(0, 2500),
            lang: msg.lang || "hi-IN",
          }),
        });
        const raw = await res.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = { detail: raw };
        }
        if (!res.ok) {
          sendResponse({
            ok: false,
            error: parseErrorBody(raw, data) || `HTTP ${res.status}`,
            status: res.status,
          });
          return;
        }
        const b64 = data?.audio_base64 ?? data?.audioBase64;
        if (!b64) {
          sendResponse({ ok: false, error: "No audio in response." });
          return;
        }
        sendResponse({ ok: true, audio_base64: b64 });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (msg?.type === "FETCH_TRANSCRIBE") {
    (async () => {
      const base = String(msg.apiBaseUrl || "")
        .trim()
        .replace(/\/$/, "");
      if (!base) {
        sendResponse({ ok: false, error: "API base URL is empty." });
        return;
      }
      const b64 = String(msg.audio_base64 || "").trim();
      if (!b64) {
        sendResponse({ ok: false, error: "No audio data." });
        return;
      }
      const url = `${base}/api/transcribe`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: b64,
            language_code: msg.language_code || "unknown",
            input_audio_codec: msg.input_audio_codec || "webm",
          }),
        });
        const raw = await res.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = { detail: raw };
        }
        if (!res.ok) {
          sendResponse({
            ok: false,
            error: parseErrorBody(raw, data) || `HTTP ${res.status}`,
            status: res.status,
          });
          return;
        }
        const text = data?.text != null ? String(data.text) : "";
        sendResponse({ ok: true, text });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (msg?.type !== "FETCH_GUIDE") {
    return;
  }

  (async () => {
    const base = String(msg.apiBaseUrl || "")
      .trim()
      .replace(/\/$/, "");
    if (!base) {
      sendResponse({ ok: false, error: "API base URL is empty." });
      return;
    }

    const url = `${base}/api/guide`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: msg.query,
          elements: msg.elements,
          page_context: msg.page_context,
          steps_completed: msg.steps_completed || [],
        }),
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { detail: text };
      }
      if (!res.ok) {
        sendResponse({
          ok: false,
          error: parseErrorBody(text, data) || res.statusText || `HTTP ${res.status}`,
          status: res.status,
        });
        return;
      }
      sendResponse({ ok: true, data });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});

/**
 * Page-context voice capture for the popup mic button.
 * getUserMedia runs in the *page* world (injected script), so Chrome uses the
 * site’s microphone permission — usually allowed when the popup/extension mic is blocked.
 */
(function () {
  const FLAG = "__uncdoitVoiceBridge";
  if (window[FLAG]) {
    return;
  }
  window[FLAG] = true;

  function codecHintForMime(mime) {
    const m = (mime || "").toLowerCase();
    if (m.includes("webm")) return "webm";
    if (m.includes("ogg")) return "ogg";
    if (m.includes("mp4") || m.includes("m4a")) return "mp4";
    if (m.includes("wav")) return "wav";
    return "webm";
  }

  /** Injected into the page (MAIN world). Must stay self-contained. */
  function pageRecorder(bridge) {
    const post = (payload) =>
      window.postMessage(
        Object.assign({ type: "UNCDOIT_VOICE_FROM_PAGE", bridge: bridge }, payload),
        "*",
      );
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let mime = "";
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mime = "audio/webm";
        }
        const mr = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        const chunks = [];
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        window.__uncdoitVoiceStop = () => {
          try {
            if (mr.state === "recording") mr.stop();
          } catch (_) {
            /* ignore */
          }
        };
        mr.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          try {
            delete window.__uncdoitVoiceStop;
          } catch (_) {
            /* ignore */
          }
          const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
          const r = new FileReader();
          r.onloadend = () => {
            const u = r.result;
            const b64 =
              typeof u === "string" && u.indexOf(",") >= 0
                ? u.slice(u.indexOf(",") + 1)
                : "";
            post({ b64: b64, mime: blob.type });
          };
          r.readAsDataURL(blob);
        };
        mr.onerror = () => {
          post({ err: "MediaRecorder error" });
        };
        mr.start(250);
        setTimeout(() => {
          if (mr.state === "recording") mr.stop();
        }, 90000);
      } catch (e) {
        post({
          err: (e && e.name ? e.name : "Error") + ": " + (e && e.message ? e.message : ""),
        });
      }
    })();
  }

  function injectPageRecorder(bridge, apiBaseUrl) {
    const onWin = async (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "UNCDOIT_VOICE_FROM_PAGE" || d.bridge !== bridge) return;
      window.removeEventListener("message", onWin);
      if (d.err) {
        chrome.runtime.sendMessage({
          type: "UNCDOIT_VOICE_RESULT",
          ok: false,
          error: d.err,
        });
        return;
      }
      try {
        const res = await chrome.runtime.sendMessage({
          type: "FETCH_TRANSCRIBE",
          audio_base64: d.b64,
          language_code: "unknown",
          input_audio_codec: codecHintForMime(d.mime),
          apiBaseUrl: apiBaseUrl,
        });
        chrome.runtime.sendMessage({
          type: "UNCDOIT_VOICE_RESULT",
          ok: !!res?.ok,
          text: res?.text,
          error: res?.error,
        });
      } catch (err) {
        chrome.runtime.sendMessage({
          type: "UNCDOIT_VOICE_RESULT",
          ok: false,
          error: String(err && err.message ? err.message : err),
        });
      }
    };
    window.addEventListener("message", onWin);

    const s = document.createElement("script");
    s.textContent = "(" + pageRecorder.toString() + ")(" + JSON.stringify(bridge) + ");";
    (document.documentElement || document.head).appendChild(s);
    s.remove();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "UNCDOIT_VOICE") {
      return;
    }
    if (msg.action === "start") {
      try {
        const bridge = "uncdoit_" + Math.random().toString(36).slice(2);
        const base = String(msg.apiBaseUrl || "http://127.0.0.1:8000")
          .trim()
          .replace(/\/$/, "");
        injectPageRecorder(bridge, base);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    }
    if (msg.action === "stop") {
      try {
        const s = document.createElement("script");
        s.textContent =
          "try{window.__uncdoitVoiceStop&&window.__uncdoitVoiceStop()}catch(e){}";
        (document.documentElement || document.head).appendChild(s);
        s.remove();
      } catch (_) {
        /* ignore */
      }
      sendResponse({ ok: true });
    }
  });
})();

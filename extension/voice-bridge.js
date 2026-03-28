(function () {
  const FLAG = "__uncdoitVoiceBridge"
  if (window[FLAG]) return
  window[FLAG] = true

  let mediaRecorder = null
  let recordChunks = []
  let recordTimer = null

  function pickMime() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c
    }
    return ""
  }

  function codecHint(mime) {
    const m = (mime || "").toLowerCase()
    if (m.includes("webm")) return "webm"
    if (m.includes("ogg")) return "ogg"
    if (m.includes("mp4")) return "mp4"
    return "webm"
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const url = reader.result
        if (typeof url !== "string") { reject(new Error("Bad read")); return }
        const i = url.indexOf(",")
        resolve(i >= 0 ? url.slice(i + 1) : url)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }

  function stopRecording() {
    if (recordTimer) { clearTimeout(recordTimer); recordTimer = null }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop()
      return true
    }
    return false
  }

  function startRecording(base) {
    if (mediaRecorder && mediaRecorder.state === "recording") return

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        recordChunks = []
        const mime = pickMime()

        try {
          mediaRecorder = mime
            ? new MediaRecorder(stream, { mimeType: mime })
            : new MediaRecorder(stream)
        } catch {
          mediaRecorder = new MediaRecorder(stream)
        }

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordChunks.push(e.data)
        }

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop())
          const usedMime = mediaRecorder?.mimeType || mime || "audio/webm"
          const blob = new Blob(recordChunks, { type: usedMime })
          recordChunks = []
          mediaRecorder = null

          if (blob.size < 200) {
            chrome.runtime.sendMessage({ type: "VOICE_TRANSCRIBE_RESULT", ok: false, error: "Recording too short" })
            return
          }

          try {
            const b64 = await blobToBase64(blob)
            // send to background — it does the fetch, no CSP issues
            chrome.runtime.sendMessage({
              type: "TRANSCRIBE_AUDIO",
              audio_base64: b64,
              codec: codecHint(usedMime),
              apiBaseUrl: base
            })
          } catch (e) {
            chrome.runtime.sendMessage({
              type: "VOICE_TRANSCRIBE_RESULT",
              ok: false,
              error: "encode failed: " + e?.message
            })
          }
        }

        mediaRecorder.onerror = () => {
          chrome.runtime.sendMessage({ type: "VOICE_TRANSCRIBE_RESULT", ok: false, error: "recorder error" })
        }

        mediaRecorder.start(250)
        chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STARTED" })
        recordTimer = setTimeout(() => stopRecording(), 90000)
      })
      .catch((e) => {
        chrome.runtime.sendMessage({
          type: "VOICE_TRANSCRIBE_RESULT",
          ok: false,
          error: (e?.name || "Error") + ": " + (e?.message || "mic denied")
        })
      })
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "UNCDOIT_VOICE") return true

    if (msg.action === "start") {
      startRecording(msg.apiBaseUrl)
      sendResponse({ ok: true })
      return true
    }

    if (msg.action === "stop") {
      const stopped = stopRecording()
      sendResponse({ ok: true, wasStopped: stopped })
      return true
    }
  })
})()
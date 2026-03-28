const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const intentEl = document.getElementById("intent");
const apiBaseEl = document.getElementById("apiBase");
const voiceBtn = document.getElementById("voice");
const voiceHint = document.getElementById("voiceHint");

const DEFAULT_API = "http://127.0.0.1:8000";
const MAX_RECORD_MS = 90_000;

let mediaStream = null;
let mediaRecorder = null;
let recordChunks = [];
let recordTimer = null;
let voiceStarting = false;

const VOICE_HINT_DEFAULT =
  "Tap the mic to dictate your goal (uses your UncDoIt server for speech-to-text).";

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadStoredApiBase() {
  const { apiBaseUrl } = await chrome.storage.local.get({
    apiBaseUrl: DEFAULT_API,
  });
  apiBaseEl.value = apiBaseUrl || DEFAULT_API;
}

function pickRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function codecHintForBlobType(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a")) return "mp4";
  if (m.includes("wav")) return "wav";
  return "webm";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Bad read"));
        return;
      }
      const i = dataUrl.indexOf(",");
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function startVoiceRecording() {
  if (voiceStarting || (mediaRecorder && mediaRecorder.state === "recording")) {
    return;
  }
  if (!window.MediaRecorder) {
    setStatus("Recording is not supported in this browser.", true);
    return;
  }
  voiceStarting = true;
  setStatus("");
  try {
    const hasAudio = await chrome.permissions.contains({
      permissions: ["audioCapture"],
    });
    if (!hasAudio) {
      const granted = await chrome.permissions.request({
        permissions: ["audioCapture"],
      });
      if (!granted) {
        setStatus(
          "Voice input needs mic access. Click Allow in the prompt, or open chrome://settings/content/microphone and allow this extension.",
          true,
        );
        voiceStarting = false;
        return;
      }
    }
  } catch {
    setStatus("Could not request microphone permission from the browser.", true);
    voiceStarting = false;
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Microphone API is not available in this context.", true);
    voiceStarting = false;
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    voiceStarting = false;
    const name = err && err.name;
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      setStatus(
        "Mic was blocked. In Chrome: Settings → Privacy and security → Site settings → Microphone. Set “Sites can ask…” on, remove this extension from Blocked, or reset permissions.",
        true,
      );
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      setStatus("No microphone detected. Plug in a mic or check Windows Sound settings.", true);
    } else if (name === "NotReadableError" || name === "TrackStartError") {
      setStatus("Microphone is busy or disabled in system settings.", true);
    } else {
      setStatus(err?.message || "Could not open microphone.", true);
    }
    return;
  }

  recordChunks = [];
  const mime = pickRecorderMimeType();
  try {
    mediaRecorder = mime
      ? new MediaRecorder(mediaStream, { mimeType: mime })
      : new MediaRecorder(mediaStream);
  } catch {
    try {
      mediaRecorder = new MediaRecorder(mediaStream);
    } catch (e) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
      setStatus(e?.message || "Could not start recorder.", true);
      voiceStarting = false;
      return;
    }
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const usedMime =
      mediaRecorder?.mimeType || mime || "audio/webm";
    const stream = mediaStream;
    mediaStream = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    const blob = new Blob(recordChunks, { type: usedMime });
    recordChunks = [];
    mediaRecorder = null;
    voiceStarting = false;
    void transcribeBlob(blob, usedMime);
  };

  voiceBtn.classList.add("recording");
  voiceBtn.setAttribute("aria-pressed", "true");
  voiceHint.textContent = "Listening… tap the mic again to stop.";
  mediaRecorder.start(250);
  recordTimer = window.setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      stopVoiceRecording();
    }
  }, MAX_RECORD_MS);
  voiceStarting = false;
}

function stopVoiceRecording() {
  if (recordTimer) {
    clearTimeout(recordTimer);
    recordTimer = null;
  }
  voiceBtn.classList.remove("recording");
  voiceBtn.setAttribute("aria-pressed", "false");
  voiceHint.textContent = VOICE_HINT_DEFAULT;

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    return;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  voiceStarting = false;
}

async function transcribeBlob(blob, mimeType) {
  if (blob.size < 200) {
    setStatus("Recording too short.", true);
    return;
  }
  setStatus("Transcribing…");
  let b64;
  try {
    b64 = await blobToBase64(blob);
  } catch {
    setStatus("Could not read recording.", true);
    return;
  }
  const apiBaseUrl = (apiBaseEl.value.trim() || DEFAULT_API).replace(/\/$/, "");
  await chrome.storage.local.set({ apiBaseUrl });
  try {
    const res = await chrome.runtime.sendMessage({
      type: "FETCH_TRANSCRIBE",
      audio_base64: b64,
      language_code: "unknown",
      input_audio_codec: codecHintForBlobType(mimeType || blob.type),
      apiBaseUrl,
    });
    if (!res?.ok) {
      setStatus(res?.error || "Transcription failed.", true);
      return;
    }
    const text = (res.text || "").trim();
    if (!text) {
      setStatus("No speech recognized. Try again or type your goal.", true);
      return;
    }
    const cur = intentEl.value.trim();
    intentEl.value = cur ? `${cur} ${text}` : text;
    setStatus("Goal updated from voice.");
  } catch (e) {
    setStatus(e?.message || "Transcription failed.", true);
  }
}

async function injectGuide() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("No active tab found.", true);
    return;
  }
  const url = tab.url || "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    setStatus("Open a regular webpage (http/https) to run the guide.", true);
    return;
  }

  const userIntent = intentEl.value.trim();
  if (!userIntent) {
    setStatus("Enter a goal describing what you want to do.", true);
    intentEl.focus();
    return;
  }

  const apiBaseUrl = (apiBaseEl.value.trim() || DEFAULT_API).replace(/\/$/, "");
  await chrome.storage.local.set({ apiBaseUrl });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, {
      type: "SITE_GUIDE_START",
      userIntent,
      apiBaseUrl,
    });
    setStatus("Guide started on this tab.");
    window.close();
  } catch (e) {
    setStatus(e?.message || "Could not start guide.", true);
  }
}

async function stopGuide() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SITE_GUIDE_STOP" });
    setStatus("Guide stopped.");
  } catch {
    setStatus("No active guide on this tab.");
  }
}

startBtn.addEventListener("click", () => {
  setStatus("");
  injectGuide();
});

stopBtn.addEventListener("click", () => {
  setStatus("");
  stopGuide();
});

voiceBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopVoiceRecording();
  } else {
    void startVoiceRecording();
  }
});

loadStoredApiBase();

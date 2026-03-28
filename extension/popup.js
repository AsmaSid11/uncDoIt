const statusEl = document.getElementById("status")
const startBtn = document.getElementById("start")
const stopBtn = document.getElementById("stop")
const intentEl = document.getElementById("intent")
const apiBaseEl = document.getElementById("apiBase")
const voiceBtn = document.getElementById("voice")
const voiceHint = document.getElementById("voiceHint")

const DEFAULT_API = "http://127.0.0.1:8000"
const HINT_DEFAULT = "Tap mic to speak your goal. Tap again to stop."

let voiceState = "idle" // idle | recording | transcribing

function setStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle("error", isError)
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function loadStoredApiBase() {
  const { apiBaseUrl } = await chrome.storage.local.get({ apiBaseUrl: DEFAULT_API })
  apiBaseEl.value = apiBaseUrl || DEFAULT_API
}

async function saveApiBase() {
  const val = (apiBaseEl.value.trim() || DEFAULT_API).replace(/\/$/, "")
  await chrome.storage.local.set({ apiBaseUrl: val })
}

function setVoiceUI(state) {
  voiceState = state
  if (state === "recording") {
    voiceBtn.classList.add("recording")
    voiceBtn.setAttribute("aria-pressed", "true")
    voiceHint.textContent = "Listening… tap mic again to stop."
    setStatus("")
  } else if (state === "transcribing") {
    voiceBtn.classList.remove("recording")
    voiceBtn.setAttribute("aria-pressed", "false")
    voiceHint.textContent = "Transcribing…"
    setStatus("Transcribing…")
  } else {
    voiceBtn.classList.remove("recording")
    voiceBtn.setAttribute("aria-pressed", "false")
    voiceHint.textContent = HINT_DEFAULT
  }
}

// recording actually started on the page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "VOICE_RECORDING_STARTED") {
    setVoiceUI("recording")
    return
  }

  if (msg?.type === "VOICE_TRANSCRIBE_RESULT") {
    setVoiceUI("idle")
    if (msg.ok) {
      const text = (msg.text || "").trim()
      if (!text) { setStatus("No speech detected. Try again.", true); return }
      const cur = intentEl.value.trim()
      intentEl.value = cur ? `${cur} ${text}` : text
      setStatus("Goal updated from voice.")
    } else {
      setStatus(msg.error || "Voice failed.", true)
    }
  }
})

async function toggleVoice() {
  if (voiceState === "transcribing") return

  const tab = await getActiveTab()
  if (!tab?.id) { setStatus("No active tab.", true); return }
  const url = tab.url || ""
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    setStatus("Open a regular webpage first.", true)
    return
  }

  await saveApiBase()
  const apiBaseUrl = (apiBaseEl.value.trim() || DEFAULT_API).replace(/\/$/, "")

  // --- STOP ---
  if (voiceState === "recording") {
    setVoiceUI("transcribing")
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "UNCDOIT_VOICE", action: "stop" })
    } catch (e) {
      setStatus("Could not stop recording: " + e?.message, true)
      setVoiceUI("idle")
    }
    return
  }

  // --- START ---
  // inject fresh if needed
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["voice-bridge.js"] })
  } catch { /* already injected */ }

  // show pending state while getUserMedia prompt appears
  voiceBtn.classList.add("recording")
  voiceHint.textContent = "Waiting for mic permission…"

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "UNCDOIT_VOICE",
      action: "start",
      apiBaseUrl
    })
    // don't set voiceState = "recording" here
    // wait for VOICE_RECORDING_STARTED message which fires after getUserMedia resolves
  } catch (e) {
    setVoiceUI("idle")
    setStatus("Could not start mic: " + e?.message, true)
  }
}

async function injectGuide() {
  const tab = await getActiveTab()
  if (!tab?.id) { setStatus("No active tab.", true); return }
  const url = tab.url || ""
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    setStatus("Open a regular webpage to run the guide.", true)
    return
  }
  const userIntent = intentEl.value.trim()
  if (!userIntent) { setStatus("Enter a goal first.", true); intentEl.focus(); return }

  await saveApiBase()
  const apiBaseUrl = (apiBaseEl.value.trim() || DEFAULT_API).replace(/\/$/, "")

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
    await chrome.tabs.sendMessage(tab.id, { type: "SITE_GUIDE_START", userIntent, apiBaseUrl })
    setStatus("Guide started.")
    window.close()
  } catch (e) {
    setStatus(e?.message || "Could not start guide.", true)
  }
}

async function stopGuide() {
  const tab = await getActiveTab()
  if (!tab?.id) return
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SITE_GUIDE_STOP" })
    setStatus("Guide stopped.")
  } catch {
    setStatus("No active guide on this tab.")
  }
}

startBtn.addEventListener("click", () => { setStatus(""); injectGuide() })
stopBtn.addEventListener("click", () => { setStatus(""); stopGuide() })
voiceBtn.addEventListener("click", () => { void toggleVoice() })

loadStoredApiBase()
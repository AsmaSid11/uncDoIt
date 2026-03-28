const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const intentEl = document.getElementById("intent");
const apiBaseEl = document.getElementById("apiBase");

const DEFAULT_API = "http://127.0.0.1:8000";

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

loadStoredApiBase();

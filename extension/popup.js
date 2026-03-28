const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectGuide() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("No active tab found.", true);
    return;
  }
  const url = tab.url || "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    setStatus("Open a regular webpage (http/https) to run the tour.", true);
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "SITE_GUIDE_START" });
    setStatus("Tour started on this tab.");
    window.close();
  } catch (e) {
    setStatus(e?.message || "Could not start tour.", true);
  }
}

async function stopGuide() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SITE_GUIDE_STOP" });
    setStatus("Tour stopped.");
  } catch {
    setStatus("No active tour on this tab.");
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

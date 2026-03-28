/** Proxies POST /api/guide (UncDoIt backend) — avoids page CORS for the extension. */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
        const detail = data?.detail;
        const errMsg = Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join("; ")
          : typeof detail === "string"
            ? detail
            : text || res.statusText;
        sendResponse({
          ok: false,
          error: errMsg || `HTTP ${res.status}`,
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

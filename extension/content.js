(function () {
  const FLAG = "__uncdoitSiteGuide";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const NAVI = "data-navi-id";
  const CHECKPOINT_KEY = "uncdoit_guide_ck_v1";

  let shadow;
  let backdropEl;
  let spotlightEl;
  let cardEl;
  let onKey;
  let onResize;
  let onScroll;
  let scrollRaf = null;

  let history = [];
  let index = 0;
  let stepsCompleted = [];
  let query = "";
  let apiBaseUrl = "";
  let overlayMode = "tour";

  let stepWatchAbort = null;
  let guideAdvancing = false;
  let resumeAttempted = false;

  let guideAudioEl = null;
  let guideAudioObjectUrl = null;
  let audioSyncGen = 0;

  function pushCompleted(line) {
    if (!line) return;
    if (stepsCompleted.length === 0 || stepsCompleted[stepsCompleted.length - 1] !== line) {
      stepsCompleted.push(line);
    }
  }

  window.addEventListener("pagehide", () => {
    if (query && apiBaseUrl) writeCheckpoint();
  });

  function writeCheckpoint() {
    try {
      sessionStorage.setItem(
        CHECKPOINT_KEY,
        JSON.stringify({
          query,
          apiBaseUrl,
          stepsCompleted: [...stepsCompleted],
          exp: Date.now() + 5 * 60 * 1000,
        }),
      );
    } catch { /* ignore */ }
  }

  function clearCheckpoint() {
    try { sessionStorage.removeItem(CHECKPOINT_KEY); } catch { /* ignore */ }
  }

  function readCheckpoint() {
    try {
      const raw = sessionStorage.getItem(CHECKPOINT_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s.query || !s.apiBaseUrl) return null;
      if (s.exp && Date.now() > s.exp) {
        sessionStorage.removeItem(CHECKPOINT_KEY);
        return null;
      }
      return s;
    } catch { return null; }
  }

  function wireKeyboardResize() {
    if (onKey) return;
    onKey = (e) => {
      if (e.key === "Escape") teardown();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    onResize = () => { if (history.length && shadow) layoutStep(); };
    onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        repositionHighlight();
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
  }

  function getNearestContext(element) {
    let node = element.parentElement;
    while (node && node !== document.body) {
      const heading = node.querySelector("h1, h2, h3, h4, label, legend");
      if (heading && heading.innerText.trim()) {
        return heading.innerText.trim().slice(0, 60);
      }
      node = node.parentElement;
    }
    return "";
  }

  function extractNaviElements() {
    const interactive = document.querySelectorAll("button, input, select, textarea, a");
    const elements = [];
    interactive.forEach((el, idx) => {
      el.setAttribute(NAVI, String(idx));
      const entry = {
        navi_id: idx,
        tag: el.tagName,
        id: el.id || "",
        text: (el.innerText && el.innerText.trim()) || el.placeholder || el.value || "",
        context: getNearestContext(el),
      };
      if (entry.text || entry.id) elements.push(entry);
    });
    const pageContext = {
      title: document.title || "",
      url: window.location.href,
      path: window.location.pathname,
      pageText: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2000),
    };
    return { elements, pageContext };
  }

  function stripNaviAttributes() {
    document.querySelectorAll(`[${NAVI}]`).forEach((el) => el.removeAttribute(NAVI));
  }

  function stopAudioPlayback() {
    if (guideAudioEl) {
      guideAudioEl.pause();
      guideAudioEl.removeAttribute("src");
      guideAudioEl.load();
      guideAudioEl = null;
    }
    if (guideAudioObjectUrl) {
      URL.revokeObjectURL(guideAudioObjectUrl);
      guideAudioObjectUrl = null;
    }
  }

  function hideAudioRow() {
    const row = shadow?.getElementById("site-guide-audio-row");
    if (row) row.style.display = "none";
  }

  function ensureAudioRow() {
    if (!cardEl || !shadow) return;
    if (shadow.getElementById("site-guide-audio-row")) return;
    const row = document.createElement("div");
    row.id = "site-guide-audio-row";
    const btn = document.createElement("button");
    btn.id = "site-guide-audio-btn";
    btn.type = "button";
    btn.textContent = "Play";
    const status = document.createElement("span");
    status.id = "site-guide-audio-status";
    status.setAttribute("aria-live", "polite");
    row.appendChild(btn);
    row.appendChild(status);
    const actions = shadow.getElementById("site-guide-actions");
    if (actions && actions.parentNode === cardEl) {
      cardEl.insertBefore(row, actions);
    } else {
      cardEl.appendChild(row);
    }
  }

  async function setupStepAudio(step) {
    ensureAudioRow();
    const row = shadow.getElementById("site-guide-audio-row");
    const btn = shadow.getElementById("site-guide-audio-btn");
    const status = shadow.getElementById("site-guide-audio-status");
    if (!row || !btn || !status) return;

    stopAudioPlayback();

    const hasInline = step.audioBase64 && String(step.audioBase64).length > 0;
    const tts = (step.ttsText || "").trim();
    if (!hasInline && !tts) { row.style.display = "none"; return; }

    row.style.display = "flex";
    btn.style.display = "inline-flex";
    btn.textContent = "Play";
    status.textContent = "";

    const playFromBase64 = (b64) => {
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        // Sarvam returns MP3 not WAV
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        guideAudioObjectUrl = URL.createObjectURL(blob);
        guideAudioEl = new Audio(guideAudioObjectUrl);
        guideAudioEl.addEventListener("play", () => { btn.textContent = "Pause"; });
        guideAudioEl.addEventListener("pause", () => { btn.textContent = "Play"; });
        guideAudioEl.addEventListener("ended", () => { btn.textContent = "Play"; });
        btn.onclick = () => {
          if (!guideAudioEl) return;
          if (guideAudioEl.paused) {
            guideAudioEl.play().catch(() => { status.textContent = "Tap Play for sound"; });
          } else {
            guideAudioEl.pause();
          }
        };
        guideAudioEl.play()
          .then(() => { status.textContent = ""; })
          .catch(() => { status.textContent = "Tap Play for sound"; });
      } catch {
        status.textContent = "Could not play audio";
      }
    };

    if (hasInline) { playFromBase64(step.audioBase64); return; }

    status.textContent = "Loading voice…";
    try {
      const res = await chrome.runtime.sendMessage({
        type: "FETCH_AUDIO",
        text: tts,
        lang: step.lang || "hi-IN",
        apiBaseUrl,
      });
      if (res?.ok && res.audio_base64) {
        step.audioBase64 = res.audio_base64;
        status.textContent = "";
        playFromBase64(res.audio_base64);
      } else {
        status.textContent = res?.error || "Voice unavailable";
        btn.textContent = "Retry";
        btn.onclick = () => { void setupStepAudio(step); };
      }
    } catch (e) {
      status.textContent = String(e?.message || e);
      btn.textContent = "Retry";
      btn.onclick = () => { void setupStepAudio(step); };
    }
  }

  async function syncAudioForCurrentStep() {
    const my = ++audioSyncGen;
    const st = history[index];
    if (!shadow) return;
    ensureAudioRow();
    if (overlayMode === "error" || !st) { stopAudioPlayback(); hideAudioRow(); return; }
    const hasAudio = (st.audioBase64 && st.audioBase64.length) || (st.ttsText || "").trim();
    if (!hasAudio) { stopAudioPlayback(); hideAudioRow(); return; }
    await setupStepAudio(st);
    if (my !== audioSyncGen) return;
  }

  function normInstruction(raw) {
    if (!raw || typeof raw !== "object") return null;
    const nid = raw.navi_id ?? raw.naviId;
    const parsed = typeof nid === "number" ? nid : parseInt(String(nid ?? ""), 10);
    return {
      current_task: String(raw.current_task ?? raw.currentTask ?? "").trim(),
      navi_id: Number.isFinite(parsed) ? parsed : -1,
      voice_text: String(raw.voice_text ?? raw.voiceText ?? "").trim(),
      action: String(raw.action ?? "wait"),
      value: String(raw.value ?? ""),
      is_done: Boolean(raw.is_done ?? raw.isDone),
      transcription: String(raw.transcription ?? "").trim(),
      lang: String(raw.lang ?? "hi-IN"),
    };
  }

  function instructionToView(inst) {
    const title = (inst.current_task || "Next step").trim();
    let body = (inst.voice_text || "").trim();
    const tr = (inst.transcription || "").trim();
    if (tr && tr !== body) { body = body ? `${body}\n\n${tr}` : tr; }
    if (inst.action === "type" && inst.value) {
      body += body ? `\n\nType: ${inst.value}` : `Type: ${inst.value}`;
    }
    const nid = Number.isFinite(inst.navi_id) ? inst.navi_id : -1;
    const selector = nid >= 0 ? `[${NAVI}="${nid}"]` : null;
    const completedLine = (inst.voice_text || inst.current_task || "").trim();
    const ttsText = (inst.transcription || inst.voice_text || "").trim().slice(0, 2500);
    return {
      title,
      body,
      selector,
      isDone: Boolean(inst.is_done),
      completedLine,
      action: inst.action || "wait",
      expectedValue: (inst.value || "").trim(),
      lang: inst.lang || "hi-IN",
      ttsText,
      audioBase64: null,
    };
  }

  function clearStepWatchers() {
    if (stepWatchAbort) { stepWatchAbort.abort(); stepWatchAbort = null; }
  }

  function attachStepWatchers() {
    clearStepWatchers();
    if (overlayMode === "error" || !history.length || !shadow) return;
    const atLatest = index === history.length - 1;
    if (!atLatest) return;
    const step = history[index];
    if (step.isDone) return;
    const el = resolveTarget(step.selector);
    const action = (step.action || "wait").toLowerCase();
    if (!el || action === "wait") return;

    const ac = new AbortController();
    stepWatchAbort = ac;
    const sig = ac.signal;

    const finish = () => {
      if (stepWatchAbort !== ac) return;
      clearStepWatchers();
      advanceAfterUserFollows();
    };

    if (action === "click") {
      document.addEventListener("click", (ev) => {
        const t = ev.target;
        if (!(t instanceof Node) || !el.contains(t)) return;
        finish();
      }, { capture: true, signal: sig });
      el.addEventListener("change", () => finish(), { signal: sig });
      return;
    }

    if (action === "type") {
      const want = step.expectedValue || "";
      const check = () => {
        const v = (el.value != null ? String(el.value) : "").trim();
        if (!want) { if (v.length > 0) finish(); }
        else if (v === want || v.includes(want)) { finish(); }
      };
      el.addEventListener("input", check, { signal: sig });
      el.addEventListener("change", check, { signal: sig });
      el.addEventListener("blur", check, { signal: sig });
      return;
    }

    if (action === "scroll") {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.2) { io.disconnect(); finish(); }
        }
      }, { threshold: [0, 0.2, 0.5] });
      sig.addEventListener("abort", () => io.disconnect(), { once: true });
      io.observe(el);
    }
  }

  async function fetchAndShowNextStep() {
    try {
      const data = await callGuide();
      const inst = normInstruction(data.instruction);
      if (!inst) throw new Error("Invalid guide response (no instruction).");
      const view = instructionToView(inst);
      view.audioBase64 = data.audio_base64 ?? data.audioBase64 ?? null;
      history.push(view);
      index = history.length - 1;
      ensureRoot();
      layoutStep();
      writeCheckpoint();
    } catch (e) {
      showError(String(e?.message || e));
    }
  }

  async function advanceGuideCore() {
    const cur = history[index];
    if (cur.isDone) { teardown(); return; }
    if (cur.completedLine) pushCompleted(cur.completedLine);
    writeCheckpoint();
    showLoadingState();
    await fetchAndShowNextStep();
  }

  function showLoadingState() {
    ensureRoot();
    const titleNode = shadow.getElementById("site-guide-title");
    const bodyNode = shadow.getElementById("site-guide-body");
    const progressNode = shadow.getElementById("site-guide-progress");
    const nextBtn = shadow.getElementById("site-guide-next");
    const backBtn = shadow.getElementById("site-guide-back");
    const stepNum = history.length > 0 ? index + 2 : 1;
    if (titleNode) titleNode.textContent = "Loading\u2026";
    if (bodyNode) bodyNode.textContent = "Getting the next step for you\u2026";
    if (progressNode) progressNode.textContent = `Step ${stepNum}`;
    if (nextBtn) nextBtn.style.display = "none";
    if (backBtn) backBtn.style.visibility = "hidden";
    backdropEl.style.pointerEvents = "";
    cardEl.classList.add("is-loading");
    spotlightEl.style.opacity = "0";
    centerCard();
    stopAudioPlayback();
    hideAudioRow();
  }

  async function advanceAfterUserFollows() {
    if (overlayMode === "error") return;
    if (index !== history.length - 1) return;
    const cur = history[index];
    if (cur.isDone) return;
    if (guideAdvancing) return;
    if (cur.completedLine) pushCompleted(cur.completedLine);
    writeCheckpoint();
    guideAdvancing = true;
    showLoadingState();
    await new Promise(r => setTimeout(r, 600));
    try { await fetchAndShowNextStep(); }
    finally { guideAdvancing = false; }
  }

  async function resumeFromNavigationState(s) {
    query = s.query;
    apiBaseUrl = s.apiBaseUrl;
    stepsCompleted = s.stepsCompleted || [];
    overlayMode = "tour";
    history = [];
    index = 0;
    guideAdvancing = true;
    try {
      showLoadingState();
      wireKeyboardResize();
      await fetchAndShowNextStep();
    }
    finally { guideAdvancing = false; }
  }

  async function callGuide() {
    const { elements, pageContext } = extractNaviElements();
    if (!elements.length) throw new Error("No controls found on this page.");
    const res = await chrome.runtime.sendMessage({
      type: "FETCH_GUIDE",
      query,
      elements,
      page_context: pageContext,
      steps_completed: stepsCompleted,
      apiBaseUrl,
    });
    if (!res?.ok) throw new Error(res?.error || "Guide request failed.");
    return res.data;
  }

  function ensureRoot() {
    let host = document.getElementById("site-guide-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "site-guide-root";
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647;width:100vw;height:100vh;pointer-events:none;margin:0;padding:0;border:0;";
      document.documentElement.appendChild(host);
      shadow = host.attachShadow({ mode: "open" });
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("content.css");
      shadow.appendChild(link);

      backdropEl = document.createElement("div");
      backdropEl.id = "site-guide-backdrop";
      spotlightEl = document.createElement("div");
      spotlightEl.id = "site-guide-spotlight";
      cardEl = document.createElement("div");
      cardEl.id = "site-guide-card";

      const closeBtn = document.createElement("button");
      closeBtn.id = "site-guide-close";
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Close guide");
      closeBtn.textContent = "×";

      const progressEl = document.createElement("div");
      progressEl.id = "site-guide-progress";
      const titleEl = document.createElement("h2");
      titleEl.id = "site-guide-title";
      const bodyEl = document.createElement("p");
      bodyEl.id = "site-guide-body";
      const actions = document.createElement("div");
      actions.id = "site-guide-actions";

      const backBtn = document.createElement("button");
      backBtn.id = "site-guide-back";
      backBtn.type = "button";
      backBtn.textContent = "Back";
      const nextBtn = document.createElement("button");
      nextBtn.id = "site-guide-next";
      nextBtn.type = "button";
      nextBtn.textContent = "Next";

      const spinnerEl = document.createElement("div");
      spinnerEl.id = "site-guide-spinner";

      actions.appendChild(backBtn);
      actions.appendChild(nextBtn);
      cardEl.appendChild(closeBtn);
      cardEl.appendChild(progressEl);
      cardEl.appendChild(titleEl);
      cardEl.appendChild(bodyEl);
      cardEl.appendChild(spinnerEl);
      cardEl.appendChild(actions);
      cardEl.classList.add("has-close");

      shadow.appendChild(backdropEl);
      shadow.appendChild(spotlightEl);
      shadow.appendChild(cardEl);

      closeBtn.addEventListener("click", teardown);
      backdropEl.addEventListener("click", (e) => { if (e.target === backdropEl) teardown(); });
      backBtn.addEventListener("click", () => go(-1));
      nextBtn.addEventListener("click", () => go(1));
    } else {
      shadow = host.shadowRoot;
      backdropEl = shadow.getElementById("site-guide-backdrop");
      spotlightEl = shadow.getElementById("site-guide-spotlight");
      cardEl = shadow.getElementById("site-guide-card");
    }
    ensureAudioRow();
  }

  function resolveTarget(selector) {
    if (!selector || typeof selector !== "string") return null;
    try { return document.querySelector(selector); } catch { return null; }
  }

  function rectWithPadding(el, pad = 8) {
    const r = el.getBoundingClientRect();
    const top = Math.max(0, r.top - pad);
    const left = Math.max(0, r.left - pad);
    const width = Math.min(window.innerWidth - left, r.width + pad * 2);
    const height = Math.min(window.innerHeight - top, r.height + pad * 2);
    return { top, left, width, height };
  }

  function centerCard() {
    cardEl.style.top = "50%";
    cardEl.style.left = "50%";
    cardEl.style.transform = "translate(-50%, -50%)";
  }

  function repositionHighlight() {
    if (!history.length || !shadow || !cardEl || !spotlightEl) return;
    const step = history[index];
    const el = resolveTarget(step.selector);
    if (!el) return;
    const { top, left, width, height } = rectWithPadding(el);
    spotlightEl.style.opacity = width && height ? "1" : "0";
    spotlightEl.style.top = `${top}px`;
    spotlightEl.style.left = `${left}px`;
    spotlightEl.style.width = `${width}px`;
    spotlightEl.style.height = `${height}px`;

    const gap = 14;
    const cr = cardEl.getBoundingClientRect();
    let t = top + height + gap;
    let l = left;
    if (t + cr.height > window.innerHeight - 16) t = Math.max(16, top - gap - cr.height);
    if (l + cr.width > window.innerWidth - 16) l = Math.max(16, window.innerWidth - 16 - cr.width);
    cardEl.style.top = `${t}px`;
    cardEl.style.left = `${l}px`;
    cardEl.style.transform = "none";
  }

  function layoutStep() {
    if (!history.length) return;
    clearStepWatchers();
    cardEl.classList.remove("is-loading");

    const step = history[index];
    const titleNode = shadow.getElementById("site-guide-title");
    const bodyNode = shadow.getElementById("site-guide-body");
    const progressNode = shadow.getElementById("site-guide-progress");
    const nextBtn = shadow.getElementById("site-guide-next");
    const backBtn = shadow.getElementById("site-guide-back");

    titleNode.textContent = step.title || "";
    bodyNode.textContent = step.body || "";

    const atLatest = index === history.length - 1;
    const el = resolveTarget(step.selector);
    const action = (step.action || "wait").toLowerCase();
    const canListen = atLatest && overlayMode === "tour" && !step.isDone && el &&
      (action === "click" || action === "type" || action === "scroll");

    progressNode.textContent = canListen
      ? `Step ${index + 1} — follow the highlight on the page`
      : `Step ${index + 1}`;

    backdropEl.style.pointerEvents = canListen ? "none" : "";

    backBtn.style.visibility = overlayMode === "error" || index === 0 ? "hidden" : "visible";
    nextBtn.style.display = "";

    if (overlayMode === "error") {
      nextBtn.textContent = "Close";
    } else if (atLatest && step.isDone) {
      nextBtn.textContent = "Done";
    } else if (canListen) {
      nextBtn.textContent = "Next";
    } else if (index < history.length - 1) {
      nextBtn.textContent = "Next";
    } else {
      nextBtn.textContent = "Skip";
    }

    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      centerCard();
      requestAnimationFrame(() => {
        repositionHighlight();
        attachStepWatchers();
        void syncAudioForCurrentStep();
      });
    } else {
      spotlightEl.style.opacity = "0";
      centerCard();
      attachStepWatchers();
      void syncAudioForCurrentStep();
    }
  }

  async function go(delta) {
    if (delta < 0) {
      if (index > 0) { index -= 1; layoutStep(); }
      return;
    }
    if (overlayMode === "error") { teardown(); return; }
    if (index < history.length - 1) { index += 1; layoutStep(); return; }
    const cur = history[index];
    if (cur.isDone) { teardown(); return; }
    if (guideAdvancing) return;
    guideAdvancing = true;
    try { await advanceGuideCore(); }
    finally { guideAdvancing = false; }
  }

  function showError(message) {
    clearStepWatchers();
    ensureRoot();
    overlayMode = "error";
    history = [{
      title: "Guide could not continue",
      body: message,
      selector: null,
      isDone: true,
      completedLine: "",
      action: "wait",
      expectedValue: "",
      lang: "en-IN",
      ttsText: "",
      audioBase64: null,
    }];
    index = 0;
    layoutStep();
  }

  function teardown() {
    stopAudioPlayback();
    clearCheckpoint();
    clearStepWatchers();
    if (onKey) { window.removeEventListener("keydown", onKey); onKey = null; }
    if (onResize) { window.removeEventListener("resize", onResize); onResize = null; }
    if (onScroll) { window.removeEventListener("scroll", onScroll, true); onScroll = null; }
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
    const host = document.getElementById("site-guide-root");
    if (host) host.remove();
    shadow = undefined;
    backdropEl = undefined;
    spotlightEl = undefined;
    cardEl = undefined;
    history = [];
    index = 0;
    stepsCompleted = [];
    overlayMode = "tour";
    stripNaviAttributes();
  }

  async function start(payload) {
    teardown();
    resumeAttempted = true;
    query = (payload?.userIntent || "").trim();
    apiBaseUrl = (payload?.apiBaseUrl || "http://127.0.0.1:8000").trim().replace(/\/$/, "");

    if (!query) {
      overlayMode = "error";
      ensureRoot();
      history = [{
        title: "Guide could not start",
        body: "Enter your goal in the extension popup.",
        selector: null,
        isDone: true,
        completedLine: "",
        action: "wait",
        expectedValue: "",
        lang: "en-IN",
        ttsText: "",
        audioBase64: null,
      }];
      index = 0;
      onKey = (e) => { if (e.key === "Escape") teardown(); else if (e.key === "ArrowRight") go(1); };
      onResize = () => layoutStep();
      window.addEventListener("keydown", onKey);
      window.addEventListener("resize", onResize);
      layoutStep();
      return;
    }

    stepsCompleted = [];
    history = [];
    index = 0;
    overlayMode = "tour";

    try {
      showLoadingState();
      wireKeyboardResize();
      await fetchAndShowNextStep();
    } catch (e) {
      ensureRoot();
      overlayMode = "error";
      history = [{
        title: "Guide could not start",
        body: String(e?.message || e),
        selector: null,
        isDone: true,
        completedLine: "",
        action: "wait",
        expectedValue: "",
        lang: "en-IN",
        ttsText: "",
        audioBase64: null,
      }];
      index = 0;
      onKey = (e) => { if (e.key === "Escape") teardown(); else if (e.key === "ArrowRight") go(1); };
      onResize = () => layoutStep();
      window.addEventListener("keydown", onKey);
      window.addEventListener("resize", onResize);
      layoutStep();
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "SITE_GUIDE_START") {
      start(msg).then(() => sendResponse({ ok: true })).catch(() => { teardown(); sendResponse({ ok: false }); });
      return true;
    }
    if (msg?.type === "SITE_GUIDE_STOP") { teardown(); }
  });

  function tryResumeAfterNavigation() {
    if (resumeAttempted) return;
    const ck = readCheckpoint();
    if (!ck) return;
    resumeAttempted = true;
    resumeFromNavigationState(ck).catch(() => clearCheckpoint());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryResumeAfterNavigation, { once: true });
  } else {
    tryResumeAfterNavigation();
  }
})();
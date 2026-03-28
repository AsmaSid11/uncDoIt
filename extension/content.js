(function () {
  const FLAG = "__uncdoitSiteGuide";
  if (window[FLAG]) {
    return;
  }
  window[FLAG] = true;

  const NAVI = "data-navi-id";
  /** Survives same-tab navigation (same origin) so step 2 loads after clicking a real link */
  const CHECKPOINT_KEY = "uncdoit_guide_ck_v1";

  let shadow;
  let backdropEl;
  let spotlightEl;
  let cardEl;
  let onKey;
  let onResize;

  /** @type {{ title: string, body: string, selector: string | null, isDone: boolean, completedLine: string, action: string, expectedValue: string }[]} */
  let history = [];
  let index = 0;
  /** @type {string[]} */
  let stepsCompleted = [];
  let query = "";
  let apiBaseUrl = "";
  let overlayMode = "tour";

  /** AbortController for “do the action on the page” listeners */
  let stepWatchAbort = null;
  let guideAdvancing = false;
  let resumeAttempted = false;

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
    } catch {
      /* ignore */
    }
  }

  function clearCheckpoint() {
    try {
      sessionStorage.removeItem(CHECKPOINT_KEY);
    } catch {
      /* ignore */
    }
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
    } catch {
      return null;
    }
  }

  function wireKeyboardResize() {
    if (onKey) return;
    onKey = (e) => {
      if (e.key === "Escape") teardown();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    onResize = () => {
      if (history.length && shadow) layoutStep();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
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

  /** Same shape as frontend/pagecontext.js — matches backend NaviElement + PageContext. */
  function extractNaviElements() {
    const interactive = document.querySelectorAll(
      "button, input, select, textarea, a",
    );
    const elements = [];

    interactive.forEach((el, idx) => {
      el.setAttribute(NAVI, String(idx));
      const entry = {
        navi_id: idx,
        tag: el.tagName,
        id: el.id || "",
        text:
          (el.innerText && el.innerText.trim()) ||
          el.placeholder ||
          el.value ||
          "",
        context: getNearestContext(el),
      };
      if (entry.text || entry.id) elements.push(entry);
    });

    const pageContext = {
      title: document.title || "",
      url: window.location.href,
      path: window.location.pathname,
      pageText: (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000),
    };

    return { elements, pageContext };
  }

  function stripNaviAttributes() {
    document.querySelectorAll(`[${NAVI}]`).forEach((el) => {
      el.removeAttribute(NAVI);
    });
  }

  function playAudioBase64(b64) {
    if (!b64 || typeof b64 !== "string") return;
    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const u = URL.createObjectURL(blob);
      const a = new Audio(u);
      a.addEventListener("ended", () => URL.revokeObjectURL(u));
      a.addEventListener("error", () => URL.revokeObjectURL(u));
      a.play().catch(() => URL.revokeObjectURL(u));
    } catch {
      /* ignore */
    }
  }

  /** Normalize LLM JSON whether API returns snake_case or camelCase. */
  function normInstruction(raw) {
    if (!raw || typeof raw !== "object") return null;
    const nid = raw.navi_id ?? raw.naviId;
    const parsed =
      typeof nid === "number" ? nid : parseInt(String(nid ?? ""), 10);
    return {
      current_task: String(raw.current_task ?? raw.currentTask ?? "").trim(),
      navi_id: Number.isFinite(parsed) ? parsed : -1,
      voice_text: String(raw.voice_text ?? raw.voiceText ?? "").trim(),
      action: String(raw.action ?? "wait"),
      value: String(raw.value ?? ""),
      is_done: Boolean(raw.is_done ?? raw.isDone),
      transcription: String(raw.transcription ?? "").trim(),
    };
  }

  function instructionToView(inst) {
    const title = (inst.current_task || "Next step").trim();
    let body = (inst.voice_text || "").trim();
    const tr = (inst.transcription || "").trim();
    if (tr && tr !== body) {
      body = body ? `${body}\n\n${tr}` : tr;
    }
    if (inst.action === "type" && inst.value) {
      body += body ? `\n\nType: ${inst.value}` : `Type: ${inst.value}`;
    }
    const nid = Number.isFinite(inst.navi_id) ? inst.navi_id : -1;
    const selector = nid >= 0 ? `[${NAVI}="${nid}"]` : null;
    const completedLine = (inst.voice_text || inst.current_task || "").trim();
    return {
      title,
      body,
      selector,
      isDone: Boolean(inst.is_done),
      completedLine,
      action: inst.action || "wait",
      expectedValue: (inst.value || "").trim(),
    };
  }

  function clearStepWatchers() {
    if (stepWatchAbort) {
      stepWatchAbort.abort();
      stepWatchAbort = null;
    }
  }

  /**
   * When viewing the latest non-terminal step, listen for the real UI action
   * (click / type / scroll into view) instead of requiring “Next”.
   */
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
      const onActivate = (ev) => {
        const t = ev.target;
        if (!(t instanceof Node) || !el.contains(t)) return;
        finish();
      };
      document.addEventListener("click", onActivate, {
        capture: true,
        signal: sig,
      });
      return;
    }

    if (action === "type") {
      const want = step.expectedValue || "";
      const check = () => {
        const v = (el.value != null ? String(el.value) : "").trim();
        if (!want) {
          if (v.length > 0) finish();
        } else if (v === want || v.includes(want)) {
          finish();
        }
      };
      el.addEventListener("input", check, { signal: sig });
      el.addEventListener("change", check, { signal: sig });
      el.addEventListener("blur", check, { signal: sig });
      return;
    }

    if (action === "scroll") {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && e.intersectionRatio >= 0.2) {
              io.disconnect();
              finish();
            }
          }
        },
        { threshold: [0, 0.2, 0.5] },
      );
      sig.addEventListener("abort", () => io.disconnect(), { once: true });
      io.observe(el);
    }
  }

  /** Call /api/guide and append one step; clears checkpoint on success. */
  async function fetchAndShowNextStep() {
    try {
      const data = await callGuide();
      const inst = normInstruction(data.instruction);
      if (!inst) throw new Error("Invalid guide response (no instruction).");

      const view = instructionToView(inst);
      history.push(view);
      index = history.length - 1;
      ensureRoot();
      layoutStep();
      playAudioBase64(data.audio_base64 ?? data.audioBase64);
      clearCheckpoint();
    } catch (e) {
      clearCheckpoint();
      showError(String(e?.message || e));
    }
  }

  /** Skip / Next: record completed line, checkpoint, then fetch. */
  async function advanceGuideCore() {
    const cur = history[index];
    if (cur.isDone) {
      teardown();
      return;
    }
    if (cur.completedLine) {
      stepsCompleted.push(cur.completedLine);
    }
    writeCheckpoint();
    await fetchAndShowNextStep();
  }

  /** User followed the highlight (click/type/scroll): step already “done”, merge into steps_completed then fetch. */
  async function advanceAfterUserFollows() {
    if (overlayMode === "error") return;
    if (index !== history.length - 1) return;
    const cur = history[index];
    if (cur.isDone) return;
    if (guideAdvancing) return;
    if (cur.completedLine) {
      stepsCompleted.push(cur.completedLine);
    }
    writeCheckpoint();
    guideAdvancing = true;
    try {
      await fetchAndShowNextStep();
    } finally {
      guideAdvancing = false;
    }
  }

  /** After a full page load, continue guide using saved checkpoint (same tab, same origin). */
  async function resumeFromNavigationState(s) {
    query = s.query;
    apiBaseUrl = s.apiBaseUrl;
    stepsCompleted = s.stepsCompleted || [];
    overlayMode = "tour";
    history = [];
    index = 0;
    guideAdvancing = true;
    try {
      await fetchAndShowNextStep();
      wireKeyboardResize();
    } finally {
      guideAdvancing = false;
    }
  }

  async function callGuide() {
    const { elements, pageContext } = extractNaviElements();
    if (!elements.length) {
      throw new Error(
        "No controls found on this page (buttons, links, inputs).",
      );
    }
    const res = await chrome.runtime.sendMessage({
      type: "FETCH_GUIDE",
      query,
      elements,
      page_context: pageContext,
      steps_completed: stepsCompleted,
      apiBaseUrl,
    });
    if (!res?.ok) {
      throw new Error(res?.error || "Guide request failed.");
    }
    return res.data;
  }

  function ensureRoot() {
    let host = document.getElementById("site-guide-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "site-guide-root";
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

      actions.appendChild(backBtn);
      actions.appendChild(nextBtn);
      cardEl.appendChild(closeBtn);
      cardEl.appendChild(progressEl);
      cardEl.appendChild(titleEl);
      cardEl.appendChild(bodyEl);
      cardEl.appendChild(actions);
      cardEl.classList.add("has-close");

      shadow.appendChild(backdropEl);
      shadow.appendChild(spotlightEl);
      shadow.appendChild(cardEl);

      closeBtn.addEventListener("click", teardown);
      backdropEl.addEventListener("click", (e) => {
        if (e.target === backdropEl) teardown();
      });
      backBtn.addEventListener("click", () => go(-1));
      nextBtn.addEventListener("click", () => go(1));
    } else {
      shadow = host.shadowRoot;
      backdropEl = shadow.getElementById("site-guide-backdrop");
      spotlightEl = shadow.getElementById("site-guide-spotlight");
      cardEl = shadow.getElementById("site-guide-card");
    }
  }

  function resolveTarget(selector) {
    if (!selector || typeof selector !== "string") return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
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

  function layoutStep() {
    if (!history.length) return;
    clearStepWatchers();

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
    const canListen =
      atLatest &&
      overlayMode === "tour" &&
      !step.isDone &&
      el &&
      (action === "click" || action === "type" || action === "scroll");

    progressNode.textContent = canListen
      ? `Step ${index + 1} — follow the highlight on the page`
      : `Step ${index + 1}`;

    backBtn.style.visibility =
      overlayMode === "error" || index === 0 ? "hidden" : "visible";

    nextBtn.style.display = "";
    if (overlayMode === "error") {
      nextBtn.textContent = "Close";
    } else if (atLatest && step.isDone) {
      nextBtn.textContent = "Done";
    } else if (canListen) {
      nextBtn.style.display = "none";
    } else if (index < history.length - 1) {
      nextBtn.textContent = "Next";
    } else {
      nextBtn.textContent = "Skip";
    }

    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      requestAnimationFrame(() => {
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
        if (t + cr.height > window.innerHeight - 16) {
          t = Math.max(16, top - gap - cr.height);
        }
        if (l + cr.width > window.innerWidth - 16) {
          l = Math.max(16, window.innerWidth - 16 - cr.width);
        }
        cardEl.style.top = `${t}px`;
        cardEl.style.left = `${l}px`;
        cardEl.style.transform = "none";
        attachStepWatchers();
      });
    } else {
      spotlightEl.style.opacity = "0";
      centerCard();
      attachStepWatchers();
    }
  }

  async function go(delta) {
    if (delta < 0) {
      if (index > 0) {
        index -= 1;
        layoutStep();
      }
      return;
    }

    if (overlayMode === "error") {
      teardown();
      return;
    }

    if (index < history.length - 1) {
      index += 1;
      layoutStep();
      return;
    }

    const cur = history[index];
    if (cur.isDone) {
      teardown();
      return;
    }

    if (guideAdvancing) return;
    guideAdvancing = true;
    try {
      await advanceGuideCore();
    } finally {
      guideAdvancing = false;
    }
  }

  function showError(message) {
    clearStepWatchers();
    ensureRoot();
    overlayMode = "error";
    history = [
      {
        title: "Guide could not continue",
        body: message,
        selector: null,
        isDone: true,
        completedLine: "",
        action: "wait",
        expectedValue: "",
      },
    ];
    index = 0;
    layoutStep();
  }

  function teardown() {
    clearCheckpoint();
    clearStepWatchers();
    if (onKey) {
      window.removeEventListener("keydown", onKey);
      onKey = null;
    }
    if (onResize) {
      window.removeEventListener("resize", onResize);
      onResize = null;
    }
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
    apiBaseUrl = (payload?.apiBaseUrl || "http://127.0.0.1:8000")
      .trim()
      .replace(/\/$/, "");

    if (!query) {
      overlayMode = "error";
      ensureRoot();
      history = [
        {
          title: "Guide could not start",
          body: "Enter your goal in the extension popup.",
          selector: null,
          isDone: true,
          completedLine: "",
          action: "wait",
          expectedValue: "",
        },
      ];
      index = 0;
      onKey = (e) => {
        if (e.key === "Escape") teardown();
        else if (e.key === "ArrowRight") go(1);
      };
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
      const data = await callGuide();
      const inst = normInstruction(data.instruction);
      if (!inst) throw new Error("Invalid guide response (no instruction).");

      const view = instructionToView(inst);
      history.push(view);
      index = 0;

      ensureRoot();
      wireKeyboardResize();
      layoutStep();
      playAudioBase64(data.audio_base64 ?? data.audioBase64);
      clearCheckpoint();
    } catch (e) {
      ensureRoot();
      overlayMode = "error";
      history = [
        {
          title: "Guide could not start",
          body: String(e?.message || e),
          selector: null,
          isDone: true,
          completedLine: "",
          action: "wait",
          expectedValue: "",
        },
      ];
      index = 0;
      onKey = (e) => {
        if (e.key === "Escape") teardown();
        else if (e.key === "ArrowRight") go(1);
      };
      onResize = () => layoutStep();
      window.addEventListener("keydown", onKey);
      window.addEventListener("resize", onResize);
      layoutStep();
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SITE_GUIDE_START") {
      start(msg).catch(() => teardown());
    }
    if (msg?.type === "SITE_GUIDE_STOP") {
      teardown();
    }
  });

  function tryResumeAfterNavigation() {
    if (resumeAttempted) return;
    const ck = readCheckpoint();
    if (!ck) return;
    resumeAttempted = true;
    resumeFromNavigationState(ck).catch(() => clearCheckpoint());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryResumeAfterNavigation, {
      once: true,
    });
  } else {
    tryResumeAfterNavigation();
  }
})();


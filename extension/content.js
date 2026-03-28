(function () {
  const FLAG = "__uncdoitSiteGuide";
  if (window[FLAG]) {
    return;
  }
  window[FLAG] = true;

  let shadow;
  let steps = [];
  let index = 0;
  let backdropEl;
  let spotlightEl;
  let cardEl;
  let onKey;

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
      closeBtn.setAttribute("aria-label", "Close tour");
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
    const step = steps[index];
    const titleNode = shadow.getElementById("site-guide-title");
    const bodyNode = shadow.getElementById("site-guide-body");
    const progressNode = shadow.getElementById("site-guide-progress");
    const nextBtn = shadow.getElementById("site-guide-next");
    const backBtn = shadow.getElementById("site-guide-back");

    titleNode.textContent = step.title || "";
    bodyNode.textContent = step.body || "";
    progressNode.textContent = `Step ${index + 1} of ${steps.length}`;

    backBtn.style.visibility = index === 0 ? "hidden" : "visible";
    nextBtn.textContent = index >= steps.length - 1 ? "Done" : "Next";

    const el = resolveTarget(step.selector);
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
      });
    } else {
      spotlightEl.style.opacity = "0";
      centerCard();
    }
  }

  function go(delta) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      teardown();
      return;
    }
    index = next;
    layoutStep();
  }

  function onResize() {
    if (steps.length) layoutStep();
  }

  function teardown() {
    if (onKey) {
      window.removeEventListener("keydown", onKey);
      onKey = null;
    }
    window.removeEventListener("resize", onResize);
    const host = document.getElementById("site-guide-root");
    if (host) host.remove();
    shadow = undefined;
    backdropEl = undefined;
    index = 0;
    steps = [];
    spotlightEl = undefined;
    cardEl = undefined;
  }

  onKey = (e) => {
    if (e.key === "Escape") teardown();
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  };

  async function start() {
    ensureRoot();
    const url = chrome.runtime.getURL("tour.json");
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load tour.json");
    steps = await res.json();
    if (!Array.isArray(steps) || !steps.length) {
      throw new Error("tour.json has no steps");
    }
    index = 0;
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    layoutStep();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SITE_GUIDE_START") {
      start().catch(() => {
        teardown();
      });
    }
    if (msg?.type === "SITE_GUIDE_STOP") {
      teardown();
    }
  });
})();

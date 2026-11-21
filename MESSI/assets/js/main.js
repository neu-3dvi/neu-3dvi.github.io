// MESSI project page behaviour. No dependencies.
// Videos carry data-src and load only when they come near the viewport; they play while
// visible and pause when scrolled away. With prefers-reduced-motion nothing autoplays:
// posters show, and clicking a clip opens it in the lightbox with controls.
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- lazy, visibility-driven playback ---------- */
  const loadSrc = (v) => {
    if (v.dataset.src && v.getAttribute("src") !== v.dataset.src) {
      v.src = v.dataset.src;
      v.preload = "auto";
    }
  };
  const tryPlay = (v) => {
    if (reduce || v.dataset.userPaused) return;
    loadSrc(v);
    const p = v.play();
    if (p) p.catch(() => {});
  };
  const visible = new WeakSet();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        visible.add(v);
        loadSrc(v);
        tryPlay(v);
      } else {
        visible.delete(v);
        if (!v.paused) v.pause();
      }
    }
  }, { rootMargin: "200px 0px", threshold: 0.15 });
  $$("video[data-src]").forEach((v) => {
    v.muted = true;            // required for autoplay; the renders have no audio anyway
    v.playsInline = true;
    io.observe(v);
  });

  /* swap a video's source (variants, tabs) and keep playing if it is on screen */
  const swap = (v, src, poster) => {
    v.pause();
    v.dataset.src = src;
    if (poster) v.poster = poster;
    v.removeAttribute("src");
    v.load();
    loadSrc(v);
    if (visible.has(v)) tryPlay(v);
  };

  /* ---------- play / pause buttons on large videos ---------- */
  $$(".ctrl[aria-controls]").forEach((btn) => {
    const v = $("#" + btn.getAttribute("aria-controls"));
    const sync = () => {
      const paused = v.paused;
      btn.classList.toggle("paused", paused);
      btn.setAttribute("aria-label", paused ? "Play video" : "Pause video");
    };
    btn.addEventListener("click", () => {
      if (v.paused) { delete v.dataset.userPaused; loadSrc(v); v.play().catch(() => {}); }
      else { v.dataset.userPaused = "1"; v.pause(); }
    });
    v.addEventListener("play", sync);
    v.addEventListener("pause", sync);
    sync();
  });

  /* ---------- chips that follow a video (hero montage, chain episode): data-chips-for="<video id>",
     each chip carries data-t = its segment's start in seconds ---------- */
  $$("[data-chips-for]").forEach((group) => {
    const v = document.getElementById(group.dataset.chipsFor);
    const chips = $$("[data-t]", group);
    if (!v || !chips.length) return;
    const starts = chips.map((c) => parseFloat(c.dataset.t));
    let current = -1;
    const mark = () => {
      const t = v.currentTime;
      let i = 0;
      while (i + 1 < starts.length && t >= starts[i + 1] - 0.02) i++;
      if (i !== current) {
        chips.forEach((c, k) => {
          c.classList.toggle("on", k === i);
          c.setAttribute("aria-current", k === i ? "true" : "false");
        });
        current = i;
      }
    };
    v.addEventListener("timeupdate", mark);
    chips.forEach((c, k) => c.addEventListener("click", () => {
      loadSrc(v);
      v.currentTime = starts[k] + 0.01;
      delete v.dataset.userPaused;
      v.play().catch(() => {});
      mark();
    }));
    mark();
  });

  /* ---------- skill-card variants ---------- */
  $$(".variants").forEach((group) => {
    const card = group.closest(".card");
    const box = $(".vbox", card);
    const v = $("video", card);
    group.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.getAttribute("aria-pressed") === "true") return;
      $$("button", group).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      swap(v, b.dataset.src, b.dataset.poster);
      box.dataset.caption = `${$("h3", card).textContent} · ${b.textContent}`;
    });
  });

  /* ---------- tabs (segmented controls) ---------- */
  $$("[role=tablist]").forEach((list) => {
    const tabs = $$("[role=tab]", list);
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = t.getAttribute("aria-controls") && $("#" + t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      list.dispatchEvent(new CustomEvent("tabchange", { detail: tab }));
    };
    list.addEventListener("click", (e) => {
      const t = e.target.closest("[role=tab]");
      if (t) select(t);
    });
    list.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });

  /* ---------- long-horizon player: one video, tabs swap the source ---------- */
  const player = $(".player");
  if (player) {
    const v = $("video", player);
    const bar = $(".progress i", player);
    const label = $(".meta .l", player);
    const time = $(".meta .t", player);
    const box = $(".vbox", player);
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    $(".seg", player.parentElement).addEventListener("tabchange", (e) => {
      const t = e.detail;
      swap(v, t.dataset.src, t.dataset.poster);
      label.textContent = t.dataset.label;
      box.dataset.caption = t.dataset.label;
      bar.style.transform = "scaleX(0)";
    });
    const tick = () => {
      if (v.duration) {
        bar.style.width = "100%";
        bar.style.transform = `scaleX(${v.currentTime / v.duration})`;
        time.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
      }
      if (!v.paused) requestAnimationFrame(tick);
    };
    v.addEventListener("play", () => requestAnimationFrame(tick));
    v.addEventListener("seeked", tick);
    v.addEventListener("loadedmetadata", tick);
  }

  /* ---------- lightbox ---------- */
  const lb = $("#lightbox");
  if (lb && typeof lb.showModal === "function") {
    const lv = $("video", lb);
    const cap = $(".lb-cap", lb);
    const open = (src, poster, caption) => {
      lv.poster = poster || "";
      lv.src = src;
      cap.textContent = caption || "";
      lb.showModal();
      lv.play().catch(() => {});
    };
    document.addEventListener("click", (e) => {
      // a separate enlarge button that points at a video by id (used where the video box is not itself a button)
      const btn = e.target.closest("[data-lightbox-for]");
      if (btn) {
        const v = document.getElementById(btn.dataset.lightboxFor);
        if (v) open(v.dataset.src, v.poster, btn.dataset.caption || "");
        return;
      }
      const box = e.target.closest("button.vbox");
      if (!box) return;
      const v = $("video", box);
      const src = v.dataset.src;
      const caption = box.dataset.caption
        || box.closest("figure, .card")?.querySelector("figcaption, h3")?.textContent || "";
      open(src, v.poster, caption);
    });
    $(".lb-close", lb).addEventListener("click", () => lb.close());
    lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); }); // backdrop
    lb.addEventListener("close", () => { lv.pause(); lv.removeAttribute("src"); lv.load(); });
  } else if (lb) {
    lb.remove();
  }

  /* ---------- nav: hairline on scroll, active section ---------- */
  const nav = $(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const links = new Map($$(".nav-links a").map((a) => [a.getAttribute("href").slice(1), a]));
  const secIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a, id) => a.classList.toggle("on", id === e.target.id));
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  // observe every section, so passing one that has no nav link (hero, stats, G1) clears the highlight
  $$("main > section, main > header").forEach((s) => secIO.observe(s));

  /* ---------- reveal on scroll ---------- */
  const rio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add("in"); rio.unobserve(e.target); }
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => rio.observe(el));

  /* ---------- copy BibTeX ---------- */
  const copy = $(".cite .copy");
  if (copy) {
    copy.addEventListener("click", async () => {
      const text = $(".cite pre").textContent.trim();
      try { await navigator.clipboard.writeText(text); }
      catch {
        const r = document.createRange();
        r.selectNodeContents($(".cite pre"));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        document.execCommand("copy");
        s.removeAllRanges();
      }
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1600);
    });
  }

  /* ---------- results: animated grouped bars from #results-data (paper Tables 2 and 5) ----------
     Bars grow from the baseline when the block scrolls into view and again on every tab switch; the "Ours" values
     count up. Hover / focus a bar for its value; hover / click a legend entry to highlight one method. Every value is
     also in the table view. All text goes in through textContent. */
  const rdata = $("#results-data");
  const rroot = $("#results-root");
  if (rdata && rroot) {
    const R = JSON.parse(rdata.textContent);
    const M = R.methods;
    const tip = $("#res-tip");
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const fmt = (v, d) => Number(v).toFixed(d);

    const head = (title, better) => {
      const h = el("div", "r-head");
      h.append(el("div", null, title), el("span", null, better === "lower" ? "Lower is better" : "Higher is better"));
      return h;
    };
    const grid = (chart, max, unit) => {
      const g = el("div", "r-grid"); g.setAttribute("aria-hidden", "true");
      const ticks = max === 100 ? [0, 25, 50, 75, 100] : [...Array(max + 1).keys()];
      ticks.forEach((t, k) => {
        const x = (t / max) * 100 + "%";
        const i = el("i"); i.style.left = x; g.append(i);
        const b = el("b", null, k === ticks.length - 1 ? t + unit : String(t)); b.style.left = x; g.append(b);
      });
      chart.append(g);
    };
    const bar = (m, v, max, digits, unit, delay, labelled, rowLabel) => {
      const b = el("div", "r-bar");
      b.dataset.m = m.key; b.dataset.row = rowLabel; b.dataset.val = fmt(v, digits) + unit;
      b.tabIndex = 0;
      b.setAttribute("role", "img");
      b.setAttribute("aria-label", `${m.full}, ${rowLabel}: ${fmt(v, digits)}${unit}`);
      b.style.setProperty("--c", m.color);
      b.style.setProperty("--v", Math.min(v / max, 1));
      b.style.setProperty("--d", delay + "ms");
      b.append(el("span", "r-fill"));
      if (labelled) {
        const s = el("span", "r-val", fmt(v, digits));
        s.dataset.to = v; s.dataset.digits = digits; s.dataset.delay = delay;
        b.append(s);
      }
      return b;
    };
    const grouped = (panel, set) => {
      const chart = el("div", "r-chart");
      grid(chart, set.max, set.unit);
      set.rows.forEach((row, gi) => {
        chart.append(el("div", "r-label", row.label));
        const bars = el("div", "r-bars");
        M.forEach((m, bi) => {
          if (row.v[m.key] == null) return;
          bars.append(bar(m, row.v[m.key], set.max, set.digits, set.unit, gi * 90 + bi * 45, m.key === "ours", row.label));
        });
        chart.append(bars);
      });
      panel.append(head(set.title, set.better), chart);
    };
    const native = (panel, set) => {
      const wrap = el("div", "r-native");
      set.charts.forEach((c, ci) => {
        const box = el("div");
        const chart = el("div", "r-chart");
        grid(chart, c.max, c.unit);
        M.forEach((m, bi) => {
          if (c.v[m.key] == null) return;
          chart.append(el("div", "r-label", m.name));
          const bars = el("div", "r-bars");
          bars.append(bar(m, c.v[m.key], c.max, c.digits, c.unit, ci * 150 + bi * 70, true, c.title));
          chart.append(bars);
        });
        box.append(head(c.title, c.better), chart);
        wrap.append(box);
      });
      panel.append(wrap, el("p", "r-note", set.note));
    };
    $$(".r-panel", rroot).forEach((p) => (p.dataset.set === "native" ? native(p, R.native) : grouped(p, R[p.dataset.set])));

    // legend: hover / focus highlights a method, click pins it
    const legend = $("#res-legend");
    let pinned = null;
    const highlight = (key) => $$(".r-bar", rroot).forEach((b) => b.classList.toggle("dim", key != null && b.dataset.m !== key));
    M.forEach((m) => {
      const li = el("li"); const btn = el("button"); btn.type = "button";
      btn.setAttribute("aria-pressed", "false");
      const sw = el("i"); sw.style.setProperty("--c", m.color);
      btn.append(sw, document.createTextNode(m.name));
      btn.addEventListener("mouseenter", () => highlight(m.key));
      btn.addEventListener("focus", () => highlight(m.key));
      btn.addEventListener("mouseleave", () => highlight(pinned));
      btn.addEventListener("blur", () => highlight(pinned));
      btn.addEventListener("click", () => {
        pinned = pinned === m.key ? null : m.key;
        $$("button", legend).forEach((x) => x.setAttribute("aria-pressed", String(x === btn && pinned === m.key)));
        highlight(pinned);
      });
      li.append(btn); legend.append(li);
    });

    // tooltip on bars (pointer and keyboard focus)
    const showTip = (b) => {
      const m = M.find((x) => x.key === b.dataset.m);
      const line = el("span"); const key = el("em"); key.style.setProperty("--c", m.color);
      line.append(key, document.createTextNode(`${m.full} · ${b.dataset.row}`));
      tip.replaceChildren(el("strong", null, b.dataset.val), line);
      tip.hidden = false;
      const rr = rroot.getBoundingClientRect(), fr = $(".r-fill", b).getBoundingClientRect(), br = b.getBoundingClientRect();
      const x = Math.min(Math.max(fr.right - rr.left, 110), rr.width - 110);
      tip.style.left = x + "px"; tip.style.top = br.top - rr.top + "px";
    };
    rroot.addEventListener("pointerover", (e) => { const b = e.target.closest(".r-bar"); if (b) showTip(b); });
    rroot.addEventListener("pointerout", (e) => { if (e.target.closest(".r-bar")) tip.hidden = true; });
    rroot.addEventListener("focusin", (e) => { const b = e.target.closest(".r-bar"); if (b) showTip(b); });
    rroot.addEventListener("focusout", () => { tip.hidden = true; });

    // grow the bars (and count the labelled values up) for the panel on show
    const countUp = (s) => {
      const to = +s.dataset.to, dg = +s.dataset.digits;
      if (reduce) { s.textContent = fmt(to, dg); return; }
      const t0 = performance.now() + +s.dataset.delay, dur = 950;
      const step = (now) => {
        const u = Math.min(1, Math.max(0, (now - t0) / dur));
        s.textContent = fmt(to * (1 - Math.pow(1 - u, 3)), dg);
        if (u < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const play = (panel) => {
      if (!panel) return;
      $$(".r-chart", panel).forEach((c) => { c.classList.remove("on"); void c.offsetWidth; c.classList.add("on"); });
      $$(".r-val", panel).forEach(countUp);
    };
    const current = () => $$(".r-panel", rroot).find((p) => !p.hidden);
    let seen = false;
    new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting) && !seen) { seen = true; play(current()); obs.disconnect(); }
    }, { threshold: 0.25 }).observe(rroot);
    $("#res-tabs").addEventListener("tabchange", (e) => {
      tip.hidden = true;
      play(document.getElementById(e.detail.getAttribute("aria-controls")));
    });

    // table view: the same numbers, best value per row in bold
    const tbox = $("#res-table");
    const table = (caption, colHead, cols, rows, better) => {
      const t = el("table"); t.append(el("caption", null, caption));
      const thead = el("thead"); const hr = el("tr");
      hr.append(el("th", null, colHead)); cols.forEach((c) => hr.append(el("th", null, c.full)));
      thead.append(hr); t.append(thead);
      const tb = el("tbody");
      rows.forEach((r) => {
        const tr = el("tr"); tr.append(el("td", null, r.label));
        const vals = cols.map((c) => r.v[c.key]).filter((v) => v != null);
        const best = better === "lower" ? Math.min(...vals) : Math.max(...vals);
        cols.forEach((c) => {
          const v = r.v[c.key];
          const td = el("td", v != null && v === best ? "best" : null, v == null ? "–" : fmt(v, r.digits));
          tr.append(td);
        });
        tb.append(tr);
      });
      t.append(tb); tbox.append(t);
    };
    // table columns in the paper's order, keeping only the methods on the page
    const order = ["skillx", "student", "sti", "fullft", "pertrans", "ours"].map((k) => M.find((m) => m.key === k)).filter(Boolean);
    const asRows = (set) => set.rows.map((r) => ({ label: r.label, v: r.v, digits: set.digits }));
    table(R.transitions.title, "Transition", order, asRows(R.transitions), "higher");
    table(R.chains.title, "Skill chain", order, asRows(R.chains), "higher");
    R.native.charts.forEach((c) => table(c.title, "Metric", order, [{ label: c.title, v: c.v, digits: c.digits }], c.better));
    const tbtn = $(".r-tablebtn", rroot);
    tbtn.addEventListener("click", () => {
      const open = tbox.hidden;
      tbox.hidden = !open;
      tbtn.setAttribute("aria-expanded", String(open));
      tbtn.textContent = open ? "Hide the table" : "Show as a table";
    });
  }
})();

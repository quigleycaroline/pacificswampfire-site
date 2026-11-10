(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* images fade in once loaded */
  const reveal = (img) => img.classList.add("is-in");
  document.querySelectorAll(".ph img").forEach((img) => {
    if (img.complete && img.naturalWidth) reveal(img);
    else { img.addEventListener("load", () => reveal(img), { once: true });
           img.addEventListener("error", () => reveal(img), { once: true }); }
  });

  /* masonry: pack tiles into the shortest column, keeping reading order left to right */
  document.querySelectorAll(".wall").forEach((wall) => {
    const tiles = [...wall.querySelectorAll(".tile")];
    const max = +wall.dataset.cols || 4;
    let current = 0;
    const pack = () => {
      const w = wall.clientWidth;
      const n = w < 640 ? 2 : w < 1100 ? Math.min(3, max) : max;
      if (n === current) return;
      current = n;
      const cols = Array.from({ length: n }, () => { const c = document.createElement("div"); c.className = "col"; return c; });
      const h = new Array(n).fill(0);
      tiles.forEach((t) => {
        const k = h.indexOf(Math.min(...h));
        cols[k].appendChild(t);
        h[k] += 1 / parseFloat(t.dataset.ar) + 0.03;   // height of a unit-width tile, plus gutter
      });
      wall.replaceChildren(...cols);
      wall.classList.add("is-packed");
    };
    pack();
    let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(pack, 120); });
  });

  /* home gallery: regroup rows for the screen width. Same rules as the build: equal-height rows,
     varied density, no lone vertical on wide screens. Phones get one or two photos per row. */
  const galleries = [...document.querySelectorAll(".gallery")];
  if (galleries.length) {
    const WIDE = [1.5, 2.6, 3.4, 2.2, 3.0, 1.5, 3.6, 2.4], NARROW = [1.0, 1.5, 1.2, 1.7, 0.9, 1.4];
    const groupRows = (ars, targets, maxK, singleMin) => {
      const rows = []; let i = 0, t = 0;
      while (i < ars.length) {
        const target = targets[t++ % targets.length]; let best = 0, bestErr = Infinity, acc = 0;
        for (let k = 1; k <= maxK && i + k <= ars.length; k++) {
          acc += ars[i + k - 1];
          if (k === 1 && ars[i] < singleMin) continue;
          const err = Math.abs(acc - target);
          if (err < bestErr) { best = k; bestErr = err; }
        }
        if (!best) best = Math.min(2, ars.length - i);
        rows.push([i, best]); i += best;
      }
      if (rows.length > 1) {
        const [s, k] = rows[rows.length - 1];
        if (ars.slice(s, s + k).reduce((a, b) => a + b, 0) < singleMin) { rows.pop(); rows[rows.length - 1][1] += k; }
      }
      return rows;
    };
    let mode = "";
    const layout = () => {
      const m = innerWidth <= 760 ? "narrow" : "wide";
      if (m === mode) return;
      mode = m;
      galleries.forEach((g) => {
        const tiles = [...g.querySelectorAll(".tile")];
        const ars = tiles.map((t) => parseFloat(t.dataset.ar));
        const rows = m === "narrow" ? groupRows(ars, NARROW, 2, 0) : groupRows(ars, WIDE, 4, 1.3);
        g.querySelectorAll(".row").forEach((r) => r.remove());
        rows.forEach(([s, k]) => {
          const row = document.createElement("div");
          row.className = "row"; row.dataset.n = k;
          row.style.setProperty("--n", k);
          row.style.setProperty("--sum", ars.slice(s, s + k).reduce((a, b) => a + b, 0).toFixed(4));
          row.append(...tiles.slice(s, s + k));
          g.append(row);
        });
      });
    };
    layout();
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
  }

  /* mobile menu */
  const btn = document.querySelector(".menu-btn"), nav = document.getElementById("nav");
  if (btn) btn.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open); btn.textContent = open ? "Close" : "Menu";
  });

  /* header steps aside while scrolling down */
  const head = document.getElementById("head");
  let lastY = scrollY, ticking = false;
  addEventListener("scroll", () => {
    if (ticking || (nav && nav.classList.contains("is-open"))) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      if (y > 200 && y > lastY + 4) head.classList.add("is-hidden");
      else if (y < lastY - 4 || y < 200) head.classList.remove("is-hidden");
      lastY = y; ticking = false;
    });
  }, { passive: true });

  /* contact form: send in place, show a short confirmation */
  const form = document.getElementById("contact-form");
  if (form) {
    const status = form.querySelector(".form-status"), send = form.querySelector(".send");
    if (location.search.includes("sent=1")) status.textContent = "Thank you. Your message is on its way.";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (form._honey && form._honey.value) return;
      send.disabled = true; status.textContent = "Sending…";
      try {
        const r = await fetch(form.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), {
          method: "POST", headers: { Accept: "application/json" }, body: new FormData(form) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.success === "false" || d.success === false) throw new Error(d.message || "failed");
        form.reset(); status.textContent = "Thank you. Your message is on its way.";
      } catch (err) {
        status.textContent = "That didn’t go through. Please try again in a moment.";
      } finally { send.disabled = false; }
    });
  }

  /* lightbox */
  const lb = document.getElementById("lb");
  const dataEl = document.getElementById("lb-data");
  if (!lb || !dataEl) return;
  const items = JSON.parse(dataEl.textContent);
  const onHome = document.body.classList.contains("p-home");
  const [sAvif, sWebp] = lb.querySelectorAll("source");
  const img = lb.querySelector("img");
  const count = lb.querySelector(".lb-count");
  const cap = lb.querySelector(".lb-cap");
  let i = 0, opener = null;

  const preload = (k) => {
    const it = items[(k + items.length) % items.length];
    const p = new Image(); p.sizes = "100vw"; p.srcset = it.webp; p.src = it.src;
  };
  const show = (k) => {
    i = (k + items.length) % items.length;
    const it = items[i];
    img.classList.add("is-loading");
    sAvif.srcset = it.avif; sWebp.srcset = it.webp; sAvif.sizes = sWebp.sizes = "100vw";
    img.width = it.w; img.height = it.h; img.alt = it.alt; img.src = it.src;
    const done = () => img.classList.remove("is-loading");
    if (img.complete) requestAnimationFrame(done); else img.onload = img.onerror = done;
    count.textContent = `${i + 1} / ${items.length}`;
    cap.replaceChildren();
    if (onHome) {
      cap.textContent = it.caption && it.caption !== it.collection ? `${it.collection}, ${it.caption}` : it.collection;
    } else if (it.caption) cap.textContent = it.caption;
    preload(i + 1); preload(i - 1);
  };
  const open = (k, from) => { opener = from; show(k); lb.showModal(); document.body.classList.add("lb-open"); };
  lb.addEventListener("close", () => {
    document.body.classList.remove("lb-open");
    if (opener) opener.focus({ preventScroll: true });
  });

  document.querySelectorAll(".tile[data-i]").forEach((b) => b.addEventListener("click", () => open(+b.dataset.i, b)));
  lb.querySelector(".lb-next").addEventListener("click", () => show(i + 1));
  lb.querySelector(".lb-prev").addEventListener("click", () => show(i - 1));
  lb.querySelector(".lb-close").addEventListener("click", () => lb.close());
  lb.querySelector(".lb-stage").addEventListener("click", (e) => {
    if (e.target === img) show(i + 1); else lb.close();
  });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); show(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
  });
  let sx = 0, sy = 0;
  lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) show(i + (dx < 0 ? 1 : -1));
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) lb.close();
  }, { passive: true });
})();

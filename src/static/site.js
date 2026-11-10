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
      const a = document.createElement("a"); a.href = it.url; a.textContent = it.collection; cap.append(a);
      if (it.caption) cap.append(` — ${it.caption}`);
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

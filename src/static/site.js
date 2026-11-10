(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* images fade in once decoded */
  const reveal = (img) => img.classList.add("is-in");
  document.querySelectorAll(".ph img").forEach((img) => {
    if (img.complete && img.naturalWidth) reveal(img);
    else { img.addEventListener("load", () => reveal(img), { once: true });
           img.addEventListener("error", () => reveal(img), { once: true }); }
  });

  /* header steps aside while scrolling down, returns on scroll up */
  const head = document.getElementById("head");
  let lastY = scrollY, ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      head.classList.toggle("is-hidden", y > 160 && y > lastY + 4);
      if (y < lastY - 4 || y < 160) head.classList.remove("is-hidden");
      lastY = y; ticking = false;
    });
  }, { passive: true });

  /* home index: cover follows the cursor */
  const peek = document.querySelector(".peek");
  if (peek && matchMedia("(hover: hover) and (pointer: fine)").matches && !reduce) {
    const pimg = peek.querySelector("img");
    let x = 0, y = 0, raf = 0;
    const place = () => { peek.style.left = x + "px"; peek.style.top = y + "px"; raf = 0; };
    document.querySelectorAll(".index-row").forEach((row) => {
      new Image().src = row.dataset.peek;
      row.addEventListener("mouseenter", () => {
        pimg.src = row.dataset.peek; peek.style.background = row.dataset.tone; peek.classList.add("is-on");
      });
      row.addEventListener("mouseleave", () => peek.classList.remove("is-on"));
      row.addEventListener("mousemove", (e) => {
        x = Math.min(e.clientX + 200, innerWidth - peek.offsetWidth / 2 - 24); y = e.clientY;
        if (!raf) raf = requestAnimationFrame(place);
      });
    });
  }

  /* lightbox */
  const lb = document.getElementById("lb");
  const dataEl = document.getElementById("lb-data");
  if (!lb || !dataEl) return;
  const items = JSON.parse(dataEl.textContent);
  const [sAvif, sWebp] = lb.querySelectorAll("source");
  const img = lb.querySelector("img");
  const count = lb.querySelector(".lb-count");
  const cap = lb.querySelector(".lb-cap");
  const pad = (n) => String(n).padStart(2, "0");
  let i = 0, opener = null;

  const preload = (k) => {
    const it = items[(k + items.length) % items.length];
    const pic = new Image(); pic.sizes = "100vw"; pic.srcset = it.webp; pic.src = it.src;
  };
  const show = (k) => {
    i = (k + items.length) % items.length;
    const it = items[i];
    img.classList.add("is-loading");
    sAvif.srcset = it.avif; sWebp.srcset = it.webp; sAvif.sizes = sWebp.sizes = "100vw";
    img.width = it.w; img.height = it.h; img.alt = it.alt; img.src = it.src;
    const done = () => img.classList.remove("is-loading");
    if (img.complete) requestAnimationFrame(done); else img.onload = img.onerror = done;
    count.textContent = `${pad(i + 1)} / ${pad(items.length)}`;
    cap.textContent = it.caption || "";
    preload(i + 1); preload(i - 1);
  };
  const open = (k, from) => {
    opener = from; show(k);
    lb.showModal(); document.body.classList.add("lb-open");
  };
  const close = () => lb.close();
  lb.addEventListener("close", () => {
    document.body.classList.remove("lb-open");
    if (opener) opener.focus({ preventScroll: true });
  });

  document.querySelectorAll("button.ph[data-i]").forEach((b) =>
    b.addEventListener("click", () => open(+b.dataset.i, b)));
  lb.querySelector(".lb-next").addEventListener("click", () => show(i + 1));
  lb.querySelector(".lb-prev").addEventListener("click", () => show(i - 1));
  lb.querySelector(".lb-close").addEventListener("click", close);
  lb.querySelector(".lb-stage").addEventListener("click", (e) => {
    if (e.target === img) { show(i + 1); return; }     // click image: advance
    close();                                            // click the margin: close
  });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); show(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
  });

  /* swipe */
  let sx = 0, sy = 0;
  lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) show(i + (dx < 0 ? 1 : -1));
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) close();
  }, { passive: true });
})();

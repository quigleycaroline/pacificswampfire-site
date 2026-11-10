#!/usr/bin/env python3
"""
Portfolio builder.

  photos/<NN-collection-name>/        one folder per collection
      collection.yml                  title, place, year, intro, cover, captions, layout (all optional)
      01.jpg 02.jpg ...               images, sequenced by filename unless collection.yml says otherwise
  site.yml                            name, bio, contact, hero image, base URL

Run:  python3 build.py            -> writes dist/
      python3 build.py --serve    -> builds, then serves dist/ on http://localhost:8000

Image derivatives are cached in .cache/ keyed by file content, so rebuilding
300 photographs only re-encodes the ones that changed.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape
from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parent
import os
PHOTOS = Path(os.environ.get("PORTFOLIO_PHOTOS", ROOT / "photos"))   # override only for testing
SRC = ROOT / "src"
DIST = ROOT / "dist"
CACHE = ROOT / ".cache" / "img"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}
WIDTHS = [640, 1024, 1600, 2400]          # responsive derivative widths
FALLBACK_W = 1600                          # JPEG fallback + social preview
AVIF_Q, WEBP_Q, JPEG_Q = 64, 84, 86
ENCODER_VERSION = "v1"                     # bump to force a full re-encode

SRGB = ImageCms.createProfile("sRGB")


# --------------------------------------------------------------------------- models

@dataclass
class Photo:
    file: Path
    collection_slug: str
    index: int = 0
    width: int = 0
    height: int = 0
    tone: str = "#e9e5dc"                  # average colour, used as the loading placeholder
    avif: list = field(default_factory=list)
    webp: list = field(default_factory=list)
    fallback: str = ""
    alt: str = ""
    caption: str = ""
    collection_title: str = ""

    @property
    def ratio(self) -> float:
        return self.width / self.height if self.height else 1.0

    @property
    def orient(self) -> str:
        r = self.ratio
        return "L" if r > 1.12 else "P" if r < 0.9 else "S"

    def srcset(self, kind: str) -> str:
        return ", ".join(f"{u} {w}w" for w, u in getattr(self, kind))

    def lightbox(self) -> dict:
        return {"avif": self.srcset("avif"), "webp": self.srcset("webp"), "src": self.fallback,
                "w": self.width, "h": self.height, "alt": self.alt, "caption": self.caption,
                "collection": self.collection_title, "url": f"/work/{self.collection_slug}/"}


@dataclass
class Collection:
    slug: str
    folder: Path
    title: str
    meta: dict
    photos: list[Photo]
    blocks: list = field(default_factory=list)
    number: int = 0

    @property
    def cover(self) -> Photo:
        name = self.meta.get("cover")
        for p in self.photos:
            if p.file.name == name:
                return p
        return self.photos[0]

    @property
    def url(self) -> str:
        return f"/work/{self.slug}/"


# --------------------------------------------------------------------------- images

def file_hash(path: Path) -> str:
    h = hashlib.sha1(ENCODER_VERSION.encode())
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def open_srgb(path: Path) -> Image.Image:
    """Open, apply EXIF rotation, convert to sRGB. Metadata (incl. GPS) is not carried over."""
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    icc = im.info.get("icc_profile")
    if im.mode not in ("RGB", "RGBA", "L", "CMYK"):
        im = im.convert("RGB")
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            im = ImageCms.profileToProfile(im, src, SRGB, outputMode="RGB",
                                           renderingIntent=ImageCms.Intent.PERCEPTUAL)
        except Exception:
            im = im.convert("RGB")
    if im.mode != "RGB":
        im = im.convert("RGB")
    return im


def process_photo(p: Photo) -> None:
    key = file_hash(p.file)
    cdir = CACHE / key
    manifest = cdir / "manifest.json"
    if not manifest.exists():
        cdir.mkdir(parents=True, exist_ok=True)
        im = open_srgb(p.file)
        w, h = im.size
        widths = [x for x in WIDTHS if x < w] + [min(w, WIDTHS[-1])]
        widths = sorted(set(widths))
        out = {"w": w, "h": h, "widths": widths}
        for tw in widths:
            th = round(h * tw / w)
            r = im.resize((tw, th), Image.LANCZOS) if tw != w else im
            r.save(cdir / f"{tw}.avif", "AVIF", quality=AVIF_Q, speed=6)
            r.save(cdir / f"{tw}.webp", "WEBP", quality=WEBP_Q, method=5)
        fw = min(FALLBACK_W, w)
        fb = im.resize((fw, round(h * fw / w)), Image.LANCZOS) if fw != w else im
        fb.save(cdir / "fallback.jpg", "JPEG", quality=JPEG_Q, progressive=True, optimize=True)
        avg = im.resize((1, 1), Image.BOX).getpixel((0, 0))
        out["tone"] = "#%02x%02x%02x" % avg
        manifest.write_text(json.dumps(out))
        print(f"  encoded  {p.collection_slug}/{p.file.name}")
    m = json.loads(manifest.read_text())
    p.width, p.height, p.tone = m["w"], m["h"], m["tone"]

    stem = slugify(p.file.stem)
    outdir = DIST / "img" / p.collection_slug
    outdir.mkdir(parents=True, exist_ok=True)
    for tw in m["widths"]:
        for kind in ("avif", "webp"):
            name = f"{stem}-{key[:8]}-{tw}.{kind}"
            shutil.copyfile(cdir / f"{tw}.{kind}", outdir / name)
            getattr(p, kind).append((tw, f"/img/{p.collection_slug}/{name}"))
    fname = f"{stem}-{key[:8]}.jpg"
    shutil.copyfile(cdir / "fallback.jpg", outdir / fname)
    p.fallback = f"/img/{p.collection_slug}/{fname}"


# --------------------------------------------------------------------------- sequencing

def auto_blocks(photos: list[Photo]) -> list[dict]:
    """
    Editorial sequence from aspect ratios alone:
      - opens on a full-bleed landscape, or an offset portrait
      - portraits/squares pair up; a lone vertical sits off-centre, alternating sides
      - landscapes alternate between wide inset and shifted inset, with a
        full-bleed roughly every fifth block so the rhythm opens up
    """
    blocks, q = [], list(photos)
    side, inset_turn, since_full = 0, 0, 0
    while q:
        p = q.pop(0)
        first = not blocks
        if p.orient == "L":
            if first or since_full >= 4:
                blocks.append({"type": "full", "photos": [p]}); since_full = 0
            else:
                blocks.append({"type": ("inset", "inset-right", "inset-left")[inset_turn % 3], "photos": [p]})
                inset_turn += 1; since_full += 1
        else:
            nxt = q[0] if q else None
            if nxt and nxt.orient != "L" and not first:
                blocks.append({"type": "pair", "photos": [p, q.pop(0)]})
            else:
                blocks.append({"type": ("offset-left", "offset-right")[side % 2], "photos": [p]})
                side += 1
            since_full += 1
    return blocks


BLOCK_TYPES = {"full", "inset", "inset-left", "inset-right", "offset-left", "offset-right", "pair", "center"}


def manual_blocks(seq: list, photos: list[Photo], where: str) -> list[dict]:
    by_name = {p.file.name: p for p in photos}
    used, blocks = set(), []
    for item in seq:
        if not isinstance(item, dict) or len(item) != 1:
            sys.exit(f"{where}: each layout line looks like  - full: 01.jpg   or   - pair: [02.jpg, 03.jpg]")
        (kind, names), = item.items()
        if kind not in BLOCK_TYPES:
            sys.exit(f"{where}: unknown layout '{kind}'. Use one of: {', '.join(sorted(BLOCK_TYPES))}")
        names = names if isinstance(names, list) else [names]
        if kind == "pair" and len(names) != 2:
            sys.exit(f"{where}: 'pair' needs exactly two images")
        ps = []
        for n in names:
            if n not in by_name:
                sys.exit(f"{where}: layout mentions '{n}' but there's no such file in the folder")
            ps.append(by_name[n]); used.add(n)
        blocks.append({"type": kind, "photos": ps})
    rest = [p for p in photos if p.file.name not in used]
    return blocks + (auto_blocks(rest) if rest else [])


# --------------------------------------------------------------------------- content

def slugify(s: str) -> str:
    s = re.sub(r"^\d+[-_ ]+", "", s)               # drop ordering prefix "01-"
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "untitled"


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return yaml.safe_load(path.read_text()) or {}
    except yaml.YAMLError as e:
        sys.exit(f"Couldn't read {path.relative_to(ROOT)}: {e}")


def load_collections() -> list[Collection]:
    cols = []
    folders = sorted([d for d in PHOTOS.iterdir() if d.is_dir() and not d.name.startswith(("_", "."))],
                     key=natural_key)
    for d in folders:
        meta = load_yaml(d / "collection.yml")
        if meta.get("hidden"):
            continue
        files = sorted([f for f in d.iterdir() if f.suffix.lower() in IMAGE_EXT and not f.name.startswith(".")],
                       key=natural_key)
        if not files:
            continue
        slug = meta.get("slug") or slugify(d.name)
        title = meta.get("title") or re.sub(r"^\d+[-_ ]+", "", d.name).replace("-", " ").title()
        texts = meta.get("images") or {}
        photos = []
        for i, f in enumerate(files):
            t = texts.get(f.name) or {}
            if isinstance(t, str):
                t = {"caption": t}
            photos.append(Photo(file=f, collection_slug=slug, caption=t.get("caption", ""), collection_title=title,
                                alt=t.get("alt") or t.get("caption") or f"{title}, photograph {i + 1} of {len(files)}"))
        cols.append(Collection(slug=slug, folder=d, title=title, meta=meta, photos=photos))
    cols.sort(key=lambda c: (c.meta.get("order", 999),))
    for n, c in enumerate(cols, 1):
        c.number = n
    return cols


def find_photo(cols: list[Collection], ref: str | None) -> Photo | None:
    if not ref:
        return None
    folder, _, name = ref.partition("/")
    for c in cols:
        if folder in (c.slug, c.folder.name):
            for p in c.photos:
                if p.file.name == name:
                    return p
    sys.exit(f"site.yml: hero '{ref}' not found. Use  collection-folder/filename.jpg")


def auto_featured(cols: list[Collection], per: int) -> list[Photo]:
    """Home wall: the cover plus evenly spaced frames from each collection, interleaved."""
    picks = []
    for c in cols:
        n = len(c.photos); k = min(per, n)
        idx = sorted({round(j * (n - 1) / max(k - 1, 1)) for j in range(k)})
        chosen = [c.cover] + [c.photos[j] for j in idx if c.photos[j] is not c.cover]
        picks.append(chosen[:k])
    out = []
    for r in range(max(map(len, picks), default=0)):
        for lst in picks:
            if r < len(lst):
                out.append(lst[r])
    return out


# --------------------------------------------------------------------------- build

def build() -> None:
    site = load_yaml(ROOT / "site.yml")
    site.setdefault("name", "Studio")
    site["base_url"] = (site.get("base_url") or "").rstrip("/")
    site["year"] = date.today().year

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    cols = load_collections()
    if not cols:
        print("No collections yet: add a folder of photographs to photos/ and run again.")
    print(f"{len(cols)} collections, {sum(len(c.photos) for c in cols)} photographs")

    for c in cols:
        for i, p in enumerate(c.photos):
            p.index = i
            process_photo(p)
        seq = c.meta.get("layout")
        c.blocks = manual_blocks(seq, c.photos, f"{c.folder.name}/collection.yml") if seq else auto_blocks(c.photos)

    hero = find_photo(cols, site.get("hero")) or (cols[0].cover if cols else None)
    featured = [find_photo(cols, r) for r in site.get("featured") or []] or auto_featured(cols, site.get("featured_per_collection", 7))
    portrait = find_photo(cols, site.get("portrait"))

    env = Environment(loader=FileSystemLoader(SRC / "templates"), autoescape=select_autoescape(["html", "xml"]),
                      trim_blocks=True, lstrip_blocks=True)
    asset_v = hashlib.sha1(b"".join((SRC / "static" / n).read_bytes() for n in ("site.css", "site.js"))).hexdigest()[:10]
    env.globals.update(site=site, collections=cols, v=asset_v)

    def render(tpl: str, out: str, **ctx) -> None:
        path = DIST / out
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(env.get_template(tpl).render(**ctx))

    og = (lambda p: f"{site['base_url']}{p.fallback}" if p else "")
    lb = lambda ps: json.dumps([p.lightbox() for p in ps])
    render("home.html", "index.html", page="home", featured=featured, lightbox=lb(featured),
           og_image=og(hero), path="/")
    render("work.html", "work/index.html", page="work", og_image=og(hero), path="/work/", title="Collections")
    for i, c in enumerate(cols):
        nxt = cols[(i + 1) % len(cols)] if len(cols) > 1 else None
        prv = cols[i - 1] if len(cols) > 1 else None
        render("collection.html", f"work/{c.slug}/index.html", page="collection", c=c, next_c=nxt, prev_c=prv,
               lightbox=lb(c.photos), og_image=og(c.cover), path=c.url, title=c.title,
               description=(c.meta.get("intro") or "").strip())
    render("about.html", "about/index.html", page="about", portrait=portrait, og_image=og(hero),
           path="/about/", title="About")
    render("contact.html", "contact/index.html", page="contact", contact_image=find_photo(cols, site.get("contact_image")),
           og_image=og(hero), path="/contact/", title="Contact")
    render("404.html", "404.html", page="404", title="Not found", path="/404")

    # static assets, sitemap, robots, CNAME
    shutil.copytree(SRC / "static", DIST / "static")
    shutil.copyfile(SRC / "static" / "favicon.svg", DIST / "favicon.svg")
    urls = ["/", "/work/", "/about/", "/contact/"] + [c.url for c in cols]
    base = site["base_url"]
    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{base}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")
    domain = re.sub(r"^https?://", "", base)
    if domain and "localhost" not in domain and "github.io" not in domain:
        (DIST / "CNAME").write_text(domain + "\n")
    (DIST / ".nojekyll").write_text("")
    # Cloudflare Pages: image files are content-hashed, so they can be cached forever.
    (DIST / "_headers").write_text(
        "/img/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/static/*\n  Cache-Control: public, max-age=31536000, immutable\n")
    print(f"Built {len(urls)} pages -> dist/")


if __name__ == "__main__":
    build()
    if "--serve" in sys.argv:
        import functools, http.server
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
        print("Serving on http://localhost:8000  (Ctrl+C to stop)")
        http.server.ThreadingHTTPServer(("", 8000), handler).serve_forever()

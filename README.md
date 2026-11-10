# Portfolio

A static photography site. Each folder in `photos/` is a collection; the site rebuilds and republishes itself whenever you add or change anything.

## Add photographs

1. Make a folder in `photos/`, numbered for order: `photos/04-salt-flats/`
2. Drop in JPEGs (or PNG/TIFF/WebP). They appear in filename order: `01.jpg`, `02.jpg`…
3. Optional: copy `photos/_TEMPLATE/collection.yml` into the folder for a title, place, year, intro, captions, cover or a hand-set layout.
4. Commit. On GitHub you can do all of this in the browser: open the folder → **Add file → Upload files** → **Commit changes**. The site is live again ~2–6 minutes later.

To add to an existing collection, just upload into its folder. To hide one, set `hidden: true`.

## Files

Export at the long edge you want viewed (3000–4000 px is plenty), sRGB or Adobe RGB, high-quality JPEG. Keep full-resolution masters in your own archive; GitHub repos are comfortable up to ~1 GB, roughly 400–600 web-export photographs. Location/camera metadata is stripped from everything published.

## Site text

Name, bio, email, Instagram and the opening image live in `site.yml`.

## Preview locally (optional)

    pip install -r requirements.txt
    python3 build.py --serve     # http://localhost:8000

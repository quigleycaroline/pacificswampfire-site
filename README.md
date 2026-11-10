# Pacific Swampfire

Photography portfolio for pacificswampfire.studio. Every push rebuilds and republishes the site in a few minutes.

## How the photos work
All photos live in `photos/gallery/`. The home page shows them in filename order: `01.jpg` first.

- **Add a photo:** drop a JPEG into `photos/gallery/`. Name it to slot in where you want it (`41.jpg` goes at the end; `05b.jpg` sits between 05 and 06).
- **Remove a photo:** delete the file.
- **Reorder:** rename files, or use the Photo Arranger in Claude and ask Claude to apply it.
- **Hover location:** set in `photos/gallery/collection.yml`, e.g. `07.jpg: {location: "Zion Lodge, Utah"}`. Remove `guess: true` once it's right.

## Site text
`site.yml`: About text (`**bold**`, `*italic*`), contact settings, the image used when the site is shared as a link.

## Publish
GitHub Desktop: **Fetch/Pull origin** first, make changes, write a short summary, **Commit to main**, **Push origin**.
Progress: github.com/quigleycaroline/pacificswampfire-site/actions (green check = live).

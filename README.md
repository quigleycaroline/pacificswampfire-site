# Pacific Swampfire

Photography portfolio for pacificswampfire.studio. Each folder in `photos/` is one collection. Every change you push rebuilds and republishes the site in a few minutes.

## Add photos to a collection
Drop JPEGs into its folder, e.g. `photos/03-arches/`. They show in filename order, so name new ones to slot in where you want (`11.jpg`, or `04b.jpg` to sit between 04 and 05).

## Remove photos
Delete the file from its folder. It disappears from the site, and from the home page if it was featured.

## Reorder photos
Rename files. Order is alphabetical/numeric by filename.

## Start a new collection
Make a folder named with a number and place: `photos/08-big-sur/`. Add photos. Optionally copy `photos/_TEMPLATE/collection.yml` in to set a title, place, year, intro line, cover image or captions. Without it, the folder name becomes the title ("Big Sur").

## Reorder or rename collections
The home page shows every collection in folder-number order; each photo appears once.
Collections appear in folder-number order. Rename `05-grand-canyon` to `02-grand-canyon` to move it up. The title comes from `title:` in that folder's `collection.yml`.

## Hide a collection without deleting it
Add `hidden: true` to its `collection.yml`.

## Site-wide text
`site.yml`: wordmark, About text, contact heading, which photo sits beside About and Contact, and which photos lead the home page.

## Publish
GitHub Desktop: write a short summary → **Commit to main** → **Push origin**. Or on github.com: open a folder → **Add file → Upload files**, or open a photo → **⋯ → Delete file** → **Commit changes**.
Check progress at github.com/quigleycaroline/pacificswampfire-site/actions (green check = live).

# The Brand Rule (cannot be violated)

> **All collateral and assets for Stuck in Line must conform to the stuckinline.com guides.**
> This rule has no exceptions, no overrides, and no "just this once".

## What the rule covers

"Collateral and assets" means everything made for or about Stuck in Line, by anyone (people or AI):

- the game UI, CSS, HTML, in-game copy and 3D scene styling
- web metadata, Open Graph, Twitter/X cards, favicons and icons
- social posts and images (Instagram, Facebook, X, TikTok and so on), ads, thumbnails, banners
- emails, press material, decks, documents, posters, stickers, merchandise
- any new file under `public/`, `brand/` or any marketing folder

## The guides it points to

1. [`DESIGN-GUIDE.md`](DESIGN-GUIDE.md): colour, type, shape, layout, imagery
2. [`STYLE-GUIDE.md`](STYLE-GUIDE.md): name, voice, copy, what we never say
3. [`tokens.json`](tokens.json): the exact values

If the guides and a request disagree, the guides win. If the guides need to change, change them first, in their own commit, then make the asset.

## How it is enforced

1. **Before making anything:** read the three files above.
2. **While making it:** use only tokens from `tokens.json`. Bake raster assets with `scripts/build-brand-assets.py`; do not hand-draw off-palette art.
3. **Before committing:** `npm run brand:check` must pass. It verifies required metadata, asset sizes and that every colour in `public/*.css` and `public/*.html` is a brand token. It runs automatically on `npm test` and in the git `pre-commit` hook (`.githooks/pre-commit`; enable once with `git config core.hooksPath .githooks`).
4. **If an asset cannot conform, it is not made.** Do not ship a near-miss with a note. Ask for a guide change instead.
5. **AI agents:** this rule is mirrored in `CLAUDE.md` and applies to every task in this repository, including tasks that do not mention it.

## Changing the guides

Only the owner of stuckinline.com changes the guides. A change updates `tokens.json`, both guides if affected, and rebuilds all assets in the same commit, so nothing is ever left on the old look.

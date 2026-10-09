# PP48 — Color Palette Identifier

A small browser app that loads an image and automatically reports the color
palette it is built from, with the hex code of every color.

Palette extraction uses [**lokesh/color-thief**](https://github.com/lokesh/color-thief)
(median-cut quantization, MIT). Everything runs client-side — the image is
never uploaded anywhere.

**Live demo:** <https://awootofu.github.io/PP48-color-palette/>

---

## Features

| # | Requirement | How it is met |
|---|-------------|---------------|
| 1 | Load image from source | Drag & drop, file picker, paste (`Ctrl`+`V`), remote URL, or one of the 4 bundled samples |
| 2 | Identify the palette + hex codes automatically | As soon as an image is selected the app runs Color Thief and renders the dominant color and the full palette with `#RRGGBB` codes, `rgb()` values, light/dark label, and click-to-copy |
| 3 | Deploy to `*.github.io` | Static site published with GitHub Pages from the `main` branch root |

Extras: palette size slider (2–20 colors), quality selector, "Download palette PNG",
plain hex list, and friendly errors for CORS-blocked images and `file://` pages.

## Project structure

```
PP48-color-palette/
├── index.html              single page app
├── styles.css              dark, responsive UI
├── app.js                  loading + Color Thief integration + rendering
├── vendor/
│   ├── color-thief.min.js  Color Thief v2.6.0 browser build (MIT)
│   └── color-thief.umd.js  same file, UMD name, for CommonJS users
├── images/samples/         sample images (generated, see tools/)
├── tools/make_samples.py   regenerates the sample images (PIL)
└── tests/                  Playwright end-to-end verification
```

## Run it locally

ES modules and canvas pixel reads need a real origin, so serve the folder
instead of double-clicking `index.html`:

```bash
cd PP48-color-palette
python -m http.server 8787
# open http://127.0.0.1:8787/
```

> Opening `index.html` directly as `file://` shows the preview but cannot read
> pixels — browsers treat it as an opaque origin. The app detects this and tells
> you to serve it over http:// instead.

## How the palette is produced

```js
const thief = new ColorThief();
const palette = thief.getPalette(imageElement, 8, 10); // colorCount, quality
// -> [[196, 60, 44], [156, 92, 180], ...]
const dominant = palette[0];
```

`getPalette()` builds a canvas from the `<img>`, samples every `quality`-th pixel,
and runs median-cut quantization to cluster the colors into `colorCount` buckets.
Every RGB triplet is then formatted as `#RRGGBB` for display and copying.

## Verification

The app is tested in a real browser (real canvas, real Color Thief build):

```bash
cd PP48-color-palette/tests
npm install
npx playwright install chromium
python make-reference.py                     # reference palettes via PIL
python -m http.server 8787 --directory ..    # serve the app
node verify.js http://127.0.0.1:8787/
```

`make-reference.py` computes each sample's palette independently with PIL's
median-cut. `verify.js` then checks the browser output matches it, so the test
proves the colors really come from the image rather than just asserting that
swatches exist. Latest run: **14/14 checks passed**.

## Deployment

GitHub Pages, `main` branch root (`/`). Nothing to build — the repo *is* the site.

```bash
git add . && git commit -m "..." && git push origin main
```

## Credits

- Color Thief — Lokesh Dhakar, MIT — <https://github.com/lokesh/color-thief>
- Sample images are generated procedurally by `tools/make_samples.py`.
# JanyuTech website (redesign)

**Live:** https://janyutech.duckdns.org

A static rebuild of every page of janyutech.com (55 pages), with the original content and a new design.

**The home page** is set on a rooftop terrace above the sea, rendered in Blender. JanyuTech's quadruped, rover and Kara robot arm stand under blue cherry blossom, by day or by night.

- **Loader.** The JanyuTech mark and logo appear with a count to 100, then an iris opens onto the terrace.
- **Hero.** The view moves in depth with the cursor. A WebGL shader shifts the render by a depth map made from the same scene: near things move one way and far things the other, on a spring that overshoots a little. Phones get a slow drift instead. The hotspots and the title move with the view. **View products** goes to `/products/`.
- **The sections below:**
  - a pale sheet with a band of words that runs with the scroll;
  - five reasons, with the icons from janyutech.com;
  - the quote, over the orange Varaha sludge cleaner;
  - the concept, whose words fill in as you scroll;
  - Make in India, running sideways along a circuit trace;
  - the terrace from above, drawn as a blueprint and scanned into the real render;
  - the products, each drawn as a blueprint first and then scanned into its photo;
  - the industries, in two running bands;
  - what we do, with a light pill that springs from line to line;
  - the film from janyutech.com's home page;
  - an Engineering band of outlined words;
  - the credentials;
  - the last view, which the footer slides up over like a sheet.

**On every page:**

- **Type.** One typeface, Inter Tight, on one fixed scale: each size is the body size times a power of 1.333 (1.25 on phones).
- **Corner controls.** Logo, menu and scroll bar sit on frosted white chips, so they read the same over photos, blue panels and light sections.
- **Elasticity.** Pictures lean with the speed of the scroll and spring back. Buttons, cards and the menu give like springs, and pill buttons lean towards the pointer.
- **Petals.** Blue petals drift down the screen; the scroll carries them and the pointer pushes them aside.
- **Text.** Headings rise out of a blur, and small labels decode from random characters.
- **Navigation.** The menu opens as a circle out of the Menu button, and pages change behind a blue veil.

Everything is readable without JavaScript. Visitors who ask for reduced motion get it still.

## Folder layout

| Path | What it is |
| --- | --- |
| `index.html`, `*/index.html` | The built pages (one folder per URL, same URLs as the old site) |
| `styles.css` | The base: colours, the type scale, the corner chips, menu, loader, footer, lightbox |
| `site.css` | Pill buttons, running bands, slider controls, every home-page section and every inner-page component |
| `main.js` | All behaviour. It runs on every page and switches on what each page has: smooth scrolling (Lenis) with GSAP ScrollTrigger, the reveals, the hero's WebGL depth parallax, sliders, petals, bands and springs |
| `assets/scene/` | The terrace renders. `hero-depth.webp` and `hero-m-depth.webp` are the hero's depth maps. `aerial-bp.webp` is the aerial view as a line drawing |
| `assets/blossom/` | The looping blossom sprays (transparent VP9 `.webm` for Chrome and Firefox, HEVC `.mov` for Safari, and a poster for each) and the petal used as a bullet |
| `assets/icons/` | The five "why choose us" icons from janyutech.com |
| `assets/video/` | The film from janyutech.com's home page (H.264) and its poster |
| `assets/bp/` | Robot photos and their matching blueprint drawings (made by `build/blueprint.py`) |
| `assets/img/` | Every site image, converted to WebP |
| `assets/docs/` | The PDFs the site links to (brochure, internship, course details, Saturday Talk) |
| `build/` | The generator, the extracted content, and the Blender scripts for the renders (`build/render/`) |

## Editing content and rebuilding

All page text lives in `build/content.json`. The home page's own copy (the reasons, the products, the industries, the notes on the blueprint) is at the bottom of `build/build.py`. Change either, then run (needs Pillow: `pip install Pillow`, because image sizes decide which pages get a banner and which cards show cutouts):

```bash
python3 build/build.py
```

That rewrites every page. Two checks come with it:

```bash
python3 build/check_links.py
```

confirms every internal link, anchor, image and PDF exists.

`python3 build/verify.py build/raw` compares each built page, word for word, with the saved copy of the original site in `build/raw` (needs `beautifulsoup4`).

### The renders

The terrace images come from `build/render/terrace.py`, run in Blender 5.2 (Cycles on the GPU). It links the robots from `robots.blend`, which `build/render/make_lib.py` builds from the robot models. Each view is a camera in `SHOTS`:

```bash
blender -b --factory-startup -P build/render/terrace.py -- --shot hero --time day --res 2400 1800 --samples 256 --out hero-day.png
blender -b --factory-startup -P build/render/terrace.py -- --shot hero --time day --res 1200 900 --out hero-depth.png --depth
blender -b --factory-startup -P build/render/terrace.py -- --shot aerial --time day --res 2400 1500 --out aerial-lines.png --lines
python3 build/render/depth_map.py hero-depth.png assets/scene/hero-depth.webp 800 600 9
```

`--depth` renders how far each pixel is. `depth_map.py` turns that into the parallax map (the phone version is `--shot hero_m`, at 600 × 1000, converted to 420 × 700 with 7). `--lines` draws the view as a blueprint. Convert the PNGs to WebP to put them in `assets/scene/`. The blossom videos come from `build/render/blossom.py`.

### Blueprint images

The blueprint versions of robot photos are generated, not drawn by hand. To add or change them, run:

```bash
python3 build/blueprint.py 2024-04-Some-Robot.webp
```

It needs Pillow and numpy. Renders on white backgrounds give the cleanest drawings.

## Hosting (current setup)

- **GitHub Pages:** every push to `main` runs `.github/workflows/pages.yml`. It publishes the site within about 15 seconds, leaving out `build/`, this README and the repo files.
- **Domain:** `janyutech.duckdns.org` is a free DuckDNS name. Its IP is set to `185.199.108.153` (GitHub Pages), and it is configured as the custom domain in the repo's Pages settings, with HTTPS enforced. GitHub issues and renews the certificate automatically.
- **Keep the DuckDNS IP fixed:** do **not** run a DuckDNS auto-update script or router setting for this name. Those set the IP to your own internet connection, and the site would go offline.
- **Old address:** `subhodeep2002.github.io/janyutech-website/` redirects to the domain above.
- **SEO tags:** canonical tags and `sitemap.xml` still point to `https://janyutech.com`, so search engines treat janyutech.com as the real site.

## Moving it to janyutech.com

Upload everything **except the `build/` folder** to the web root, on any static host (cPanel/Apache, Netlify, Vercel, S3). The URLs match the old WordPress site, so existing Google results and bookmarks keep working. `sitemap.xml`, `robots.txt` and `404.html` are included.

Links between pages are relative, so the site also works under a sub-path. For a local preview, serve the folder rather than opening the files:

```bash
python3 -m http.server 5190
```

Then open http://localhost:5190.

## Things to know

- **Contact form:** there is no server, so **Submit** opens the visitor's email app with the message addressed to sales@janyutech.com. To receive submissions directly instead, point the form at a service such as Formspree or your own endpoint (`form[data-mailto]` in `main.js`).
- **Hero parallax:** it needs WebGL. Without it, or with reduced motion, the hero shows the plain renders and still switches between day and night. Its strength is `AMT` in `depthHero()` in `main.js`.
- **Blossom videos:** only the spray most in view plays at a time, because two transparent videos decoding at once pull Chrome down to 30 frames a second. The others hold still and sway gently.
- **Links fixed during the rebuild:** a few menu and card links were broken on the old site (wrong page, anchor typos or an old URL). They now point to the right sections. The fixes are listed in `LINK_FIX` in `build/build.py`.

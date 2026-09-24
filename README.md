# JanyuTech website (redesign)

A static rebuild of every page of janyutech.com (55 pages), with the original content and a new design:
smooth scrolling, letter-by-letter title reveals, the liquid "black hole" mouse effect, page transitions, a mega-menu, sliders, a lightbox, tabs and more.

## Folder layout

| Path | What it is |
| --- | --- |
| `index.html`, `*/index.html` | The built pages (one folder per URL, same URLs as the old site) |
| `styles.css` | Base styles and the home page |
| `site.css` | Header, menus, footer and every inner-page component |
| `main.js` | All interaction and animation (runs on every page, switches on what each page has) |
| `fluid.js` | The WebGL liquid / black-hole mouse effect |
| `hero.js` | Home hero: pointer parallax, the blueprint → photo robot stage, blossom branches and falling petals |
| `assets/bp/` | Robot photos and their matching blueprint drawings (made by `build/blueprint.py`) |
| `assets/img/` | Every site image, converted to WebP |
| `assets/docs/` | The PDFs the site links to (brochure, internship, course details, Saturday Talk) |
| `build/` | The generator and the extracted content |

## Editing content and rebuilding

All page text lives in `build/content.json`. Change it, then run:

```bash
python3 build/build.py
```

That rewrites every page. Two checks come with it:

```bash
python3 build/check_links.py
```

confirms every internal link, anchor, image and PDF exists.

`python3 build/verify.py build/raw` compares each built page, word for word, with the saved copy of the original site in `build/raw` (needs `beautifulsoup4`).

### Blueprint images

The blueprint versions of robot photos are generated, not drawn by hand. To add or change them (for example after swapping a hero robot in `STAGE` inside `build/build.py`), run:

```bash
python3 build/blueprint.py 2024-04-Some-Robot.webp
```

It needs Pillow and numpy. Renders on white backgrounds give the cleanest drawings.

## Deploying

Upload everything **except the `build/` folder** to the web root of janyutech.com. Any static host works (cPanel/Apache, Netlify, Vercel, S3). The URLs match the old WordPress site, so existing Google results and bookmarks keep working. `sitemap.xml`, `robots.txt` and `404.html` are included.

Pages need to be served from a web server rather than opened as files, because links start with `/`. For a local preview, run:

```bash
python3 -m http.server 5178
```

and open http://localhost:5178.

## Things to know

- **Contact form:** there is no server, so **Submit** opens the visitor's email app with the message addressed to sales@janyutech.com. To receive submissions directly instead, point the form at a service such as Formspree or your own endpoint (`form[data-mailto]` in `main.js`).
- **Mouse effect:** runs only on desktop browsers with a mouse, and only on images served from the same domain. Phones, touch screens and visitors who turn on "reduce motion" get the plain images.
- **Links fixed during the rebuild:** a few menu and card links were broken on the old site (wrong page, anchor typos or an old URL). They now point to the right sections. The fixes are listed in `LINK_FIX` in `build/build.py`.

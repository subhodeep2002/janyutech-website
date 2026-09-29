# JanyuTech website (redesign)

**Live:** https://janyutech.duckdns.org

A static rebuild of every page of janyutech.com (55 pages), with the original content and a new design:
a landing page where visitors drive one of our robots through a small 3D world, smooth scrolling, letter-by-letter title reveals, a liquid-flow effect on photos, page transitions, a full-screen menu, sliders, a lightbox, tabs and more.

## Folder layout

| Path | What it is |
| --- | --- |
| `index.html`, `*/index.html` | The built pages (one folder per URL, same URLs as the old site) |
| `styles.css` | Base styles and the home page |
| `site.css` | Header, menus, footer and every inner-page component |
| `main.js` | All interaction and animation (runs on every page, switches on what each page has), including the Menu: it opens as a circle growing out of the Menu button |
| `fluid.js` | FluidFlow: photos flow like liquid around the pointer, then settle (a small WebGL fluid simulation, no colour split or zoom) |
| `world.js` | The landing's first screen: a dark, hilly world (three.js from jsDelivr) where you pick the Defence Bot or the Quad Bot and drive it with W A S D. Scrolling floods it and the field film comes up out of the water |
| `world.css` | Styles for that first screen |
| `assets/models/` | The two robots as 3D models (GLB) and the pictures on their cards |
| `assets/video/` | The field film and its poster |
| `assets/bp/` | Robot photos and their matching blueprint drawings (made by `build/blueprint.py`) |
| `assets/img/` | Every site image, converted to WebP |
| `assets/docs/` | The PDFs the site links to (brochure, internship, course details, Saturday Talk) |
| `build/` | The generator and the extracted content |

## Editing content and rebuilding

All page text lives in `build/content.json`. The generator needs Pillow (`python3 -m pip install Pillow`) to measure images; without it, it stops rather than build pages with missing banners. Change the text, then run:

```bash
python3 build/build.py
```

That rewrites every page. Two checks come with it:

```bash
python3 build/check_links.py
```

confirms every internal link, anchor, image and PDF exists.

`python3 build/verify.py build/raw` compares each built page, word for word, with the saved copy of the original site in `build/raw` (needs `beautifulsoup4`). Two pages differ on purpose: About Us shows the evolution timeline once instead of three times, and Careers leaves out the old job openings (see below).

### Careers

There are no open positions right now, so the Careers page says so and invites a CV (to hr@janyutech.com). The old openings are still in `content.json`: set `CAREER_HIRING = True` in `build/build.py` and rebuild to show them again.

### Blueprint images

The blueprint versions of robot photos are generated, not drawn by hand. To add or change them (for example after changing a product card's photo), run:

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
python3 -m http.server 5178
```

Then open http://localhost:5178. (The preview in the Claude app uses `.claude/launch.json`, which serves the same folder with no-cache headers so the browser never shows an old copy of a page.)

## Things to know

- **Contact form:** there is no server, so **Submit** opens the visitor's email app with the message addressed to sales@janyutech.com. To receive submissions directly instead, point the form at a service such as Formspree or your own endpoint (`form[data-mailto]` in `main.js`).
- **Photo effect:** runs only on desktop browsers with a mouse and WebGL, and only on images served from the same domain. Phones, touch screens and visitors who turn on "reduce motion" get the plain images.
- **Menu:** the header has the logo, Contact Us and the Menu button; the full-screen menu carries every page, at every screen size.
- **The landing's world:** needs WebGL 2. Without it, or if three.js can't be fetched, the first screen shows the title, the two robots as links to their pages and the film, with the same scroll. To stay light it has no bloom or extra passes, draws 30 frames a second while nobody is driving or scrolling, and stops drawing once the film covers it.
- **Things to find in the landing's world:** four finds are written in the sand or cut into stone: the contact details on the hilltop ahead, a trail of years from 2016 to today, and at a campfire behind a giant rock, where the company started and its awards. The words and the cards that pop up are `XP_FINDS` in `build/build.py`; where they sit is `CAMP`, `SUMMIT` and `TRAIL` in `world.js`.
- **Keeping the first screen quick:** the landing shows the robots as soon as they are ready, then builds the finds, the photo effect and smooth scrolling while the browser is idle (the page fires `jt:world-ready` when the robots are up). Anything new and heavy belongs after that point, and nothing from the finds should sit in view of the camera that frames the two robots, or it will pop in a moment after the page loads.
- **A local copy on a Mac:** keep the folder out of iCloud's "Optimise Mac Storage" (or outside Desktop and Documents). When macOS offloads the images, builds take minutes and the local preview loads images slowly.
- **Links fixed during the rebuild:** a few menu and card links were broken on the old site (wrong page, anchor typos or an old URL). They now point to the right sections. The fixes are listed in `LINK_FIX` in `build/build.py`.

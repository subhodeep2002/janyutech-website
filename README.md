# JanyuTech website (redesign)

**Live:** https://janyutech.duckdns.org

A static rebuild of every page of janyutech.com (55 pages), with the original content and a new design:
smooth scrolling, letter-by-letter title reveals, a fluid-flow image hover effect, page transitions, a mega-menu, sliders, a lightbox, tabs and more.
The home page opens inside an empty room in 3D, its ceiling, walls and floor ruled with a grid and a tube light hanging from the ceiling. JANYU TECH floats in the middle with the quote beneath, a robot drives over the floor after the pointer, leaves and petals drift in from two blossom branches and settle, and scrolling carries the camera into the room. Two dials sit on the screen's edges, small glass knobs that open out into wide, see-through wheels on hover: the one on the right turns the light between Dark, White and Warm (the tube flickers now and then like a real one), and the one on the left picks the robot, Janyu Tech's tracked cleaner, a four-wheeled defence rover or a walking quadruped, printed onto the floor by a scan line.

## Folder layout

| Path | What it is |
| --- | --- |
| `index.html`, `*/index.html` | The built pages (one folder per URL, same URLs as the old site) |
| `styles.css` | Base styles and the home page |
| `site.css` | Header, menus, footer and every inner-page component |
| `main.js` | All interaction and animation (runs on every page, switches on what each page has) |
| `fluid.js` | The image hover effect: a small WebGL fluid simulation (one shared context) that makes the picture flow around the cursor and settle back |
| `hero.js` | Home landing, a three.js scene (loaded as ES modules from jsDelivr): the grid room and its tube light (the three moods and their flicker), the three robots that follow the pointer (wheels, the quadruped's walk, the scan that swaps them), the two dials, leaves and petals with their shadows, the lettering, the two blossom branches, pointer parallax and the camera move on scroll |
| `assets/models/` | The three robots for the landing (web copies made by `build/optimize_bot.mjs` and `build/rig_bots.mjs`) and the pictures of them on the robot dial |
| `assets/bp/` | Robot photos and their matching blueprint drawings (made by `build/blueprint.py`) |
| `assets/img/` | Every site image, converted to WebP |
| `assets/docs/` | The PDFs the site links to (brochure, internship, course details, Saturday Talk) |
| `build/` | The generator and the extracted content |

## Editing content and rebuilding

All page text lives in `build/content.json`. Change it, then run (needs Pillow: `pip install Pillow`, because image sizes decide which pages get a banner and which cards show cutouts):

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

The blueprint versions of robot photos are generated, not drawn by hand. To add or change them (for example after swapping the first-scroll robot in `WARP` inside `build/build.py`), run:

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

Then open http://localhost:5178.

## Things to know

- **Contact form:** there is no server, so **Submit** opens the visitor's email app with the message addressed to sales@janyutech.com. To receive submissions directly instead, point the form at a service such as Formspree or your own endpoint (`form[data-mailto]` in `main.js`).
- **Image hover effect:** runs only on desktop browsers with a mouse, and only on images served from the same domain. Phones, touch screens and visitors who turn on "reduce motion" get the plain images. Its settings (swirl, strength, how fast it settles) are at the top of `fluid.js`.
- **Landing animation:** the landing stays pinned for a short scroll while the camera moves into the room. The light and the robot a visitor picks are remembered in their browser. Visitors who turn on "reduce motion" get a still room instead (no flicker, no camera move, the robot standing still). The room, the camera and the three moods are set near the top of `hero.js`, the robots (size, speed, names) in `BOTS`. Only the chosen robot loads with the page; the other two load when the robot dial is opened.
- **The robots:** to change the cleaner, export it from Blender as `.glb`, then run `node build/optimize_bot.mjs janyu-tech-bot.glb assets/models/janyu-tech-bot.glb`. Keep the wheel names (`Wheel_Left_Drive` and so on): the landing turns them as the robot drives. The rover and the quadruped are rigged by `node build/rig_bots.mjs defence_rover.glb quadruped_robot.glb assets/models`: it gives the rover's wheels and antenna their own pivots and cuts each of the quadruped's legs into hip, thigh and shin so the landing can walk it (both scripts need the packages listed at the top of them). The dial's pictures are the `.webp` files beside the models.
- **Links fixed during the rebuild:** a few menu and card links were broken on the old site (wrong page, anchor typos or an old URL). They now point to the right sections. The fixes are listed in `LINK_FIX` in `build/build.py`.

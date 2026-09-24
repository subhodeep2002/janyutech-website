"""
Turn robot photos into matching blueprint drawings.

For every source image this writes two pixel-aligned 4:3 files into assets/bp/:
  <name>.webp      the photo on a clean studio background
  <name>-bp.webp   the same frame as a technical blueprint (edge lines, hatching, grid)

usage: python3 build/blueprint.py            (needs Pillow + numpy)
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
SRC = os.path.join(SITE, "assets", "img")
OUT = os.path.join(SITE, "assets", "bp")
os.makedirs(OUT, exist_ok=True)

W, H = 1200, 900
STUDIO = np.array([243, 245, 249], np.float32)
BP_BG = np.array([10, 52, 128], np.float32)       # blueprint blue
BP_LINE = np.array([232, 242, 255], np.float32)   # chalk white

SOURCES = [
    "2024-04-Crawler-With-Arm-all-terrain-1.webp",
    "2024-04-VARAH-Dozer-A.webp",
    "2024-04-Varaha-Igv-Surveillance-robo-1.webp",
    "2024-04-Ugv-Varaha-Throwbot-1.webp",
] + sys.argv[1:]


def is_cutout(flat):
    w, h = flat.size
    px = [flat.getpixel(p) for p in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3)]]
    return sum(1 for r, g, b in px if min(r, g, b) > 232) >= 5


def fit(im):
    """Flatten onto white; renders get studio framing, photos of scenes fill the frame."""
    im = im.convert("RGBA")
    flat = Image.new("RGBA", im.size, (255, 255, 255, 255))
    flat.alpha_composite(im)
    flat = flat.convert("RGB")
    if not is_cutout(flat):
        s = max(W / flat.width, H / flat.height)
        flat = flat.resize((round(flat.width * s), round(flat.height * s)), Image.LANCZOS)
        l, t = (flat.width - W) // 2, (flat.height - H) // 2
        return flat.crop((l, t, l + W, t + H)), False
    scale = min(W * 0.86 / flat.width, H * 0.82 / flat.height)
    flat = flat.resize((round(flat.width * scale), round(flat.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    canvas.paste(flat, ((W - flat.width) // 2, (H - flat.height) // 2 + 10))
    return canvas, True


def sobel(g):
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], np.float32)
    p = np.pad(g, 1, mode="edge")
    gx = sum(kx[i, j] * p[i:i + g.shape[0], j:j + g.shape[1]] for i in range(3) for j in range(3))
    gy = sum(kx.T[i, j] * p[i:i + g.shape[0], j:j + g.shape[1]] for i in range(3) for j in range(3))
    return np.hypot(gx, gy)


def blueprint(canvas, cut=True):
    rgb = np.asarray(canvas, np.float32)
    gray = np.asarray(canvas.convert("L").filter(ImageFilter.GaussianBlur(0.8 if cut else 1.4)), np.float32)

    # object mask = anything that is not the white studio background
    mask_img = Image.fromarray((gray < 238).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))
    mask = np.asarray(mask_img.filter(ImageFilter.GaussianBlur(1)), np.float32) / 255
    if not cut:                                   # a full scene: everything is "object", keep only strong edges
        mask = np.ones_like(gray)

    # detail lines from the photo
    e = sobel(gray)
    e = e / (np.percentile(e[mask > 0.5], 97) + 1e-6) if (mask > 0.5).any() else e / (e.max() + 1e-6)
    e = np.clip((e - (0.18 if cut else 0.35)) / 0.6, 0, 1) ** 0.8 * np.clip(mask * 1.4, 0, 1)

    # crisp silhouette outline
    m8 = (mask > 0.5).astype(np.uint8) * 255
    outer = np.asarray(Image.fromarray(m8).filter(ImageFilter.MaxFilter(5)), np.float32) / 255
    outline = np.clip(outer - (mask > 0.5), 0, 1) if cut else np.zeros_like(gray)
    outline = np.asarray(Image.fromarray((outline * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255

    yy, xx = np.mgrid[0:H, 0:W]
    grid_minor = ((xx % 24 == 0) | (yy % 24 == 0)).astype(np.float32)
    grid_major = ((xx % 120 == 0) | (yy % 120 == 0)).astype(np.float32)
    hatch = (((xx + yy) % 9) == 0).astype(np.float32) * (mask > 0.5) * (1 if cut else 0.4)

    # tonal shading inside the object (darker metal = deeper blue)
    tone = (1 - gray / 255) * mask * (1 if cut else 0.8)

    out = np.broadcast_to(BP_BG, (H, W, 3)).copy()
    out += grid_minor[..., None] * 10 + grid_major[..., None] * 22
    out += (mask * (16 if cut else 4))[..., None]          # slightly lifted body
    out -= (tone * 26)[..., None]
    out += (hatch * 26)[..., None]
    glow = np.asarray(Image.fromarray((e * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
    a = np.clip(e * 0.95 + outline * 1.0, 0, 1)[..., None]
    out = out * (1 - a) + BP_LINE * a
    out += (glow * 40)[..., None] * np.array([0.5, 0.8, 1.0])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def studio(canvas):
    """Swap the pure-white background for the soft studio grey."""
    rgb = np.asarray(canvas, np.float32)
    white = np.clip((rgb.min(axis=2) - 236) / 19, 0, 1)[..., None]
    return Image.fromarray(np.clip(rgb * (1 - white) + STUDIO * white, 0, 255).astype(np.uint8))


for name in SOURCES:
    src = os.path.join(SRC, name)
    if not os.path.exists(src):
        print("missing", name); continue
    base = os.path.splitext(name)[0].replace("2024-04-", "").replace("2025-05-", "").lower()
    c, cut = fit(Image.open(src))
    (studio(c) if cut else c).save(os.path.join(OUT, base + ".webp"), "WEBP", quality=84, method=5)
    blueprint(c, cut).save(os.path.join(OUT, base + "-bp.webp"), "WEBP", quality=84, method=5)
    print("ok", base)

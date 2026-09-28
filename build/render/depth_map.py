"""
Turn a --depth render of terrace.py into the hero's parallax map.

  python3 build/render/depth_map.py hero-depth.png assets/scene/hero-depth.webp 800 600 9
  python3 build/render/depth_map.py hero-m-depth.png assets/scene/hero-m-depth.webp 420 700 7

The render stores pow(1 - (distance - 1) / 39, 1.6). That is turned back into distance and then into disparity
(1 / distance), which is what parallax follows: near things move a lot, far things hardly at all. Near things are
then spread a few pixels over what's behind them and the whole map is softened, so the view bends smoothly with the
cursor instead of tearing at edges. The last argument is how much (in pixels of the render).
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst, w, h, k = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
v = np.asarray(Image.open(src).convert("L")).astype(np.float64) / 255
z = 1 + 39 * (1 - np.power(v, 1 / 1.6))                      # metres
disp = np.clip((1 / z - 1 / 40) / (1 / 1.3 - 1 / 40), 0, 1)  # 1 at 1.3 m, 0 at 40 m and beyond
im = Image.fromarray((disp * 255).round().astype(np.uint8))
im = im.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.GaussianBlur(k * 0.9)).resize((w, h), Image.LANCZOS)
im.save(dst, quality=88, method=6)
print("saved", dst, im.size)

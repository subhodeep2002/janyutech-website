"""Download every content image once, convert to WebP (max 1600px), write url→local map."""
import json, os, re, time, subprocess, requests, hashlib
SP = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ["OUT"]  # site assets/img dir
os.makedirs(OUT, exist_ok=True)
os.makedirs(f"{SP}/imgraw", exist_ok=True)
urls = json.load(open(f"{SP}/img_urls.json"))
mp_path = f"{SP}/img_map.json"
mp = json.load(open(mp_path)) if os.path.exists(mp_path) else {}
def local_name(u):
    m = re.search(r"/uploads/(\d{4})/(\d{2})/([^/?]+)$", u)
    base = (f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else hashlib.md5(u.encode()).hexdigest()[:10] + "-" + u.split("/")[-1])
    base = re.sub(r"[^A-Za-z0-9._-]", "-", base)
    return re.sub(r"\.(png|jpe?g|webp|gif)$", "", base, flags=re.I)
for i, u in enumerate(urls):
    if u in mp and os.path.exists(os.path.join(OUT, mp[u])): continue
    name = local_name(u)
    raw = f"{SP}/imgraw/{name}{os.path.splitext(u)[1]}"
    ok = os.path.exists(raw) and os.path.getsize(raw) > 0
    for attempt in range(6):
        if ok: break
        try:
            r = requests.get(u, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200 and r.content:
                open(raw, "wb").write(r.content); ok = True; break
            if r.status_code == 404: break
        except Exception: pass
        time.sleep(4 * (attempt + 1))
    if not ok:
        print("FAIL", u, flush=True); continue
    if u.lower().endswith((".svg", ".gif")):
        dst = name + os.path.splitext(u)[1].lower()
        os.replace(raw, os.path.join(OUT, dst)) if not os.path.exists(os.path.join(OUT, dst)) else None
    else:
        dst = name + ".webp"
        try:
            from PIL import Image
            im = Image.open(raw)
            im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") or "transparency" in im.info else im.convert("RGB")
            if im.width > 1600: im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
            im.save(os.path.join(OUT, dst), "WEBP", quality=80, method=5)
        except Exception as e:
            print("PIL", e, flush=True)
        if not os.path.exists(os.path.join(OUT, dst)):
            print("CONVERT FAIL", u, flush=True); continue
    mp[u] = dst
    if i % 10 == 0:
        json.dump(mp, open(mp_path, "w")); print(f"{i+1}/{len(urls)}", flush=True)
    time.sleep(0.8)
json.dump(mp, open(mp_path, "w"))
print("DONE", len(mp), "of", len(urls), flush=True)

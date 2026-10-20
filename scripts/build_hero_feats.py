"""Tiny colour fingerprints of every hero portrait for the hero grid tool. The Steam CDN only allows CORS for
dota2.com, so the browser can't read hero images itself; it compares uploaded pictures against these instead.
Writes data/hero_feats.json: per hero a landscape (16x9) and, when it exists, a vertical (12x15) RGB grid as hex."""
import io
import json
import os
import sys
import time
import urllib.request

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import OUT, get  # noqa: E402

CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/"
SIZES = {"l": (16, 9), "v": (12, 15)}


def fetch(url):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "dota2-analyzer-data"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return Image.open(io.BytesIO(r.read()))
        except Exception as e:  # missing vertical portraits for new heroes are expected
            if getattr(e, "code", None) == 404:
                return None
            time.sleep(2 * (i + 1))
    return None


def feat(img, size):
    rgba = img.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
    rgb = Image.alpha_composite(bg, rgba).convert("RGB")
    return rgb.resize(size, Image.BOX).tobytes().hex()


def main():
    out = {}
    for h in get("heroStats"):
        name = h["name"].replace("npc_dota_hero_", "")
        e = {}
        land = fetch(f"{CDN}dota_react/heroes/{name}.png")
        if land:
            e["l"] = feat(land, SIZES["l"])
        vert = fetch(f"{CDN}heroes/{name}_vert.jpg")
        if vert:
            e["v"] = feat(vert, SIZES["v"])
        if e:
            out[h["id"]] = e
    with open(os.path.join(OUT, "hero_feats.json"), "w", encoding="utf-8") as f:
        json.dump({"sizes": SIZES, "heroes": out}, f, separators=(",", ":"))
    print(f"hero fingerprints: {len(out)} heroes, {sum('v' in e for e in out.values())} with vertical portraits")


if __name__ == "__main__":
    main()

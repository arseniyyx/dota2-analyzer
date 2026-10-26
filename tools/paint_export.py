"""Hero paint data for the site: default hero models as light glTF files, the game texture behind every paintable
part, and ability icons. Runs on a PC with Dota 2 and Source 2 Viewer CLI (ValveResourceFormat); not part of CI.

    python tools/paint_export.py --vrf <Source2Viewer-CLI.exe> [--heroes juggernaut,morphling]

Writes paint/index.json and paint/h/<hero>/ (meta.json, <part>.glb, textures and icons as WebP)."""
import argparse
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile

import vpk
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))
import d2mods  # noqa: E402  (game folder lookup, resource blocks)

OUT = os.path.join(ROOT, "paint")
SLOTS = {"base": ("Тело", "Body"), "head": ("Голова", "Head"), "weapon": ("Оружие", "Weapon"), "offhand_weapon": ("Второе оружие", "Off-hand"),
         "back": ("Спина", "Back"), "arms": ("Руки", "Arms"), "legs": ("Ноги", "Legs"), "shoulder": ("Плечи", "Shoulders"), "belt": ("Пояс", "Belt"),
         "neck": ("Шея", "Neck"), "armor": ("Доспех", "Armor"), "tail": ("Хвост", "Tail"), "misc": ("Разное", "Misc"), "mount": ("Ездовое", "Mount"),
         "body_head": ("Голова и тело", "Head and body"), "gloves": ("Перчатки", "Gloves"), "costume": ("Костюм", "Costume"),
         "weapon2": ("Оружие 2", "Weapon 2"), "offhand_weapon2": ("Второе оружие 2", "Off-hand 2")}
COLOR_PX, NORMAL_PX = 512, 256


def kv_get(body, key):
    m = re.search(rf'"{key}"\s+"([^"]*)"', body)
    return m.group(1) if m else None


def default_items(items_game):
    """{hero: [(slot, item name, model)]} for items with the default_item prefab and a model."""
    out = {}
    for m in re.finditer(r'\n\t\t"(\d+)"\s*\n\t\t\{(.*?)\n\t\t\}', items_game, re.S):
        body = m.group(2)
        if '"default_item"' not in body:
            continue
        model = kv_get(body, "model_player")
        heroes = re.search(r'"used_by_heroes"\s*\{(.*?)\}', body, re.S)
        if not model or not heroes:
            continue
        slot = kv_get(body, "item_slot") or "weapon"
        if "persona" in slot:  # persona defaults belong to a paid alternate look and overlap the normal model
            continue
        for hero in re.findall(r'"(npc_dota_hero_\w+)"', heroes.group(1)):
            out.setdefault(hero, []).append((slot, kv_get(body, "name") or "", model))
    return out


def glb_read(path):
    d = open(path, "rb").read()
    n = struct.unpack_from("<I", d, 12)[0]
    j = json.loads(d[20:20 + n])
    rest = d[20 + n:]
    binary = rest[8:8 + struct.unpack_from("<I", rest, 0)[0]] if rest else b""
    return j, binary


def glb_write(path, j, binary):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binary += b"\0" * (-len(binary) % 4)
    chunks = struct.pack("<I4s", len(js), b"JSON") + js + (struct.pack("<I4s", len(binary), b"BIN\0") + binary if binary else b"")
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks)


def webp(src, dst, px):
    im = Image.open(src)
    im.thumbnail((px, px))
    im.save(dst, "WEBP", quality=82, method=6)


KEEP = ("POSITION", "NORMAL", "TEXCOORD_0")


def repack(j, binary):
    """Only what a painted still model needs: positions, normals, UVs and indices. Facial morph targets, bones and
    tangents were ~95% of the size."""
    used = []
    for m in j.get("meshes", []):
        m.pop("weights", None)
        m.pop("extras", None)
        for p in m["primitives"]:
            p.pop("targets", None)
            p["attributes"] = {k: v for k, v in p["attributes"].items() if k in KEEP}
            used += list(p["attributes"].values()) + ([p["indices"]] if "indices" in p else [])
    for n in j.get("nodes", []):
        n.pop("skin", None)
    j.pop("skins", None)
    j.pop("animations", None)
    remap, accessors, views, out = {}, [], [], bytearray()
    for a in dict.fromkeys(used):
        acc = dict(j["accessors"][a])
        bv = j["bufferViews"][acc["bufferView"]]
        start = bv.get("byteOffset", 0)
        chunk = binary[start:start + bv["byteLength"]]
        out += b"\0" * (-len(out) % 4)
        nv = {"buffer": 0, "byteOffset": len(out), "byteLength": len(chunk)}
        for k in ("byteStride", "target"):
            if k in bv:
                nv[k] = bv[k]
        out += chunk
        views.append(nv)
        acc["bufferView"] = len(views) - 1
        remap[a] = len(accessors)
        accessors.append(acc)
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            p["attributes"] = {k: remap[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = remap[p["indices"]]
    j["accessors"], j["bufferViews"] = accessors, views
    j["buffers"] = [{"byteLength": len(out)}]
    return bytes(out)


def slim(glb, src_dir, dst_dir, part, tex_index):
    """Keeps meshes plus the colour and normal maps (as WebP), drops the other Source 2 maps, and records for every
    material the game texture behind its colour, so a click on the model leads to the file the app recolours."""
    j, binary = glb_read(glb)
    images, textures, mats = [], [], []
    for mat in j.get("materials", []):
        vmat = mat.get("extras", {}).get("vmat", {})
        tp = vmat.get("TextureParams", {})
        new = {"name": mat.get("name", part), "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.75}, "extras": {}}
        for slot, gl_key, px, sfx in (("g_tColor", "baseColorTexture", COLOR_PX, ""), ("g_tNormal", "normalTexture", NORMAL_PX, "_n")):
            name = tp.get(slot)
            if not name:
                continue
            png = os.path.join(src_dir, name.replace(".vtex", ".png"))
            if not os.path.exists(png):
                continue
            base = re.sub(r"\.vtex$", "", name)
            out_name = f"{base}{sfx}.webp"
            if not os.path.exists(os.path.join(dst_dir, out_name)):
                webp(png, os.path.join(dst_dir, out_name), px)
            images.append({"uri": out_name})
            textures.append({"source": len(images) - 1, "sampler": 0})
            ref = {"index": len(textures) - 1}
            if gl_key == "baseColorTexture":
                new["pbrMetallicRoughness"]["baseColorTexture"] = ref
                new["extras"]["color"] = tex_index.get(base + ".vtex_c")
            else:
                new["normalTexture"] = ref
        if mat.get("alphaMode"):
            new["alphaMode"] = mat["alphaMode"]
            if "alphaCutoff" in mat:
                new["alphaCutoff"] = mat["alphaCutoff"]
        if mat.get("doubleSided"):
            new["doubleSided"] = True
        mats.append(new)
    j["materials"], j["images"], j["textures"] = mats, images, textures
    binary = repack(j, binary)
    j["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    for k in ("extensionsUsed", "extensionsRequired"):
        j.pop(k, None)
    for m in j.get("meshes", []):
        m["name"] = part
    glb_write(os.path.join(dst_dir, f"{part}.glb"), j, binary)
    return [(m["name"], m["extras"].get("color")) for m in mats]


def read_icon(data):
    """The full size image of a DXT1/DXT5/RGBA8888 texture; mip levels are stored smallest first."""
    off, size = d2mods.resource_block(data, "DATA")
    w, h = struct.unpack_from("<HH", data, off + 20)
    fmt, mips = data[off + 26], data[off + 27]
    if fmt == 16:  # the image is a PNG file stored as is
        return Image.open(io.BytesIO(data[off + size:])).convert("RGBA")
    if fmt == 28:  # BGRA8888
        raw = data[off + size + sum(max(1, w >> k) * max(1, h >> k) * 4 for k in range(1, mips)):][:w * h * 4]
        b, g, r, a = Image.frombytes("RGBA", (w, h), raw).split()
        return Image.merge("RGBA", (r, g, b, a))
    if fmt not in (1, 2, 4):
        raise ValueError(f"format {fmt}")
    mip = lambda k: (max(1, w >> k) * max(1, h >> k) * 4) if fmt == 4 else max(1, (max(1, w >> k) + 3) // 4) * max(1, (max(1, h >> k) + 3) // 4) * (8 if fmt == 1 else 16)
    start = off + size + sum(mip(k) for k in range(1, mips))
    raw = data[start:start + mip(0)]
    if len(raw) < mip(0):
        raise ValueError("compressed mips")
    return Image.frombytes("RGBA", (w, h), raw) if fmt == 4 else Image.frombytes("RGBA", (w, h), raw, "bcn", 1 if fmt == 1 else 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vrf", required=True)
    ap.add_argument("--heroes", default="")
    a = ap.parse_args()
    game = d2mods.find_dota()
    pak_path = os.path.join(game, "dota", "pak01_dir.vpk")
    pak = vpk.open(pak_path)
    files = list(pak)
    tex_index = {p.rsplit("/", 1)[1]: p for p in files if p.endswith(".vtex_c")}
    items = default_items(pak.get_file("scripts/items/items_game.txt").read().decode("utf-8", "replace"))
    names = {h["name"]: h for h in json.load(open(os.path.join(ROOT, "data", "hero_list.json"), encoding="utf-8"))}
    wanted = {f"npc_dota_hero_{x.strip()}" for x in a.heroes.split(",") if x.strip()} or set(names)
    index = json.load(open(os.path.join(OUT, "index.json"), encoding="utf-8")) if os.path.exists(os.path.join(OUT, "index.json")) else []
    index = [h for h in index if h["npc"] not in wanted]
    with tempfile.TemporaryDirectory() as tmp:
        for npc in sorted(wanted):
            short = npc.replace("npc_dota_hero_", "")
            src = f"scripts/npc/heroes/{npc}.txt"
            if src not in pak or npc not in names:
                print("skip", npc)
                continue
            hero_kv = pak.get_file(src).read().decode("utf-8", "replace")
            base_model = kv_get(hero_kv, "Model")
            abilities = []
            for i in range(1, 7):
                ab = kv_get(hero_kv, f"Ability{i}")
                if ab and not ab.startswith("generic_hidden") and f"panorama/images/spellicons/{ab}_png.vtex_c" in pak:
                    abilities.append(ab)
            parts = [("base", "", base_model)] + [it for it in items.get(npc, []) if it[2] and it[2] != base_model]
            models = [m for _, _, m in parts]
            out_tmp = os.path.join(tmp, short)
            # with exactly one matching file the CLI treats -o as that file's path, not as a folder
            target = os.path.join(out_tmp, *models[0].split("/")).replace(".vmdl", ".glb") if len(models) == 1 else out_tmp
            os.makedirs(os.path.dirname(target) if len(models) == 1 else out_tmp, exist_ok=True)
            cmd = [a.vrf, "-i", pak_path, "-o", target, "-d", "--gltf_export_format", "glb", "--gltf_export_materials", "--threads", "4",
                   "-f", ",".join(m + "_c" for m in models)]
            subprocess.run(cmd, capture_output=True, check=True)
            dst = os.path.join(OUT, "h", short)
            shutil.rmtree(dst, ignore_errors=True)
            os.makedirs(dst)
            meta = {"npc": npc, "id": names[npc]["id"], "name": names[npc]["localized_name"], "scale": float(kv_get(hero_kv, "ModelScale") or 1),
                    "parts": [], "abilities": []}
            used = set()
            for slot, item_name, model in parts:
                glb = os.path.join(out_tmp, *model.split("/")).replace(".vmdl", ".glb")
                if not os.path.exists(glb):
                    print("  no export", model)
                    continue
                key = re.sub(r"\W+", "_", os.path.basename(model).replace(".vmdl", ""))
                while key in used:
                    key += "_"
                used.add(key)
                mats = slim(glb, os.path.dirname(glb), dst, key, tex_index)
                ru, en = SLOTS.get(slot, (slot, slot))
                meta["parts"].append({"key": key, "slot": slot, "ru": ru, "en": en, "item": item_name, "glb": f"{key}.glb",
                                      "materials": [{"name": n, "color": c} for n, c in mats if c]})
            for ab in abilities:
                path = f"panorama/images/spellicons/{ab}_png.vtex_c"
                try:
                    im = read_icon(pak.get_file(path).read())
                except (ValueError, KeyError) as e:
                    print("  icon skipped", ab, e)
                    continue
                im.save(os.path.join(dst, f"a_{ab}.webp"), "WEBP", quality=85)
                meta["abilities"].append({"name": ab, "icon": path, "img": f"a_{ab}.webp"})
            with open(os.path.join(dst, "meta.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
            index.append({"npc": npc, "id": meta["id"], "name": meta["name"], "parts": len(meta["parts"])})
            size_kb = sum(os.path.getsize(os.path.join(dst, x)) for x in os.listdir(dst)) // 1024
            print(f"{short}: {len(meta['parts'])} parts, {len(meta['abilities'])} icons, {size_kb} KB")
    index.sort(key=lambda h: h["name"])
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()

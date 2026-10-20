"""D2A Mods: a small mod manager for Dota 2 by Dota 2 Analyzer.

Two kinds of mods:
  * our own rules from the site catalog ("replace these game files with an empty effect or silence"),
    built on the player's PC from the game's own files into one VPK;
  * ready mods from the open Dota2PornFx (D2PFX) catalog, downloaded only when ticked, checked by SHA-256
    and copied as they are.
Everything goes into the folder of the game's voice language (e.g. game/dota_russian) as pakNN_dir.vpk, the
way the D2PFX guide installs mods, so game updates don't switch them off. With an English client the files
go to game/dota_d2a, mounted by one line in gameinfo.gi (backed up first). Uninstall removes only our files.

Usage:  D2AMods.exe                                  window
        d2mods.py --build-only out.vpk --mods a,b    build our rules VPK somewhere else, touch nothing in the game
"""
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

import vpk

APP_VERSION = "1.2.1"
SITE = "https://arseniyyx.github.io/dota2-analyzer/"
CATALOG_URL = SITE + "mods/catalog.json"
D2PFX_SITE = "https://h6rd.github.io/Dota2PornFxWeb"
D2PFX_CREDITS = "https://github.com/h6rd/Dota2PornFxWeb#credits"
D2PFX_RAW = "https://raw.githubusercontent.com/h6rd/Dota2PornFxWeb/main/assets/"
# only categories that neither unlock paid Valve cosmetics nor give an in-game advantage
D2PFX_CATS = [("shaders", "Шейдеры тумана"), ("cursors", "Курсоры"), ("backgrounds", "Фоны меню"), ("hero-icons", "Иконки героев"),
              ("item-icons", "Иконки предметов"), ("ranks", "Иконки рангов"), ("pings", "Пинги"), ("creep-deny", "Денай")]
MOD_FOLDER = "dota_d2a"  # English clients only
MARK = "// D2A mods"
PAK_FIRST = 60
GAME_DIRS = ("particles", "materials", "models", "panorama", "resource", "sounds", "soundevents", "scripts", "maps")
DATA_DIR = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "D2AMods")
UA = {"User-Agent": f"D2AMods/{APP_VERSION}"}


# ---------- game ----------

def steam_libraries():
    roots = []
    try:
        import winreg
        for hive, key in ((winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam"), (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam")):
            try:
                with winreg.OpenKey(hive, key) as k:
                    for name in ("SteamPath", "InstallPath"):
                        try:
                            roots.append(winreg.QueryValueEx(k, name)[0])
                        except OSError:
                            pass
            except OSError:
                pass
    except ImportError:
        pass
    roots += [r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam", os.path.expanduser("~/.steam/steam")]
    libs = []
    for r in roots:
        vdf = os.path.join(r, "steamapps", "libraryfolders.vdf")
        if os.path.exists(vdf):
            with open(vdf, encoding="utf-8", errors="ignore") as f:
                libs += [p.replace("\\\\", "\\") for p in re.findall(r'"path"\s+"([^"]+)"', f.read())]
        libs.append(r)
    return list(dict.fromkeys(os.path.normpath(p) for p in libs))


def find_dota():
    for lib in steam_libraries():
        game = os.path.join(lib, "steamapps", "common", "dota 2 beta", "game")
        if os.path.exists(os.path.join(game, "dota", "gameinfo.gi")):
            return game
    return None


def game_language(game):
    acf = os.path.join(game, "..", "..", "..", "appmanifest_570.acf")
    try:
        with open(acf, encoding="utf-8", errors="ignore") as f:
            m = re.search(r'"language"\s+"(\w+)"', f.read())
        return m.group(1).lower() if m else "english"
    except OSError:
        return "english"


def target(game):
    """Where our paks go: the voice language folder (mounted before the game) or, for English, our own folder."""
    lang = game_language(game)
    folder = os.path.join(game, f"dota_{lang}")
    if lang != "english" and os.path.exists(os.path.join(folder, "gameinfo.gi")):
        return "lang", folder
    return "gameinfo", os.path.join(game, MOD_FOLDER)


def dota_running():
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq dota2.exe"], capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        return "dota2.exe" in out.lower()
    except OSError:
        return False


# ---------- downloads ----------

def http_get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def cached_json(url, name, max_age):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age:
        with open(path, encoding="utf-8") as f:
            return json.load(f), False
    try:
        data = json.loads(http_get(url))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        return data, False
    except Exception:
        with open(path, encoding="utf-8") as f:  # offline: the last copy we saw
            return json.load(f), True


def load_catalog():
    return cached_json(CATALOG_URL, "catalog.json", 0)


def fetch_file(url, sha256, name, log):
    """Downloads into the cache once; a file whose SHA-256 doesn't match the catalog is never used."""
    folder = os.path.join(DATA_DIR, "files")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, hashlib.sha1(url.encode()).hexdigest()[:16] + "_" + re.sub(r"[^\w.-]", "_", name)[-60:])

    def ok():
        if not os.path.exists(path):
            return False
        with open(path, "rb") as f:
            return not sha256 or hashlib.sha256(f.read()).hexdigest() == sha256
    if not ok():
        log(f"Скачиваю «{name}»…")
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r, open(path + ".part", "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(path + ".part", path)
        if not ok():
            os.remove(path)
            raise RuntimeError(f"«{name}» скачался с ошибкой (не совпала контрольная сумма), попробуй ещё раз")
    return path


# ---------- D2PFX catalog ----------

def load_d2pfx():
    """{category: [mod]} for the allowed categories; files and previews stay on D2PFX's GitHub until ticked."""
    mods, _ = cached_json(D2PFX_RAW + "data/mods.json", "d2pfx_mods.json", 6 * 3600)
    hashes, _ = cached_json(D2PFX_RAW + "data/mod-hashes.json", "d2pfx_hashes.json", 6 * 3600)
    out = {}
    for cat, _label in D2PFX_CATS:
        items = mods.get("modsData", {}).get(cat)
        if not isinstance(items, list):
            continue
        for m in items:
            f = m.get("file") or ""
            if not f or f.startswith("http") or m.get("type") == "guide" or not re.search(r"\.(zip|vpk)$", f, re.I):
                continue
            author = next((l.get("url") for l in m.get("links", []) if l.get("type") == "author"), None)
            prev = m.get("preview") or ""
            out.setdefault(cat, []).append({
                "id": f"d2pfx:{cat}/{f}", "cat": cat, "name": m.get("name") or f, "author": author,
                "url": D2PFX_RAW + "files/" + urllib.parse.quote(f"{cat}/{f}"), "sha256": hashes.get(f"{cat}/{f}"), "file": f,
                "preview": D2PFX_RAW + "previews/" + urllib.parse.quote(f"{cat}/{prev}") if re.search(r"\.(webp|png|jpe?g|gif)$", prev, re.I) else None,
            })
    return out


# ---------- build & install ----------

def build_rules(game, catalog, mod_ids, tmp, log=print):
    """Our rule mods: matching game files replaced by the game's own empty effect / silence, written into tmp."""
    chosen = [m for m in catalog["mods"] if m["id"] in mod_ids]
    if not chosen:
        return 0
    pak = vpk.open(os.path.join(game, "dota", "pak01_dir.vpk"))
    paths = list(pak)
    blank, count = {}, 0
    for m in chosen:
        before = count
        for rule in m["rules"]:
            tpl = catalog["templates"][rule["template"]]
            if tpl not in blank:
                blank[tpl] = pak.get_file(tpl).read()
            rx = re.compile(rule["match"])
            for p in paths:
                if rx.search(p) and p != tpl:
                    dst = os.path.join(tmp, *p.split("/"))
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    with open(dst, "wb") as f:
                        f.write(blank[tpl])
                    count += 1
        log(f"{m['name']['ru']}: {count - before} файлов")
    return count


def loose_path(name):
    """Game path for a loose file from a D2PFX zip ("<Mod name>/cursor/x.ani" -> "resource/cursor/x.ani"), or None."""
    parts = [p for p in name.replace("\\", "/").split("/") if p]
    if not parts or ".." in parts or ":" in parts[0]:
        return None
    for i, p in enumerate(parts):
        if p in GAME_DIRS:
            return "/".join(parts[i:])
        if p == "cursor":
            return "/".join(["resource"] + parts[i:])
    return None


def place_d2pfx(mod, folder, numbers, tmp, log):
    """Copies a D2PFX mod: VPKs as they are under a free pak number, loose files into tmp for our own VPK."""
    path = fetch_file(mod["url"], mod["sha256"], mod["name"], log)
    written, number = [], None
    if mod["file"].lower().endswith(".vpk"):
        dst = os.path.join(folder, f"pak{next(numbers):02d}_dir.vpk")
        shutil.copyfile(path, dst)
        return [os.path.basename(dst)], 0
    loose = 0
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            base = os.path.basename(info.filename.replace("\\", "/"))
            m = re.fullmatch(r"pak\d+_(dir|\d{3})\.vpk", base, re.I)
            if m:  # keep multi-part VPKs together under one number
                number = number or next(numbers)
                dst = os.path.join(folder, f"pak{number:02d}_{m.group(1).lower()}.vpk")
                with z.open(info) as src, open(dst, "wb") as out:
                    shutil.copyfileobj(src, out)
                written.append(os.path.basename(dst))
                continue
            gp = loose_path(info.filename)
            if gp:
                dst = os.path.join(tmp, *gp.split("/"))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with z.open(info) as src, open(dst, "wb") as out:
                    shutil.copyfileobj(src, out)
                loose += 1
    if not written and not loose:
        raise RuntimeError(f"В моде «{mod['name']}» не нашлось файлов игры")
    return written, loose


def state_path():
    return os.path.join(DATA_DIR, "installed.json")


def load_state():
    try:
        with open(state_path(), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(st):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(state_path(), "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)


def gameinfo_path(game):
    return os.path.join(game, "dota", "gameinfo.gi")


def is_mounted(game):
    with open(gameinfo_path(game), encoding="utf-8") as f:
        return MARK in f.read()


def mount(game):
    gi = gameinfo_path(game)
    with open(gi, encoding="utf-8") as f:
        text = f.read()
    if MARK in text:
        return
    backup = gi + ".d2a-backup"
    if not os.path.exists(backup):
        shutil.copy2(gi, backup)
    new, n = re.subn(r"(\n([ \t]*)Game[ \t]+dota[ \t]*\n)", lambda m: f"\n{m.group(2)}Game\t\t\t\t{MOD_FOLDER}\t{MARK}{m.group(1)}", text, count=1)
    if not n:
        raise RuntimeError("Не нашёл строку «Game dota» в gameinfo.gi: формат файла изменился")
    with open(gi, "w", encoding="utf-8") as f:
        f.write(new)


def unmount(game):
    gi = gameinfo_path(game)
    with open(gi, encoding="utf-8") as f:
        text = f.read()
    if MARK in text:
        with open(gi, "w", encoding="utf-8") as f:
            f.write("".join(line for line in text.splitlines(keepends=True) if MARK not in line))


def remove_ours(game):
    """Deletes exactly the files we put there before (and the 1.0/1.1 layout), nothing else."""
    st = load_state()
    rec = st.pop(game, None)
    if rec:
        for name in rec.get("files", []):
            try:
                os.remove(os.path.join(rec["folder"], name))
            except OSError:
                pass
    unmount(game)
    shutil.rmtree(os.path.join(game, MOD_FOLDER), ignore_errors=True)
    save_state(st)


def install(game, catalog, d2pfx, ids, log=print):
    if dota_running():
        raise RuntimeError("Закрой Dota 2 перед установкой")
    remove_ours(game)
    method, folder = target(game)
    os.makedirs(folder, exist_ok=True)
    taken = {f.lower() for f in os.listdir(folder)}
    numbers = (n for n in range(PAK_FIRST, 100) if not any(t.startswith(f"pak{n:02d}_") for t in taken))
    files, total = [], 0
    by_id = {m["id"]: m for ms in (d2pfx or {}).values() for m in ms}
    try:
        with tempfile.TemporaryDirectory() as tmp:
            total += build_rules(game, catalog, ids, tmp, log)
            for mid in [i for i in ids if i in by_id]:
                written, loose = place_d2pfx(by_id[mid], folder, numbers, tmp, log)
                files += written
                total += loose + len(written)
            if any(os.scandir(tmp)):
                dst = os.path.join(folder, f"pak{next(numbers):02d}_dir.vpk")
                vpk.new(tmp).save(dst)
                files.append(os.path.basename(dst))
    except StopIteration:
        raise RuntimeError("Слишком много модов сразу: в папке закончились свободные номера pak60–pak99")
    finally:
        st = load_state()
        st[game] = {"folder": folder, "files": files, "mods": sorted(ids), "method": method, "app": APP_VERSION}
        save_state(st)
    if not files:
        raise RuntimeError("Ни один файл не подошёл под выбранные моды")
    if method == "gameinfo":
        mount(game)
    return total


def uninstall(game):
    if dota_running():
        raise RuntimeError("Закрой Dota 2 перед удалением")
    remove_ours(game)


def installed_ids(game):
    rec = load_state().get(game) or {}
    if rec and not all(os.path.exists(os.path.join(rec["folder"], f)) for f in rec.get("files", [])):
        return set()
    return set(rec.get("mods", []))


def needs_reapply(game):
    rec = load_state().get(game) or {}
    return rec.get("method") == "gameinfo" and rec.get("files") and not is_mounted(game)


# ---------- window ----------

def run_gui():
    import tkinter as tk
    import webbrowser
    from tkinter import filedialog, messagebox

    try:
        from PIL import Image, ImageTk
    except ImportError:
        Image = ImageTk = None

    C = {"bg": "#0b0e14", "panel": "#151a23", "panel2": "#1c222d", "line": "#2a313e", "fg": "#e8ecf2", "muted": "#96a0b2",
         "gold": "#e3b04b", "gold2": "#f5cd78", "dark": "#1a1408"}
    F = "Segoe UI"
    root = tk.Tk()
    root.title(f"D2A Mods {APP_VERSION}")
    root.configure(bg=C["bg"])
    root.geometry("1040x700")
    root.minsize(680, 500)
    st = {"game": find_dota(), "catalog": None, "d2pfx": None, "tab": None, "cat": D2PFX_CATS[0][0], "query": "",
          "sel": set(), "busy": False, "cols": 0, "thumbs": {}, "loading": set()}
    pool = ThreadPoolExecutor(max_workers=6)

    def button(parent, text, cmd, primary=False):
        base, hover = (C["gold"], C["gold2"]) if primary else (C["panel2"], C["line"])
        b = tk.Label(parent, text=text, bg=base, fg=C["dark"] if primary else C["fg"], font=(F, 10, "bold"), padx=16, pady=9, cursor="hand2")
        b.bind("<Button-1>", lambda e: None if st["busy"] else cmd())
        b.bind("<Enter>", lambda e: b.configure(bg=hover))
        b.bind("<Leave>", lambda e: b.configure(bg=base))
        return b

    head = tk.Frame(root, bg=C["bg"])
    head.pack(fill="x", padx=20, pady=(16, 6))
    tk.Label(head, text="D2A Mods", bg=C["bg"], fg=C["gold"], font=(F, 20, "bold")).pack(side="left")
    path_var = tk.StringVar(value=st["game"] or "Dota 2 не найдена")
    button(head, "Папка игры", lambda: pick()).pack(side="right")
    heart = tk.Label(head, text="♥", bg=C["bg"], fg=C["muted"], font=(F, 14), padx=8, cursor="hand2")
    heart.bind("<Button-1>", lambda e: webbrowser.open(SITE + "#support"))
    heart.bind("<Enter>", lambda e: heart.configure(fg="#ff6b8a"))
    heart.bind("<Leave>", lambda e: heart.configure(fg=C["muted"]))

    def show_heart():  # quiet: shown only when the site lists ways to support
        try:
            if json.loads(http_get(SITE + "support.json", 10)).get("links"):
                root.after(0, lambda: heart.pack(side="right", before=path_label))
        except Exception:
            pass
    threading.Thread(target=show_heart, daemon=True).start()
    path_label = tk.Label(head, textvariable=path_var, bg=C["bg"], fg=C["muted"], font=(F, 9))
    path_label.pack(side="right", padx=10)

    tabs_row = tk.Frame(root, bg=C["bg"])
    tabs_row.pack(fill="x", padx=20, pady=(4, 4))
    sub = tk.Frame(root, bg=C["bg"])  # D2PFX categories + search, shown only on that tab
    cats_row = tk.Frame(sub, bg=C["bg"])
    cats_row.pack(fill="x")
    search_row = tk.Frame(sub, bg=C["bg"])
    search_row.pack(fill="x", pady=(6, 0))
    qvar = tk.StringVar()
    entry = tk.Entry(search_row, textvariable=qvar, bg=C["panel"], fg=C["fg"], insertbackground=C["fg"], relief="flat", font=(F, 10), width=28)
    entry.pack(side="left", ipady=5, ipadx=6)
    tk.Label(search_row, text="поиск", bg=C["bg"], fg=C["muted"], font=(F, 9)).pack(side="left", padx=8)
    credit = tk.Label(search_row, text="Моды из Dota2PornFx · авторы модов", bg=C["bg"], fg=C["gold"], font=(F, 9, "underline"), cursor="hand2")
    credit.pack(side="right")
    credit.bind("<Button-1>", lambda e: webbrowser.open(D2PFX_SITE))
    tk.Label(search_row, text="", bg=C["bg"]).pack(side="right")

    foot = tk.Frame(root, bg=C["bg"])
    foot.pack(side="bottom", fill="x", padx=20, pady=(6, 14))
    status = tk.StringVar()
    tk.Label(foot, textvariable=status, bg=C["bg"], fg=C["muted"], font=(F, 9), anchor="w", justify="left").pack(fill="x", pady=(0, 8))
    row = tk.Frame(foot, bg=C["bg"])
    row.pack(fill="x")
    count_var = tk.StringVar()
    button(row, "Установить выбранные", lambda: do_install(), primary=True).pack(side="left")
    button(row, "Удалить все моды", lambda: do_uninstall()).pack(side="left", padx=8)
    button(row, "Выбрать все", lambda: select_view(True)).pack(side="left")
    button(row, "Снять все", lambda: select_view(False)).pack(side="left", padx=8)
    tk.Label(row, textvariable=count_var, bg=C["bg"], fg=C["gold"], font=(F, 10, "bold")).pack(side="left", padx=8)
    button(row, "Сайт", lambda: webbrowser.open(SITE + "#mods")).pack(side="right")

    wrap = tk.Frame(root, bg=C["bg"])
    wrap.pack(fill="both", expand=True, padx=(20, 8))
    canvas = tk.Canvas(wrap, bg=C["bg"], highlightthickness=0)
    bar = tk.Scrollbar(wrap, orient="vertical", command=canvas.yview)
    canvas.configure(yscrollcommand=bar.set)
    bar.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)
    grid = tk.Frame(canvas, bg=C["bg"])
    win = canvas.create_window((0, 0), window=grid, anchor="nw")
    grid.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))

    def view_items():
        if st["tab"] == "d2pfx":
            items = (st["d2pfx"] or {}).get(st["cat"], [])
            q = st["query"].strip().lower()
            return [m for m in items if q in m["name"].lower()] if q else items
        return [m for m in st["catalog"]["mods"] if m.get("tab", "optimize") == st["tab"]]

    def thumb(m, label):
        """Preview images load in the background and are cached on disk."""
        key = m["preview"]
        if not key or Image is None:
            return
        if key in st["thumbs"]:
            label.configure(image=st["thumbs"][key])
            return
        if key in st["loading"]:
            return
        st["loading"].add(key)

        def load():
            try:
                folder = os.path.join(DATA_DIR, "previews")
                os.makedirs(folder, exist_ok=True)
                path = os.path.join(folder, hashlib.sha1(key.encode()).hexdigest() + ".png")
                if not os.path.exists(path):
                    img = Image.open(io.BytesIO(http_get(key, 30))).convert("RGB")
                    img.thumbnail((480, 270))
                    img.save(path)
                img = Image.open(path)
                img.thumbnail((236, 133))
                root.after(0, lambda: done(ImageTk.PhotoImage(img)))
            except Exception:
                st["loading"].discard(key)

        def done(photo):
            st["thumbs"][key] = photo
            st["loading"].discard(key)
            if label.winfo_exists():
                label.configure(image=photo)
        pool.submit(load)

    def tile(parent, m, width):
        on = m["id"] in st["sel"]
        t = tk.Frame(parent, bg=C["panel"], highlightthickness=2, highlightbackground=C["gold"] if on else C["line"], cursor="hand2")
        if st["tab"] == "d2pfx":
            pic = tk.Label(t, bg="#0f131a", width=236, height=133, text="" if m["preview"] else "без превью", fg=C["muted"])
            pic.pack(padx=8, pady=(8, 4))
            thumb(m, pic)
            top = tk.Frame(t, bg=C["panel"])
            top.pack(fill="x", padx=10)
            tk.Label(top, text=m["name"], bg=C["panel"], fg=C["fg"], font=(F, 10, "bold"), anchor="w", justify="left", wraplength=width - 50).pack(side="left", fill="x")
            tk.Label(top, text="✓" if on else "", bg=C["panel"], fg=C["gold"], font=(F, 13, "bold")).pack(side="right")
            tk.Label(t, text=f"автор: {m['author']}" if m["author"] else "Dota2PornFx", bg=C["panel"], fg=C["muted"], font=(F, 8), anchor="w").pack(fill="x", padx=10, pady=(0, 8))
        else:
            top = tk.Frame(t, bg=C["panel"])
            top.pack(fill="x", padx=12, pady=(10, 2))
            tk.Label(top, text=m.get("icon", "◆"), bg=C["panel"], fg=C["gold"], font=(F, 18)).pack(side="left")
            tk.Label(top, text="✓" if on else "", bg=C["panel"], fg=C["gold"], font=(F, 14, "bold")).pack(side="right")
            kind = {"fps": "FPS", "sound": "звук", "visual": "вид"}.get(m.get("category"), "")
            tk.Label(top, text=kind, bg=C["panel2"], fg=C["muted"], font=(F, 8, "bold"), padx=6).pack(side="right", padx=6)
            tk.Label(t, text=m["name"]["ru"], bg=C["panel"], fg=C["fg"], font=(F, 11, "bold"), anchor="w", justify="left", wraplength=width - 30).pack(fill="x", padx=12)
            tk.Label(t, text=m["desc"]["ru"], bg=C["panel"], fg=C["muted"], font=(F, 9), anchor="w", justify="left", wraplength=width - 30).pack(fill="x", padx=12, pady=(2, 12))

        def toggle(_e=None):
            if not st["busy"]:
                st["sel"].symmetric_difference_update({m["id"]})
                draw()

        def bind_all(w):
            w.bind("<Button-1>", toggle)
            for c in w.winfo_children():
                bind_all(c)
        bind_all(t)
        return t

    def draw():
        for w in grid.winfo_children():
            w.destroy()
        if not st["catalog"]:
            return
        width = max(300, canvas.winfo_width())
        cols = max(1, width // (262 if st["tab"] == "d2pfx" else 290))
        st["cols"] = cols
        tw = width // cols - 12
        its = view_items()
        for i, m in enumerate(its):
            tile(grid, m, tw).grid(row=i // cols, column=i % cols, padx=6, pady=6, sticky="nsew")
        if st["tab"] == "d2pfx" and not its:
            tk.Label(grid, text="Загружаю каталог D2PFX…" if st["d2pfx"] is None else "Ничего не нашлось", bg=C["bg"], fg=C["muted"], font=(F, 10)).grid(row=0, column=0, sticky="w", padx=6, pady=10)
        for c in range(cols):
            grid.grid_columnconfigure(c, weight=1, minsize=tw)
        canvas.itemconfigure(win, width=width)
        for b in tabs_row.winfo_children():
            on = b.tab_id == st["tab"]
            b.configure(bg=C["panel2"] if on else C["bg"], fg=C["gold"] if on else C["muted"])
        for b in cats_row.winfo_children():
            on = b.cat_id == st["cat"]
            b.configure(bg=C["panel2"] if on else C["bg"], fg=C["gold"] if on else C["muted"])
        n_ext = sum(1 for i in st["sel"] if i.startswith("d2pfx:"))
        count_var.set(f"выбрано: {len(st['sel'])}" + (f" (из D2PFX: {n_ext})" if n_ext else "") if st["sel"] else "")

    job = {"id": None}

    def redraw_soon(delay=150):
        if job["id"]:
            root.after_cancel(job["id"])
        job["id"] = root.after(delay, draw)

    def on_resize(e):
        canvas.itemconfigure(win, width=e.width)
        if st["catalog"] and max(1, max(300, e.width) // (262 if st["tab"] == "d2pfx" else 290)) != st["cols"]:
            redraw_soon()
    canvas.bind("<Configure>", on_resize)
    qvar.trace_add("write", lambda *a: (st.update(query=qvar.get()), redraw_soon(250)))

    def set_tab(tab):
        st["tab"] = tab
        if tab == "d2pfx":
            sub.pack(fill="x", padx=20, pady=(0, 6), after=tabs_row)
            if st["d2pfx"] is None:
                status.set("Загружаю каталог D2PFX…")

                def load():
                    try:
                        data = load_d2pfx()
                        root.after(0, lambda: (st.update(d2pfx=data), status.set(f"Каталог D2PFX: {sum(map(len, data.values()))} модов. Скачаются только отмеченные."), draw()))
                    except Exception:
                        root.after(0, lambda: status.set("Не удалось загрузить каталог D2PFX. Проверь интернет."))
                threading.Thread(target=load, daemon=True).start()
        else:
            sub.pack_forget()
        canvas.yview_moveto(0)
        draw()

    def set_cat(cat):
        st["cat"] = cat
        canvas.yview_moveto(0)
        draw()

    def select_view(on):
        ids = {m["id"] for m in view_items()}
        st["sel"] = (st["sel"] | ids) if on else (st["sel"] - ids)
        draw()

    def pick():
        d = filedialog.askdirectory(title="Папка ...\\dota 2 beta\\game")
        if d and os.path.exists(os.path.join(d, "dota", "gameinfo.gi")):
            st["game"] = os.path.normpath(d)
            path_var.set(st["game"])
            refresh_status()
        elif d:
            messagebox.showerror("D2A Mods", "Нужна папка ...\\steamapps\\common\\dota 2 beta\\game")

    def refresh_status():
        if not st["game"]:
            return status.set("Не нашёл Dota 2. Нажми «Папка игры» и укажи ...\\steamapps\\common\\dota 2 beta\\game")
        have = installed_ids(st["game"])
        method, folder = target(st["game"])
        where = f"моды встанут в папку {os.path.basename(folder)}" if method == "lang" else "английский клиент: моды подключаются через gameinfo.gi"
        if have and needs_reapply(st["game"]):
            status.set("Dota обновилась и отключила моды. Нажми «Установить выбранные», чтобы вернуть их.")
        elif have:
            status.set(f"Установлено: {len(have)}. Поменяй галочки и нажми «Установить», чтобы обновить набор ({where}).")
        else:
            status.set(f"Отметь моды и нажми «Установить выбранные». Перед установкой закрой Dota ({where}).")

    def work(fn):
        st["busy"] = True
        root.configure(cursor="watch")

        def run():
            try:
                msg = fn()
                root.after(0, status.set, msg)
            except Exception as e:
                err = str(e)
                root.after(0, lambda: messagebox.showerror("D2A Mods", err))
            finally:
                def done():
                    st["busy"] = False
                    root.configure(cursor="")
                    draw()
                root.after(0, done)
        threading.Thread(target=run, daemon=True).start()

    def do_install():
        if not st["game"]:
            return messagebox.showerror("D2A Mods", "Сначала укажи папку игры")
        if not st["sel"]:
            return do_uninstall()
        if any(i.startswith("d2pfx:") for i in st["sel"]) and st["d2pfx"] is None:
            st["d2pfx"] = load_d2pfx()
        status.set("Собираю моды… Это может занять до минуты.")
        work(lambda: f"Готово: файлов в модах — {install(st['game'], st['catalog'], st['d2pfx'], set(st['sel']), lambda s: root.after(0, status.set, s))}. Запускай Dota.")

    def do_uninstall():
        if st["game"] and messagebox.askyesno("D2A Mods", "Удалить все наши моды и вернуть игру как было?"):
            def run():
                uninstall(st["game"])
                st["sel"] = set()
                return "Все моды удалены, игра как была."
            work(run)

    try:
        st["catalog"], offline = load_catalog()
    except Exception:
        status.set("Не удалось загрузить список модов. Проверь интернет и перезапусти программу.")
        root.mainloop()
        return
    tabs = (st["catalog"].get("tabs") or [{"id": "optimize", "name": {"ru": "Оптимизация"}}]) + [{"id": "d2pfx", "name": {"ru": "Каталог D2PFX"}}]
    for t in tabs:
        b = tk.Label(tabs_row, text=t["name"]["ru"], bg=C["bg"], fg=C["muted"], font=(F, 11, "bold"), padx=16, pady=7, cursor="hand2")
        b.tab_id = t["id"]
        b.bind("<Button-1>", lambda e, tid=t["id"]: set_tab(tid))
        b.pack(side="left", padx=(0, 6))
    for cid, label in D2PFX_CATS:
        b = tk.Label(cats_row, text=label, bg=C["bg"], fg=C["muted"], font=(F, 9, "bold"), padx=10, pady=5, cursor="hand2")
        b.cat_id = cid
        b.bind("<Button-1>", lambda e, c=cid: set_cat(c))
        b.pack(side="left", padx=(0, 4))
    st["tab"] = tabs[0]["id"]
    if st["game"]:
        st["sel"] = installed_ids(st["game"])
    refresh_status()
    newest = st["catalog"].get("app", {}).get("version")
    if offline:
        status.set("Нет интернета: показан сохранённый список модов.")
    elif newest and tuple(map(int, newest.split("."))) > tuple(map(int, APP_VERSION.split("."))):
        status.set(f"Есть новая версия программы {newest}: скачай её на сайте (кнопка «Сайт»).")
    root.after(50, draw)
    root.mainloop()
    pool.shutdown(wait=False, cancel_futures=True)


def main():
    args = sys.argv[1:]
    if "--build-only" in args:
        out = args[args.index("--build-only") + 1]
        game = args[args.index("--game") + 1] if "--game" in args else find_dota()
        if "--catalog" in args:
            with open(args[args.index("--catalog") + 1], encoding="utf-8") as f:
                catalog = json.load(f)
        else:
            catalog = load_catalog()[0]
        ids = set(args[args.index("--mods") + 1].split(",")) if "--mods" in args else {m["id"] for m in catalog["mods"]}
        with tempfile.TemporaryDirectory() as tmp:
            n = build_rules(game, catalog, ids, tmp)
            os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
            vpk.new(tmp).save(out)
        print(f"game: {game}\nfiles replaced: {n} -> {out}")
        return
    run_gui()


if __name__ == "__main__":
    main()

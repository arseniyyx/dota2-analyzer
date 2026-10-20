"""D2A Mods: a small mod manager for Dota 2 by Dota 2 Analyzer.

Mods are only rules ("replace these game files with an empty effect or silence"), downloaded from the site.
The program builds game/dota_d2a/pak01_dir.vpk from the player's own game files and mounts it with one line
in game/dota/gameinfo.gi (backed up first). Uninstall removes both. Only visual and sound mods, nothing that
gives an advantage.

Usage:  D2AMods.exe                                  window
        d2mods.py --build-only out.vpk --mods a,b    build a VPK somewhere else, touch nothing in the game
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.request
import zipfile

import vpk

APP_VERSION = "1.1.0"
SITE = "https://arseniyyx.github.io/dota2-analyzer/"
CATALOG_URL = SITE + "mods/catalog.json"
MOD_FOLDER = "dota_d2a"
MARK = "// D2A mods"
DATA_DIR = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "D2AMods")


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


def dota_running():
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq dota2.exe"], capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        return "dota2.exe" in out.lower()
    except OSError:
        return False


# ---------- catalog ----------

def load_catalog():
    os.makedirs(DATA_DIR, exist_ok=True)
    cache = os.path.join(DATA_DIR, "catalog.json")
    try:
        req = urllib.request.Request(CATALOG_URL, headers={"User-Agent": f"D2AMods/{APP_VERSION}"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        return data, False
    except Exception:
        with open(cache, encoding="utf-8") as f:  # offline: the last catalog we saw
            return json.load(f), True


# ---------- build & install ----------

def fetch_pack(pack, log):
    """Author packs are zips of ready game files; cached, checked against the catalog's sha256."""
    folder = os.path.join(DATA_DIR, "packs")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, pack["id"] + ".zip")
    def ok():
        if not os.path.exists(path):
            return False
        with open(path, "rb") as f:
            return not pack.get("sha256") or hashlib.sha256(f.read()).hexdigest() == pack["sha256"]
    if not ok():
        log(f"Скачиваю пак «{pack['name']['ru']}»…")
        req = urllib.request.Request(pack["url"], headers={"User-Agent": f"D2AMods/{APP_VERSION}"})
        with urllib.request.urlopen(req, timeout=180) as r, open(path + ".part", "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(path + ".part", path)
        if not ok():
            os.remove(path)
            raise RuntimeError(f"Пак «{pack['name']['ru']}» скачался с ошибкой, попробуй ещё раз")
    return path


def unpack(zip_path, dest):
    n = 0
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            parts = info.filename.replace("\\", "/").split("/")
            if info.is_dir() or info.filename.startswith("/") or ".." in parts or ":" in parts[0]:
                continue  # nothing may land outside the build folder
            dst = os.path.join(dest, *parts)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(info) as src, open(dst, "wb") as out:
                shutil.copyfileobj(src, out)
            n += 1
    return n


def build_vpk(game, catalog, mod_ids, out_path, log=print):
    pak = vpk.open(os.path.join(game, "dota", "pak01_dir.vpk"))
    paths = list(pak)
    chosen = [m for m in catalog["mods"] if m["id"] in mod_ids]
    blank = {}
    with tempfile.TemporaryDirectory() as tmp:
        count = 0
        for m in chosen:
            before = count
            for rule in m["rules"]:
                tpl = catalog["templates"][rule["template"]]
                if tpl not in blank:
                    blank[tpl] = pak.get_file(tpl).read()
                rx = re.compile(rule["match"])
                hits = [p for p in paths if rx.search(p) and p != tpl]
                for p in hits:
                    dst = os.path.join(tmp, *p.split("/"))
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    with open(dst, "wb") as f:
                        f.write(blank[tpl])
                count += len(hits)
            log(f"{m['name']['ru']}: {count - before} файлов")
        for pack in [p for p in catalog.get("packs", []) if p["id"] in mod_ids]:
            n = unpack(fetch_pack(pack, log), tmp)
            log(f"{pack['name']['ru']}: {n} файлов")
            count += n
        if not count:
            raise RuntimeError("Ни один файл не подошёл под выбранные моды")
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        vpk.new(tmp).save(out_path)
    return count


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
    # our folder goes first among the Game paths, so its files win over the stock ones
    new, n = re.subn(r"(\n([ \t]*)Game[ \t]+dota[ \t]*\n)", lambda m: f"\n{m.group(2)}Game\t\t\t\t{MOD_FOLDER}\t{MARK}{m.group(1)}", text, count=1)
    if not n:
        raise RuntimeError("Не нашёл строку «Game dota» в gameinfo.gi: формат файла изменился")
    with open(gi, "w", encoding="utf-8") as f:
        f.write(new)


def unmount(game):
    gi = gameinfo_path(game)
    with open(gi, encoding="utf-8") as f:
        text = f.read()
    with open(gi, "w", encoding="utf-8") as f:
        f.write("".join(line for line in text.splitlines(keepends=True) if MARK not in line))


def install(game, catalog, mod_ids, log=print):
    if dota_running():
        raise RuntimeError("Закрой Dota 2 перед установкой")
    folder = os.path.join(game, MOD_FOLDER)
    os.makedirs(folder, exist_ok=True)
    count = build_vpk(game, catalog, mod_ids, os.path.join(folder, "pak01_dir.vpk"), log)
    with open(os.path.join(folder, "installed.json"), "w", encoding="utf-8") as f:
        json.dump({"mods": sorted(mod_ids), "app": APP_VERSION}, f)
    mount(game)
    return count


def uninstall(game):
    if dota_running():
        raise RuntimeError("Закрой Dota 2 перед удалением")
    unmount(game)
    shutil.rmtree(os.path.join(game, MOD_FOLDER), ignore_errors=True)


def installed_mods(game):
    try:
        with open(os.path.join(game, MOD_FOLDER, "installed.json"), encoding="utf-8") as f:
            return set(json.load(f)["mods"])
    except (OSError, ValueError, KeyError):
        return set()


# ---------- window ----------

def run_gui():
    import tkinter as tk
    import webbrowser
    from tkinter import filedialog, messagebox

    C = {"bg": "#0b0e14", "panel": "#151a23", "panel2": "#1c222d", "line": "#2a313e", "fg": "#e8ecf2", "muted": "#96a0b2",
         "gold": "#e3b04b", "gold2": "#f5cd78", "dark": "#1a1408"}
    F = "Segoe UI"
    root = tk.Tk()
    root.title(f"D2A Mods {APP_VERSION}")
    root.configure(bg=C["bg"])
    root.geometry("940x660")
    root.minsize(640, 480)
    st = {"game": find_dota(), "catalog": None, "tab": None, "sel": set(), "busy": False, "cols": 0}

    def button(parent, text, cmd, primary=False):
        base, hover = (C["gold"], C["gold2"]) if primary else (C["panel2"], C["line"])
        b = tk.Label(parent, text=text, bg=base, fg=C["dark"] if primary else C["fg"], font=(F, 10, "bold"), padx=16, pady=9, cursor="hand2")
        b.bind("<Button-1>", lambda e: None if st["busy"] else cmd())
        b.bind("<Enter>", lambda e: b.configure(bg=hover))
        b.bind("<Leave>", lambda e: b.configure(bg=base))
        return b

    # header
    head = tk.Frame(root, bg=C["bg"])
    head.pack(fill="x", padx=20, pady=(16, 6))
    tk.Label(head, text="D2A Mods", bg=C["bg"], fg=C["gold"], font=(F, 20, "bold")).pack(side="left")
    path_var = tk.StringVar(value=st["game"] or "Dota 2 не найдена")
    button(head, "Папка игры", lambda: pick()).pack(side="right")
    tk.Label(head, textvariable=path_var, bg=C["bg"], fg=C["muted"], font=(F, 9)).pack(side="right", padx=10)

    tabs_row = tk.Frame(root, bg=C["bg"])
    tabs_row.pack(fill="x", padx=20, pady=(4, 8))

    # footer goes in before the scroll area so it is always visible
    foot = tk.Frame(root, bg=C["bg"])
    foot.pack(side="bottom", fill="x", padx=20, pady=(6, 14))
    status = tk.StringVar()
    tk.Label(foot, textvariable=status, bg=C["bg"], fg=C["muted"], font=(F, 9), anchor="w", justify="left").pack(fill="x", pady=(0, 8))
    row = tk.Frame(foot, bg=C["bg"])
    row.pack(fill="x")
    button(row, "Установить выбранные", lambda: do_install(), primary=True).pack(side="left")
    button(row, "Удалить все моды", lambda: do_uninstall()).pack(side="left", padx=8)
    button(row, "Выбрать все", lambda: select_tab(True)).pack(side="left")
    button(row, "Снять все", lambda: select_tab(False)).pack(side="left", padx=8)
    button(row, "Сайт", lambda: webbrowser.open(SITE + "#mods")).pack(side="right")

    # scrollable tile area
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

    def items(tab):
        cat = st["catalog"]
        return [m for m in cat["mods"] if m.get("tab", "optimize") == tab] + [p for p in cat.get("packs", []) if p.get("tab", "custom") == tab]

    def tile(parent, m, width):
        on = m["id"] in st["sel"]
        t = tk.Frame(parent, bg=C["panel"], highlightthickness=2, highlightbackground=C["gold"] if on else C["line"], cursor="hand2")
        top = tk.Frame(t, bg=C["panel"])
        top.pack(fill="x", padx=12, pady=(10, 2))
        tk.Label(top, text=m.get("icon", "◆"), bg=C["panel"], fg=C["gold"], font=(F, 18)).pack(side="left")
        tk.Label(top, text="✓" if on else "", bg=C["panel"], fg=C["gold"], font=(F, 14, "bold")).pack(side="right")
        kind = "пак" if "url" in m else {"fps": "FPS", "sound": "звук", "visual": "вид"}.get(m.get("category"), "")
        tk.Label(top, text=kind, bg=C["panel2"], fg=C["muted"], font=(F, 8, "bold"), padx=6).pack(side="right", padx=6)
        tk.Label(t, text=m["name"]["ru"], bg=C["panel"], fg=C["fg"], font=(F, 11, "bold"), anchor="w", justify="left", wraplength=width - 30).pack(fill="x", padx=12)
        tk.Label(t, text=m["desc"]["ru"], bg=C["panel"], fg=C["muted"], font=(F, 9), anchor="w", justify="left", wraplength=width - 30).pack(fill="x", padx=12, pady=(2, 12))

        def toggle(_e=None):
            if st["busy"]:
                return
            st["sel"].symmetric_difference_update({m["id"]})
            draw()
        for w in [t, top, *t.winfo_children(), *top.winfo_children()]:
            w.bind("<Button-1>", toggle)
        return t

    def draw(force=False):
        for w in grid.winfo_children():
            w.destroy()
        if not st["catalog"]:
            return
        width = max(300, canvas.winfo_width())
        cols = max(1, width // 290)
        st["cols"] = cols
        tw = width // cols - 12
        its = items(st["tab"])
        for i, m in enumerate(its):
            tile(grid, m, tw).grid(row=i // cols, column=i % cols, padx=6, pady=6, sticky="nsew")
        if st["tab"] == "custom" and not st["catalog"].get("packs"):
            note = tk.Label(grid, text="Паки от авторов (фанатские скины, звуки, интерфейс) появятся здесь и будут скачиваться прямо в программу.",
                            bg=C["bg"], fg=C["muted"], font=(F, 9), wraplength=width - 40, justify="left", anchor="w")
            note.grid(row=len(its) // cols + 1, column=0, columnspan=cols, sticky="w", padx=6, pady=10)
        for c in range(cols):
            grid.grid_columnconfigure(c, weight=1, minsize=tw)
        canvas.itemconfigure(win, width=width)
        for b in tabs_row.winfo_children():
            on = b.tab_id == st["tab"]
            b.configure(bg=C["panel2"] if on else C["bg"], fg=C["gold"] if on else C["muted"])

    resize_job = {"id": None}

    def on_resize(e):
        if st["catalog"] and max(1, max(300, e.width) // 290) != st["cols"]:
            if resize_job["id"]:
                root.after_cancel(resize_job["id"])
            resize_job["id"] = root.after(120, draw)
        canvas.itemconfigure(win, width=e.width)
    canvas.bind("<Configure>", on_resize)

    def set_tab(tab):
        st["tab"] = tab
        canvas.yview_moveto(0)
        draw()

    def select_tab(on):
        ids = {m["id"] for m in items(st["tab"])}
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
        have = installed_mods(st["game"])
        if have and not is_mounted(st["game"]):
            status.set("Dota обновилась и отключила моды. Нажми «Установить выбранные», чтобы вернуть их.")
        elif have:
            status.set(f"Установлено: {len(have)}. Выбери другие и нажми «Установить», чтобы поменять набор.")
        else:
            status.set("Выбери моды плитками и нажми «Установить выбранные». Перед установкой закрой Dota.")

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
        status.set("Собираю моды из файлов игры… Это 10–40 секунд.")
        work(lambda: f"Готово: заменено файлов — {install(st['game'], st['catalog'], set(st['sel']), lambda s: root.after(0, status.set, s))}. Запускай Dota.")

    def do_uninstall():
        if not st["game"]:
            return
        if messagebox.askyesno("D2A Mods", "Удалить все моды и вернуть игру как было?"):
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
    tabs = st["catalog"].get("tabs") or [{"id": "optimize", "name": {"ru": "Оптимизация"}}]
    for t in tabs:
        b = tk.Label(tabs_row, text=t["name"]["ru"], bg=C["bg"], fg=C["muted"], font=(F, 11, "bold"), padx=16, pady=7, cursor="hand2")
        b.tab_id = t["id"]
        b.bind("<Button-1>", lambda e, tid=t["id"]: set_tab(tid))
        b.pack(side="left", padx=(0, 6))
    st["tab"] = tabs[0]["id"]
    if st["game"]:
        st["sel"] = installed_mods(st["game"])
    refresh_status()
    newest = st["catalog"].get("app", {}).get("version")
    if offline:
        status.set("Нет интернета: показан сохранённый список модов.")
    elif newest and newest != APP_VERSION:
        status.set(f"Есть новая версия программы {newest}: скачай её на сайте (кнопка «Сайт»).")
    root.after(50, draw)
    root.mainloop()


def main():
    args = sys.argv[1:]
    if "--build-only" in args:
        out = args[args.index("--build-only") + 1]
        ids = set(args[args.index("--mods") + 1].split(",")) if "--mods" in args else None
        game = args[args.index("--game") + 1] if "--game" in args else find_dota()
        catalog_file = args[args.index("--catalog") + 1] if "--catalog" in args else None
        if catalog_file:
            with open(catalog_file, encoding="utf-8") as f:
                catalog = json.load(f)
        else:
            catalog = load_catalog()[0]
        ids = ids or {m["id"] for m in catalog["mods"]}
        print(f"game: {game}")
        print(f"files replaced: {build_vpk(game, catalog, ids, out)} -> {out}")
        return
    run_gui()


if __name__ == "__main__":
    main()

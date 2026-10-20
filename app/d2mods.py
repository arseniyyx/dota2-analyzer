"""D2A Mods: a small mod manager for Dota 2 by Dota 2 Analyzer.

Mods are only rules ("replace these game files with an empty effect or silence"), downloaded from the site.
The program builds game/dota_d2a/pak01_dir.vpk from the player's own game files and mounts it with one line
in game/dota/gameinfo.gi (backed up first). Uninstall removes both. Only visual and sound mods, nothing that
gives an advantage.

Usage:  D2AMods.exe                                  window
        d2mods.py --build-only out.vpk --mods a,b    build a VPK somewhere else, touch nothing in the game
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.request

import vpk

APP_VERSION = "1.0.0"
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
    from tkinter import filedialog, messagebox, ttk

    BG, PANEL, FG, MUTED, GOLD = "#0b0e14", "#151a23", "#e8ecf2", "#96a0b2", "#e3b04b"
    root = tk.Tk()
    root.title(f"D2A Mods {APP_VERSION}")
    root.configure(bg=BG)
    root.geometry("620x560")
    root.minsize(520, 460)
    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("TCheckbutton", background=PANEL, foreground=FG, font=("Segoe UI", 11, "bold"))
    style.map("TCheckbutton", background=[("active", PANEL)])
    style.configure("Gold.TButton", background=GOLD, foreground="#1a1408", font=("Segoe UI", 10, "bold"), padding=8, borderwidth=0)
    style.map("Gold.TButton", background=[("active", "#f5cd78"), ("disabled", "#4a4433")])
    style.configure("Ghost.TButton", background=PANEL, foreground=FG, font=("Segoe UI", 10), padding=8, borderwidth=1)
    style.map("Ghost.TButton", background=[("active", "#1c222d")])

    state = {"game": find_dota(), "catalog": None, "vars": {}}
    tk.Label(root, text="D2A Mods", bg=BG, fg=GOLD, font=("Segoe UI", 18, "bold")).pack(anchor="w", padx=18, pady=(14, 0))
    tk.Label(root, text="Только визуальные и звуковые моды, без преимущества в игре. После обновления Dota нажми «Установить» ещё раз.",
             bg=BG, fg=MUTED, font=("Segoe UI", 9), wraplength=580, justify="left").pack(anchor="w", padx=18)

    path_row = tk.Frame(root, bg=BG)
    path_row.pack(fill="x", padx=18, pady=10)
    path_var = tk.StringVar(value=state["game"] or "Dota 2 не найдена")
    tk.Label(path_row, textvariable=path_var, bg=BG, fg=FG, font=("Segoe UI", 9), anchor="w").pack(side="left", fill="x", expand=True)

    def pick():
        d = filedialog.askdirectory(title="Папка dota 2 beta\\game")
        if d and os.path.exists(os.path.join(d, "dota", "gameinfo.gi")):
            state["game"] = os.path.normpath(d); path_var.set(state["game"]); refresh()
        elif d:
            messagebox.showerror("D2A Mods", "Нужна папка ...\\dota 2 beta\\game")
    ttk.Button(path_row, text="Выбрать папку", style="Ghost.TButton", command=pick).pack(side="right")

    box = tk.Frame(root, bg=BG)
    box.pack(fill="both", expand=True, padx=18)
    status = tk.StringVar()
    tk.Label(root, textvariable=status, bg=BG, fg=MUTED, font=("Segoe UI", 9), wraplength=580, justify="left").pack(anchor="w", padx=18, pady=(6, 0))
    btns = tk.Frame(root, bg=BG)
    btns.pack(fill="x", padx=18, pady=12)

    def refresh():
        for w in box.winfo_children():
            w.destroy()
        cat = state["catalog"]
        have = installed_mods(state["game"]) if state["game"] else set()
        for m in cat["mods"]:
            card = tk.Frame(box, bg=PANEL, highlightthickness=1, highlightbackground="#2a313e")
            card.pack(fill="x", pady=4)
            v = state["vars"].setdefault(m["id"], tk.BooleanVar(value=m["id"] in have))
            ttk.Checkbutton(card, text=m["name"]["ru"], variable=v).pack(anchor="w", padx=10, pady=(8, 0))
            tk.Label(card, text=m["desc"]["ru"], bg=PANEL, fg=MUTED, font=("Segoe UI", 9), wraplength=540, justify="left").pack(anchor="w", padx=32, pady=(0, 8))
        if state["game"]:
            mounted = is_mounted(state["game"])
            if have and not mounted:
                status.set("Dota обновилась и сбросила подключение модов. Нажми «Установить», чтобы вернуть их.")
            elif have:
                status.set(f"Установлено модов: {len(have)}.")
            else:
                status.set("Моды не установлены.")

    def work(fn, done):
        for b in btns.winfo_children():
            b.configure(state="disabled")
        def run():
            try:
                msg = fn()
                root.after(0, lambda: (status.set(msg), done()))
            except Exception as e:
                err = str(e)
                root.after(0, lambda: messagebox.showerror("D2A Mods", err))
            finally:
                root.after(0, lambda: [b.configure(state="normal") for b in btns.winfo_children()])
        threading.Thread(target=run, daemon=True).start()

    def do_install():
        ids = {k for k, v in state["vars"].items() if v.get()}
        if not state["game"]:
            return messagebox.showerror("D2A Mods", "Сначала укажи папку игры")
        if not ids:
            return do_uninstall()
        status.set("Собираю моды из файлов игры…")
        work(lambda: f"Готово: заменено файлов — {install(state['game'], state['catalog'], ids, lambda s: root.after(0, status.set, s))}. Запускай Dota.", refresh)

    def do_uninstall():
        if state["game"]:
            work(lambda: (uninstall(state["game"]), "Все моды удалены, игра как была.")[1], refresh)

    ttk.Button(btns, text="Установить выбранные", style="Gold.TButton", command=do_install).pack(side="left")
    ttk.Button(btns, text="Удалить все моды", style="Ghost.TButton", command=do_uninstall).pack(side="left", padx=8)
    ttk.Button(btns, text="Сайт", style="Ghost.TButton", command=lambda: __import__("webbrowser").open(SITE + "#mods")).pack(side="right")

    try:
        state["catalog"], offline = load_catalog()
        refresh()
        if offline:
            status.set("Нет интернета: показан сохранённый список модов.")
        newest = state["catalog"].get("app", {}).get("version")
        if newest and newest != APP_VERSION:
            status.set(f"Есть новая версия программы {newest} — скачай на сайте.")
    except Exception:
        status.set("Не удалось загрузить список модов. Проверь интернет и перезапусти программу.")
    if not state["game"]:
        status.set("Не нашёл Dota 2. Нажми «Выбрать папку» и укажи ...\\steamapps\\common\\dota 2 beta\\game")
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

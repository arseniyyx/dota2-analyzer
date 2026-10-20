"""Carry farm patterns from pro matches (Stratz): where position 1 players take their gold depending on the
lane result, their safe-lane tier 1 tower and whether their mid player holds the mid lane.
Writes data/farm.json. Needs STRATZ_TOKEN."""
import json
import os
import sys
import time
from collections import defaultdict
from statistics import median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import OUT, sql, stratz  # noqa: E402

ACCOUNTS = int(os.environ.get("FARM_ACCOUNTS", "120"))
PER_ACCOUNT = int(os.environ.get("FARM_MATCHES", "60"))
TRACKS = int(os.environ.get("FARM_TRACKS", "60"))  # replays per lane result for the map, rebuilt one at a time

# Stratz MapLocationEnums
R_BASE, R_OFF, R_MID, R_SAFE, D_BASE, D_OFF, D_MID, D_SAFE, RIVER, ROSH, ROAM, R_FOUNT, D_FOUNT = range(13)
OWN_T1 = {True: 18, False: 26}  # goodguys tower1_bot, badguys tower1_top
CATS = ["lane", "push", "mid", "other", "jungle", "ancients"]


def carries(patch, only=None):
    where = f"AND account_id IN ({','.join(map(str, only))})" if only else ""
    return sql(f"""SELECT account_id, count(*) n, array_agg(match_id ORDER BY match_id DESC) ids FROM (
 SELECT pm.account_id, pm.match_id, row_number() OVER (PARTITION BY pm.match_id, pm.player_slot < 128 ORDER BY pm.net_worth DESC) rk
 FROM player_matches pm JOIN match_patch mp ON mp.match_id = pm.match_id WHERE mp.patch = '{patch}' AND pm.lane_role = 1
) t WHERE rk = 1 AND account_id IS NOT NULL {where} GROUP BY account_id HAVING count(*) >= 8 ORDER BY max(match_id) DESC LIMIT {ACCOUNTS}""")


FIELDS = """id didRadiantWin durationSeconds bottomLaneOutcome topLaneOutcome towerDeaths { time npcId }
  players { steamAccountId heroId position isRadiant stats { networthPerMinute
    farmDistributionReport { creepLocation { id gold } neutralLocation { id gold } ancientLocation { id gold } } } }"""


def lane_result(m, rad):
    o = m["bottomLaneOutcome"] if rad else m["topLaneOutcome"]
    if not o:
        return None
    if o == "TIE":
        return "tie"
    return "won" if o.startswith("RADIANT") == rad else "lost"


def game_row(m, acc):
    me = next((p for p in m["players"] if p["steamAccountId"] == acc), None)
    if not me or me["position"] != "POSITION_1" or not me["stats"] or not me["stats"].get("farmDistributionReport"):
        return None
    rad = me["isRadiant"]
    lane = lane_result(m, rad)
    nw = me["stats"].get("networthPerMinute") or []
    fd = me["stats"]["farmDistributionReport"]
    if not lane or len(nw) <= 20:
        return None
    own_safe, pushed = (R_SAFE, D_OFF) if rad else (D_SAFE, R_OFF)
    mids, others = {R_MID, D_MID}, ({R_OFF, D_SAFE} if rad else {D_OFF, R_SAFE})
    g = defaultdict(int)
    for c in fd.get("creepLocation") or []:
        i = c["id"]
        g["lane" if i == own_safe else "push" if i == pushed else "mid" if i in mids else "other" if i in others else "jungle"] += c["gold"]
    for c in fd.get("neutralLocation") or []:
        g["jungle"] += c["gold"]
    for c in fd.get("ancientLocation") or []:
        g["ancients"] += c["gold"]
    total = sum(g.values())
    if total < 3000:
        return None
    mid = next((p for p in m["players"] if p["isRadiant"] == rad and p["position"] == "POSITION_2"), None)
    mid_share = None
    if mid and mid["stats"] and mid["stats"].get("farmDistributionReport"):
        cr = mid["stats"]["farmDistributionReport"].get("creepLocation") or []
        all_c = sum(c["gold"] for c in cr) + sum(c["gold"] for c in mid["stats"]["farmDistributionReport"].get("neutralLocation") or [])
        mid_share = sum(c["gold"] for c in cr if c["id"] in mids) / all_c if all_c else None
    deaths = {t["npcId"]: t["time"] for t in m.get("towerDeaths") or []}
    return {
        "match": m["id"], "acc": acc, "hero": me["heroId"], "rad": rad, "win": m["didRadiantWin"] == rad,
        "lane": lane, "tower": "fallen" if deaths.get(OWN_T1[rad], 1e9) < 900 else "alive", "mid_share": mid_share,
        "gpm": (nw[20] - nw[10]) / 10, "share": {k: g[k] / total for k in CATS},
    }


def fetch_games(rows):
    games = []
    for n, r in enumerate(rows):
        ids = r["ids"][:PER_ACCOUNT]
        d = stratz(f"{{ player(steamAccountId: {r['account_id']}) {{ matches(request: {{ matchIds: [{','.join(map(str, ids))}], take: {len(ids)} }}) {{ {FIELDS} }} }} }}", TOKEN)
        time.sleep(0.6)
        for m in ((d or {}).get("player") or {}).get("matches") or []:
            row = game_row(m, r["account_id"])
            if row:
                games.append(row)
        if n % 10 == 0:
            print(f"  carries {n}/{len(rows)}: {len(games)} games")
    return games


GRID = 32
WINDOWS = {"10-20": (600, 1200), "20-30": (1200, 1800)}
PLAYER_TRACKS = int(os.environ.get("FARM_PLAYER_TRACKS", "15"))


def track(g):
    """Where the carry was in each time window, in real map coordinates on a GRID x GRID grid (seconds per cell)."""
    if g.get("cells") is not None:
        return
    d = stratz(f"{{ player(steamAccountId: {g['acc']}) {{ matches(request: {{ matchIds: [{g['match']}], take: 1 }}) {{ "
               f"players(steamAccountId: {g['acc']}) {{ playbackData {{ playerUpdatePositionEvents {{ time x y }} }} }} }} }} }}", TOKEN)
    time.sleep(2)  # Stratz rebuilds each replay on request: one at a time, gently
    try:
        ev = d["player"]["matches"][0]["players"][0]["playbackData"]["playerUpdatePositionEvents"]
    except (TypeError, KeyError, IndexError):
        g["cells"] = {}
        return
    cells = {w: defaultdict(int) for w in WINDOWS}
    last = None
    for e in ev:  # weight each point by how long the hero stayed there
        if last:
            for w, (a, b) in WINDOWS.items():
                if a <= last["time"] < b:
                    cx = min(GRID - 1, max(0, int((last["x"] - 64) / 128 * GRID)))
                    cy = min(GRID - 1, max(0, int((192 - last["y"]) / 128 * GRID)))
                    cells[w][cy * GRID + cx] += min(30, e["time"] - last["time"])
        last = e
    g["cells"] = {w: dict(c) for w, c in cells.items() if c}


def tracks(games, per_lane):
    recent = sorted(games, key=lambda g: -g["match"])  # replays expire after about two weeks
    pick = []
    for lane in ("won", "tie", "lost"):
        pick += [g for g in recent if g["lane"] == lane][:per_lane]
    for n, g in enumerate(pick):
        track(g)
        if n % 20 == 0:
            print(f"  tracks {n}/{len(pick)}")


def heat_of(tracked):
    """Normalised time share per cell, per side and window. "both" puts Dire games on the Radiant side."""
    out = {}
    for side, sel, need in (("both", tracked, 8), ("rad", [g for g in tracked if g["rad"]], 5), ("dire", [g for g in tracked if not g["rad"]], 5)):
        per = {"n": len(sel)}
        for w in WINDOWS:
            gs = [g for g in sel if g["cells"].get(w)]
            if len(gs) < need:
                continue
            h = defaultdict(float)
            for g in gs:
                tot = sum(g["cells"][w].values())
                for c, v in g["cells"][w].items():
                    if side == "both" and not g["rad"]:
                        c = (GRID - 1 - c // GRID) * GRID + (GRID - 1 - c % GRID)
                    h[c] += v / tot / len(gs)
            per[w] = {str(c): round(v, 4) for c, v in h.items() if v >= 0.0008}
        if len(per) > 1:
            out[side] = per
    return out or None


def summarize(gs, all_games, min_n=15):
    if len(gs) < min_n:
        return None
    gpms = sorted(g["gpm"] for g in gs)
    q = gpms[int(len(gpms) * 0.75)]
    best = [g for g in gs if g["gpm"] >= q]
    rest = [g for g in gs if g["gpm"] < q]
    avg = lambda lst, k: sum(g["share"][k] for g in lst) / max(1, len(lst))

    def pattern(g):
        s = g["share"]
        if s["jungle"] + s["ancients"] >= 0.45:
            return "jungle"
        if s["mid"] + s["other"] >= 0.25:
            return "rotate"
        if s["lane"] + s["push"] >= 0.5:
            return "lane"
        return "mixed"
    pats = defaultdict(list)
    for g in gs:
        pats[pattern(g)].append(g)
    tracked = [g for g in gs if g.get("cells")]
    return {
        "n": len(gs), "wr": round(100 * sum(g["win"] for g in gs) / len(gs)), "gpm": round(median(gpms)),
        "share": {k: round(avg(gs, k), 3) for k in CATS},
        "best": {k: round(avg(best, k) - avg(rest, k), 3) for k in CATS} if rest else {k: 0 for k in CATS},
        "patterns": {p: [len(v), round(100 * sum(g["win"] for g in v) / len(v)), round(median(g["gpm"] for g in v))] for p, v in pats.items() if len(v) >= max(3, min_n // 3)},
        "heat": heat_of(tracked), "tracked": len(tracked),
    }


def by_situation(games, min_n):
    return {key: {v: summarize([g for g in games if g[key] == v], games, min_n) for v in values}
            for key, values in (("lane", ("won", "tie", "lost")), ("tower", ("alive", "fallen")), ("mid", ("free", "held")))}


def main():
    patch = sql("SELECT patch FROM match_patch ORDER BY match_id DESC LIMIT 1")[0]["patch"]
    with open(os.path.join(OUT, "pros.json"), encoding="utf-8") as f:
        stars = [p for p in json.load(f)["players"] if p["pos"] == 1]
    rows = carries(patch)
    have = {r["account_id"] for r in rows}
    extra = [p["account_id"] for p in stars if p["account_id"] not in have]
    if extra:
        rows += carries(patch, extra)
    print(f"Carry farm patterns, patch {patch}: {len(rows)} carries")
    games = fetch_games(rows)
    shares = sorted(g["mid_share"] for g in games if g["mid_share"] is not None)
    cut = shares[len(shares) // 2] if shares else 0.5  # "free mid": the mid player took less of the mid lane than usual
    for g in games:
        g["mid"] = None if g["mid_share"] is None else "free" if g["mid_share"] < cut else "held"
    tracks(games, TRACKS)
    players = []
    for p in stars:
        pg = [g for g in games if g["acc"] == p["account_id"]]
        for g in sorted(pg, key=lambda g: -g["match"])[:PLAYER_TRACKS]:
            track(g)
        summary = summarize(pg, games, 8)
        if summary:
            players.append({"account_id": p["account_id"], "name": p["name"], "team": p["team"], "avatar": p.get("avatar"),
                            "all": summary, "by": by_situation(pg, 8)})
        print(f"  {p['name']}: {len(pg)} games")
    print(f"  {len(games)} games, {sum(1 for g in games if g.get('cells'))} tracked")
    out = {"patch": patch, "generated_at": int(time.time()), "games": len(games), "grid": GRID, "windows": list(WINDOWS),
           "all": summarize(games, games), "by": by_situation(games, 15), "players": players}
    with open(os.path.join(OUT, "farm.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("Done.")


TOKEN = os.environ.get("STRATZ_TOKEN")
if __name__ == "__main__":
    if not TOKEN:
        sys.exit("STRATZ_TOKEN is not set")
    main()

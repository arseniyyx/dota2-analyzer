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
TRACKS = int(os.environ.get("FARM_TRACKS", "30"))  # replays per lane result for the map, rebuilt one at a time

# Stratz MapLocationEnums
R_BASE, R_OFF, R_MID, R_SAFE, D_BASE, D_OFF, D_MID, D_SAFE, RIVER, ROSH, ROAM, R_FOUNT, D_FOUNT = range(13)
OWN_T1 = {True: 18, False: 26}  # goodguys tower1_bot, badguys tower1_top
CATS = ["lane", "push", "mid", "other", "jungle", "ancients"]


def carries(patch):
    return sql(f"""SELECT account_id, count(*) n, array_agg(match_id ORDER BY match_id DESC) ids FROM (
 SELECT pm.account_id, pm.match_id, row_number() OVER (PARTITION BY pm.match_id, pm.player_slot < 128 ORDER BY pm.net_worth DESC) rk
 FROM player_matches pm JOIN match_patch mp ON mp.match_id = pm.match_id WHERE mp.patch = '{patch}' AND pm.lane_role = 1
) t WHERE rk = 1 AND account_id IS NOT NULL GROUP BY account_id HAVING count(*) >= 8 ORDER BY max(match_id) DESC LIMIT {ACCOUNTS}""")


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


def tracks(games):
    """Carry positions 10:00-20:00 from a small sample of replays, seen from the Radiant side, on a 24x24 grid."""
    pick = []
    recent = sorted(games, key=lambda g: -g["match"])  # replays expire after about two weeks
    for lane in ("won", "tie", "lost"):
        pick += [g for g in recent if g["lane"] == lane][:TRACKS]
    for n, g in enumerate(pick):
        d = stratz(f"{{ player(steamAccountId: {g['acc']}) {{ matches(request: {{ matchIds: [{g['match']}], take: 1 }}) {{ "
                   f"players(steamAccountId: {g['acc']}) {{ playbackData {{ playerUpdatePositionEvents {{ time x y }} }} }} }} }} }}", TOKEN)
        time.sleep(2)
        try:
            ev = d["player"]["matches"][0]["players"][0]["playbackData"]["playerUpdatePositionEvents"]
        except (TypeError, KeyError, IndexError):
            continue
        cells = defaultdict(int)
        last = None
        for e in ev:  # weight each point by how long the hero stayed there
            if last and 600 <= last["time"] < 1200:
                x, y = (last["x"], last["y"]) if g["rad"] else (256 - last["x"], 256 - last["y"])
                cx, cy = min(23, max(0, int((x - 64) / 128 * 24))), min(23, max(0, int((192 - y) / 128 * 24)))
                cells[cy * 24 + cx] += min(30, e["time"] - last["time"])
            last = e
        g["cells"] = dict(cells)
        if n % 15 == 0:
            print(f"  tracks {n}/{len(pick)}")
    return [g for g in pick if g.get("cells")]


def summarize(gs, all_games):
    if len(gs) < 15:
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
    heat = defaultdict(float)
    tracked = [g for g in gs if g.get("cells")]
    for g in tracked:
        tot = sum(g["cells"].values())
        for c, v in g["cells"].items():
            heat[int(c)] += v / tot / len(tracked)
    return {
        "n": len(gs), "wr": round(100 * sum(g["win"] for g in gs) / len(gs)), "gpm": round(median(gpms)),
        "share": {k: round(avg(gs, k), 3) for k in CATS},
        "best": {k: round(avg(best, k) - avg(rest, k), 3) for k in CATS}, "best_gpm": round(median(g["gpm"] for g in best)),
        "patterns": {p: [len(v), round(100 * sum(g["win"] for g in v) / len(v)), round(median(g["gpm"] for g in v))] for p, v in pats.items() if len(v) >= 5},
        "heat": {str(c): round(v, 4) for c, v in heat.items() if v >= 0.002} if len(tracked) >= 8 else None, "tracked": len(tracked),
    }


def main():
    patch = sql("SELECT patch FROM match_patch ORDER BY match_id DESC LIMIT 1")[0]["patch"]
    rows = carries(patch)
    print(f"Carry farm patterns, patch {patch}: {len(rows)} carries")
    games = fetch_games(rows)
    shares = sorted(g["mid_share"] for g in games if g["mid_share"] is not None)
    cut = shares[len(shares) // 2] if shares else 0.5  # "free mid": the mid player took less of the mid lane than usual
    for g in games:
        g["mid"] = None if g["mid_share"] is None else "free" if g["mid_share"] < cut else "held"
    tracked = tracks(games)
    print(f"  {len(games)} games, {len(tracked)} tracked")
    out = {"patch": patch, "generated_at": int(time.time()), "games": len(games), "all": summarize(games, games), "by": {}}
    for key, values in (("lane", ("won", "tie", "lost")), ("tower", ("alive", "fallen")), ("mid", ("free", "held"))):
        out["by"][key] = {v: summarize([g for g in games if g[key] == v], games) for v in values}
    with open(os.path.join(OUT, "farm.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print("Done.")


TOKEN = os.environ.get("STRATZ_TOKEN")
if __name__ == "__main__":
    if not TOKEN:
        sys.exit("STRATZ_TOKEN is not set")
    main()

"""Builds the static data files the site reads: matchups/synergy/duration curves
from recent ranked pubs, and positions/counter-items/item timings from pro matches
of the current patch. Source: OpenDota explorer (public, no key)."""

import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from statistics import median

import numpy as np

API = "https://api.opendota.com/api"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
DAYS = int(os.environ.get("DAYS", "7"))
CHUNK = 200_000
DUR_BINS = ["<20", "20-25", "25-30", "30-35", "35-40", "40-45", "45-50", "50+"]
EXTRA_ITEMS = {"blink", "gem", "dust", "ward_sentry"}


def get(path, params=None, tries=6):
    url = f"{API}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "dota2-analyzer-data"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, http.client.HTTPException, OSError, json.JSONDecodeError) as e:
            wait = 5 * (i + 1)
            print(f"  retry {i + 1} in {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"failed: {url}")


def sql(query):
    d = get("explorer", {"sql": query})
    if d.get("err"):
        raise RuntimeError(d["err"])
    return d["rows"]


def group_of(tier):
    return (tier // 10 + 1) // 2  # 1 Herald-Guardian, 2 Crusader-Archon, 3 Legend-Ancient, 4 Divine-Immortal


def dur_bin(seconds):
    m = seconds // 60
    return 0 if m < 20 else min(7, (m - 20) // 5 + 1)


def build_pubs(hero_ids):
    idx = {h: i for i, h in enumerate(hero_ids)}
    n = len(hero_ids)
    acc = {g: {
        "games": np.zeros(n, np.int64), "wins": np.zeros(n, np.int64),
        "vs_games": np.zeros((n, n), np.int64), "vs_wins": np.zeros((n, n), np.int64),
        "with_games": np.zeros((n, n), np.int64), "with_wins": np.zeros((n, n), np.int64),
        "dur_games": np.zeros((n, 8), np.int64), "dur_wins": np.zeros((n, 8), np.int64),
        "matches": 0,
    } for g in (1, 2, 3, 4)}

    hi = sql("SELECT max(match_id) AS m FROM public_matches")[0]["m"]
    cutoff = time.time() - DAYS * 86400
    total = empty = 0
    while True:
        try:
            rows = sql(
                "SELECT radiant_win, avg_rank_tier, duration, start_time, radiant_team, dire_team FROM public_matches "
                f"WHERE match_id > {hi - CHUNK} AND match_id <= {hi} AND lobby_type = 7 AND game_mode = 22 "
                "AND avg_rank_tier IS NOT NULL AND duration >= 900"
            )
        except RuntimeError as e:
            print(f"  skipped chunk ending {hi}: {e}", file=sys.stderr)
            hi -= CHUNK
            continue
        hi -= CHUNK
        if rows and max(r["start_time"] for r in rows) < cutoff:
            break
        if not rows:
            empty += 1
            if empty > 25:
                break
            continue
        by_group = defaultdict(list)
        for r in rows:
            if r["start_time"] < cutoff or not r["radiant_team"] or not r["dire_team"]:
                continue
            rt, dt = r["radiant_team"], r["dire_team"]
            if len(rt) != 5 or len(dt) != 5 or any(h not in idx for h in rt + dt):
                continue
            g = group_of(r["avg_rank_tier"])
            if g not in acc:
                continue
            by_group[g].append(([idx[h] for h in rt], [idx[h] for h in dt], bool(r["radiant_win"]), dur_bin(r["duration"])))
        for g, ms in by_group.items():
            a = acc[g]
            a["matches"] += len(ms)
            win_team = np.array([m[0] if m[2] else m[1] for m in ms])
            lose_team = np.array([m[1] if m[2] else m[0] for m in ms])
            bins = np.array([m[3] for m in ms])
            for t, won in ((win_team, 1), (lose_team, 0)):
                np.add.at(a["games"], t.ravel(), 1)
                np.add.at(a["dur_games"], (t.ravel(), np.repeat(bins, 5)), 1)
                if won:
                    np.add.at(a["wins"], t.ravel(), 1)
                    np.add.at(a["dur_wins"], (t.ravel(), np.repeat(bins, 5)), 1)
                for i in range(5):
                    for j in range(5):
                        if i != j:
                            np.add.at(a["with_games"], (t[:, i], t[:, j]), 1)
                            if won:
                                np.add.at(a["with_wins"], (t[:, i], t[:, j]), 1)
            for i in range(5):
                for j in range(5):
                    np.add.at(a["vs_games"], (win_team[:, i], lose_team[:, j]), 1)
                    np.add.at(a["vs_games"], (lose_team[:, j], win_team[:, i]), 1)
                    np.add.at(a["vs_wins"], (win_team[:, i], lose_team[:, j]), 1)
        total += sum(len(v) for v in by_group.values())
        print(f"  pubs: {total} matches (chunk ending {hi + CHUNK})")
        time.sleep(1)

    for g, a in acc.items():
        out = {"heroes": hero_ids, "matches": a["matches"], "days": DAYS, "dur_bins": DUR_BINS}
        for k, v in a.items():
            if k != "matches":
                out[k] = v.ravel().tolist()
        with open(os.path.join(OUT, f"g{g}.json"), "w") as f:
            json.dump(out, f, separators=(",", ":"))
        print(f"  g{g}: {a['matches']} matches")
    return {g: a["matches"] for g, a in acc.items()}


def assign_positions(team):
    """team: list of dicts with lane_role, is_roaming, net_worth. Returns pos per player (1..5)."""
    order = sorted(range(len(team)), key=lambda i: -(team[i].get("net_worth") or 0))
    pos = {}
    for want_pos, lane in ((2, 2), (1, 1), (3, 3)):
        for i in order:
            if i not in pos and team[i].get("lane_role") == lane and not team[i].get("is_roaming"):
                pos[i] = want_pos
                break
    for want_pos in (1, 2, 3):
        if want_pos not in pos.values():
            for i in order:
                if i not in pos:
                    pos[i] = want_pos
                    break
    rest = [i for i in order if i not in pos]
    for i, p in zip(rest, (4, 5)):
        pos[i] = p
    return pos


def build_pro(item_consts):
    patch = sql("SELECT patch FROM match_patch ORDER BY match_id DESC LIMIT 1")[0]["patch"]
    ids = [r["match_id"] for r in sql(
        f"SELECT match_id FROM matches JOIN match_patch USING(match_id) WHERE patch = '{patch}' ORDER BY match_id")]
    print(f"  pro: patch {patch}, {len(ids)} matches")

    allowed = {k for k, v in item_consts.items()
               if (v.get("components") and (v.get("cost") or 0) >= 900 and not k.startswith("recipe")) or k in EXTRA_ITEMS}

    players = []
    for s in range(0, len(ids), 150):
        part = ids[s:s + 150]
        rows = sql(
            "SELECT match_id, player_slot, hero_id, lane_role, is_roaming, net_worth, purchase_log FROM player_matches "
            f"WHERE match_id >= {part[0]} AND match_id <= {part[-1]} AND match_id IN ({','.join(map(str, part))})"
        )
        players.extend(rows)
        print(f"  pro players: {len(players)}")
        time.sleep(1)

    by_match = defaultdict(list)
    for p in players:
        by_match[p["match_id"]].append(p)

    pos_counts = defaultdict(lambda: [0] * 5)
    hero_n = defaultdict(int)
    hero_item = defaultdict(lambda: defaultdict(int))
    hero_item_times = defaultdict(lambda: defaultdict(list))
    samples = []
    for mid, ps in by_match.items():
        if len(ps) != 10:
            continue
        teams = {True: [p for p in ps if p["player_slot"] < 128], False: [p for p in ps if p["player_slot"] >= 128]}
        if len(teams[True]) != 5:
            continue
        for side, team in teams.items():
            for i, pnum in assign_positions(team).items():
                pos_counts[team[i]["hero_id"]][pnum - 1] += 1
            enemies = [p["hero_id"] for p in teams[not side]]
            for p in team:
                first = {}
                for e in p.get("purchase_log") or []:
                    if e["key"] in allowed and e["key"] not in first:
                        first[e["key"]] = e["time"]
                h = p["hero_id"]
                hero_n[h] += 1
                for k, t in first.items():
                    hero_item[h][k] += 1
                    hero_item_times[h][k].append(t)
                samples.append((h, enemies, set(first)))

    base = {h: {k: c / hero_n[h] for k, c in items.items()} for h, items in hero_item.items()}
    obs = defaultdict(lambda: defaultdict(int))
    exp = defaultdict(lambda: defaultdict(float))
    seen = defaultdict(int)
    for h, enemies, bought in samples:
        rates = base.get(h, {})
        for e in enemies:
            seen[e] += 1
            for k in bought:
                obs[e][k] += 1
            for k, r in rates.items():
                exp[e][k] += r

    counters = {}
    for e in obs:
        rows = []
        for k, o in obs[e].items():
            x = exp[e][k]
            lift = (o + 1) / (x + 1)
            if o >= 10 and lift >= 1.25:
                rows.append([k, round(lift, 2), o, round(x, 1)])
        rows.sort(key=lambda r: -(r[1] - 1) * r[2] ** 0.5)
        counters[e] = rows[:12]

    pro_items = {}
    for h, items in hero_item.items():
        pro_items[h] = {k: [round(c / hero_n[h], 3), int(median(hero_item_times[h][k]))]
                        for k, c in items.items() if c / hero_n[h] >= 0.05}
    return patch, len(by_match), dict(pos_counts), counters, pro_items, dict(seen)


def main():
    os.makedirs(OUT, exist_ok=True)
    heroes = get("heroStats")
    hero_ids = sorted(h["id"] for h in heroes)
    items = get("constants/items")

    print("Pro matches...")
    patch, pro_matches, positions, counters, pro_items, seen = build_pro(items)
    meta = {
        "generated_at": int(time.time()),
        "patch": patch,
        "days": DAYS,
        "pro_matches": pro_matches,
        "group_matches": {},
        "positions": positions,
        "counter_items": counters,
        "counter_samples": seen,
        "pro_items": pro_items,
    }
    pro_cache = os.path.join(OUT, "pro.partial.json")
    with open(pro_cache, "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    print("Ranked pubs...")
    meta["group_matches"] = build_pubs(hero_ids)
    meta["generated_at"] = int(time.time())
    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))
    os.remove(pro_cache)
    print("Done.")


if __name__ == "__main__":
    main()

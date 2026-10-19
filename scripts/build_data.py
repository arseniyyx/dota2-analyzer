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
from collections import Counter, defaultdict
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
            "SELECT match_id, account_id, player_slot, hero_id, lane_role, is_roaming, net_worth, purchase_log FROM player_matches "
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
                team[i]["_pos"] = pnum
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
    return patch, len(by_match), dict(pos_counts), counters, pro_items, dict(seen), ids, by_match


def chunked_sql(ids, size, make_query):
    rows = []
    for s in range(0, len(ids), size):
        part = ids[s:s + size]
        try:
            rows.extend(sql(make_query(part)))
        except RuntimeError as e:
            print(f"  skipped chunk: {e}", file=sys.stderr)
        time.sleep(1)
    return rows


def build_hero_pos(by_match, minfo, items):
    """Per hero and position: what pros build there, and the best players on that hero in that role."""
    big = lambda k: k in items and (items[k].get("cost") or 0) >= 1000 and (items[k].get("components") or k == "blink") and not k.startswith("recipe")
    games = defaultdict(list)  # (hero, pos) -> [(account_id, won, {item: first purchase time})]
    for mid, ps in by_match.items():
        mi = minfo.get(mid)
        if not mi:
            continue
        for p in ps:
            if "_pos" not in p:
                continue
            first = {}
            for e in p.get("purchase_log") or []:
                if big(e["key"]) and e["key"] not in first:
                    first[e["key"]] = e["time"]
            games[(p["hero_id"], p["_pos"])].append((p.get("account_id"), (p["player_slot"] < 128) == mi["radiant_win"], first))

    def build_of(gs, min_rate, limit):
        times = defaultdict(list)
        for _, _, first in gs:
            for k, t in first.items():
                times[k].append(t)
        return sorted([[k, int(median(v)), round(len(v) / len(gs), 2)] for k, v in times.items() if len(v) / len(gs) >= min_rate], key=lambda x: x[1])[:limit]

    wr = lambda gs: round(100 * sum(g[1] for g in gs) / len(gs))
    out, cands = {}, {}
    for (h, pos), gs in games.items():
        if len(gs) < 15:
            continue
        by_p = defaultdict(list)
        for g in gs:
            if g[0]:
                by_p[g[0]].append(g)
        # rank by win rate shrunk toward 50% so 3-0 doesn't beat 12-4
        cands[(h, pos)] = sorted([(a, pg) for a, pg in by_p.items() if len(pg) >= 3], key=lambda x: -(sum(g[1] for g in x[1]) + 1.5) / (len(x[1]) + 3))[:10]
        out.setdefault(h, {})[pos] = {"n": len(gs), "wr": wr(gs), "build": build_of(gs, 0.25, 8), "top": []}
    accs = sorted({a for c in cands.values() for a, _ in c})
    names = {}
    for s_ in range(0, len(accs), 300):
        part = accs[s_:s_ + 300]
        for r in sql(f"SELECT account_id, name, team_name FROM notable_players WHERE account_id IN ({','.join(map(str, part))})"):
            if r.get("name"):
                names[r["account_id"]] = (r["name"].strip(), (r.get("team_name") or "").strip())
        time.sleep(1)
    for (h, pos), c in cands.items():
        out[h][pos]["top"] = [{"id": a, "name": names[a][0], "team": names[a][1], "games": len(pg), "wr": wr(pg), "build": build_of(pg, 0.4, 6)}
                              for a, pg in c if a in names][:4]
    with open(os.path.join(OUT, "heroes.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  hero/position builds: {sum(len(v) for v in out.values())} pairs, {len(names)} named players")


def build_pros(patch, ids, by_match, items):
    """Tier-1 players (top-rated active teams), 5 per position, with their hero, item, farm and situation patterns."""
    teams = sql("SELECT tr.team_id, t.name, tr.rating FROM team_rating tr JOIN teams t USING(team_id) "
                "WHERE tr.last_match_time > extract(epoch from now() - interval '60 days') ORDER BY tr.rating DESC LIMIT 24")
    rating = {t["team_id"]: (t["rating"], (t["name"] or "").strip()) for t in teams}
    in_list = lambda part: f"match_id >= {part[0]} AND match_id <= {part[-1]} AND match_id IN ({','.join(map(str, part))})"
    minfo = {r["match_id"]: r for r in chunked_sql(ids, 400, lambda part: (
        "SELECT match_id, radiant_team_id, dire_team_id, radiant_win, duration, radiant_gold_adv FROM matches WHERE " + in_list(part)))}

    build_hero_pos(by_match, minfo, items)

    acc = defaultdict(lambda: {"games": 0, "teams": Counter(), "pos": Counter()})
    for mid, ps in by_match.items():
        mi = minfo.get(mid)
        if not mi:
            continue
        for p in ps:
            if p.get("account_id") and "_pos" in p:
                a = acc[p["account_id"]]
                a["games"] += 1
                a["teams"][mi["radiant_team_id"] if p["player_slot"] < 128 else mi["dire_team_id"]] += 1
                a["pos"][p["_pos"]] += 1
    cands = []
    for aid, v in acc.items():
        if v["games"] < 25:
            continue
        team, tg = v["teams"].most_common(1)[0]
        pos, pg = v["pos"].most_common(1)[0]
        if team in rating and tg >= v["games"] * 0.5 and pg >= v["games"] * 0.6:
            cands.append((aid, pos, team, v["games"]))
    chosen = []
    for pos in range(1, 6):
        picked = set()  # one player per team per position: the team's main player there
        for c in sorted([c for c in cands if c[1] == pos], key=lambda c: (-rating[c[2]][0], -c[3])):
            if c[2] not in picked and len(picked) < 5:
                picked.add(c[2])
                chosen.append(c[:3])
    names = {r["account_id"]: r["name"] for r in sql(
        f"SELECT account_id, name FROM notable_players WHERE account_id IN ({','.join(str(c[0]) for c in chosen)})")}

    accounts = [c[0] for c in chosen]
    rows = chunked_sql(accounts, 5, lambda part: (
        "SELECT account_id, match_id, player_slot, hero_id, kills, deaths, assists, gold_per_min, xp_per_min, last_hits, "
        "hero_damage, tower_damage, net_worth, gold_t, kills_log, purchase_log FROM player_matches "
        f"WHERE match_id >= {ids[0]} AND account_id IN ({','.join(map(str, part))})"))
    by_acc = defaultdict(list)
    for r in rows:
        if r["match_id"] in minfo:
            by_acc[r["account_id"]].append(r)

    big = lambda k: k in items and (items[k].get("cost") or 0) >= 2000 and (items[k].get("components") or k == "blink") and not k.startswith("recipe")
    players = []
    for aid, pos, team in chosen:
        rs = by_acc.get(aid, [])
        if len(rs) < 15:
            continue
        mi = lambda r: minfo[r["match_id"]]
        rad = lambda r: r["player_slot"] < 128
        win = lambda r: rad(r) == mi(r)["radiant_win"]
        mins = lambda r: mi(r)["duration"] / 60
        n = len(rs)
        avg = lambda f: sum(f(r) for r in rs) / n
        wr = lambda lst: [len(lst), round(100 * sum(win(r) for r in lst) / len(lst)) if lst else None]

        phases = []
        for a, b in ((0, 10), (10, 20), (20, 30), (30, 40)):
            g = [(r["gold_t"][b] - r["gold_t"][a]) / (b - a) for r in rs if r.get("gold_t") and len(r["gold_t"]) > b]
            phases.append(round(sum(g) / len(g)) if g else None)

        def adv15(r):
            adv = mi(r).get("radiant_gold_adv") or []
            return None if len(adv) <= 15 else adv[15] * (1 if rad(r) else -1)

        kills_by_bucket = Counter(min(9, int(k["time"] // 300)) for r in rs for k in (r.get("kills_log") or []) if k["time"] >= 0)
        peak = kills_by_bucket.most_common(1)[0][0] if kills_by_bucket else None

        heroes = []
        fast = slow = fast_w = slow_w = 0
        for h, c in Counter(r["hero_id"] for r in rs).most_common(6):
            hr = [r for r in rs if r["hero_id"] == h]
            firsts = defaultdict(list)
            first_big = []
            for r in hr:
                seen = []
                for e in r.get("purchase_log") or []:
                    if big(e["key"]) and e["key"] not in seen:
                        seen.append(e["key"])
                        firsts[e["key"]].append(e["time"])
                        if len(seen) == 1:
                            first_big.append((e["time"], win(r)))
            if len(first_big) >= 4:
                med = median(t for t, _ in first_big)
                for t, w in first_big:
                    if t <= med:
                        fast += 1; fast_w += w
                    else:
                        slow += 1; slow_w += w
            build = sorted([[k, int(median(v)), round(len(v) / c, 2)] for k, v in firsts.items() if len(v) >= max(2, 0.3 * c)], key=lambda x: x[1])[:6]
            heroes.append({"hero_id": h, "games": c, "wr": round(100 * sum(win(r) for r in hr) / c),
                           "gpm": round(sum(r["gold_per_min"] for r in hr) / c), "build": build})

        vs = defaultdict(lambda: [0, 0])
        for r in rs:
            for e in by_match.get(r["match_id"], []):
                if (e["player_slot"] < 128) != rad(r):
                    vs[e["hero_id"]][0] += 1
                    vs[e["hero_id"]][1] += win(r)
        base = sum(win(r) for r in rs) / n  # shrink toward the player's own WR so 4-0 doesn't beat 9-1
        vs_list = [[h, g, round(100 * w / g), (w + 6 * base) / (g + 6)] for h, (g, w) in vs.items() if g >= 5]
        vs_list = [x[:3] for x in sorted(vs_list, key=lambda x: -x[3])]

        players.append({
            "account_id": aid, "name": names.get(aid) or str(aid), "team": rating[team][1], "pos": pos,
            "games": n, "wr": round(100 * sum(win(r) for r in rs) / n, 1),
            "gpm": round(avg(lambda r: r["gold_per_min"])), "xpm": round(avg(lambda r: r["xp_per_min"])),
            "lh_min": round(avg(lambda r: r["last_hits"] / mins(r)), 2), "nw": round(avg(lambda r: r["net_worth"] or 0)),
            "kills": round(avg(lambda r: r["kills"]), 1), "deaths": round(avg(lambda r: r["deaths"]), 1), "assists": round(avg(lambda r: r["assists"]), 1),
            "hd_min": round(avg(lambda r: r["hero_damage"] / mins(r))), "td": round(avg(lambda r: r["tower_damage"])),
            "farm_phases": phases, "kill_peak": peak,
            "situations": {
                "short": wr([r for r in rs if mins(r) < 35]), "long": wr([r for r in rs if mins(r) >= 45]),
                "behind": wr([r for r in rs if (adv15(r) or 0) <= -3000]), "ahead": wr([r for r in rs if (adv15(r) or 0) >= 3000]),
            },
            "spike": {"fast": [fast, round(100 * fast_w / fast) if fast else None], "slow": [slow, round(100 * slow_w / slow) if slow else None]},
            "heroes": heroes, "best_vs": vs_list[:3], "worst_vs": vs_list[-3:][::-1],
        })
        try:  # current Steam avatar, refreshed with every build
            players[-1]["avatar"] = (get(f"players/{aid}").get("profile") or {}).get("avatarfull")
        except RuntimeError:
            pass
        print(f"  pro {names.get(aid)} pos {pos} {rating[team][1]}: {n} games")
    with open(os.path.join(OUT, "pros.json"), "w", encoding="utf-8") as f:
        json.dump({"patch": patch, "generated_at": int(time.time()), "players": players}, f, ensure_ascii=False, separators=(",", ":"))


def main():
    os.makedirs(OUT, exist_ok=True)
    heroes = get("heroStats")
    hero_ids = sorted(h["id"] for h in heroes)
    items = get("constants/items")

    print("Pro matches...")
    patch, pro_matches, positions, counters, pro_items, seen, pro_ids, by_match = build_pro(items)
    print("Tier-1 players...")
    build_pros(patch, pro_ids, by_match, items)
    if os.environ.get("ONLY_PROS"):
        return
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

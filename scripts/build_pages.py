"""Static, crawlable pages built from the daily data: one guide per hero, a hero index and the patch meta,
in Russian (/hero/<slug>/) and English (/en/hero/<slug>/). Rewrites sitemap.xml. Same numbers as the app."""
import html
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import get  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
SITE = "https://arseniyyx.github.io/dota2-analyzer/"
BASE = "/dota2-analyzer/"
CDN = "https://cdn.cloudflare.steamstatic.com"
K_HERO, K_PAIR, K_DUR = 50, 60, 40
POS = {"ru": ["", "Керри", "Мид", "Оффлейн", "Четвёрка", "Пятёрка"], "en": ["", "Carry", "Mid", "Offlane", "Soft support", "Hard support"]}
DUR = {"ru": ["до 20", "20–25", "25–30", "30–35", "35–40", "40–45", "45–50", "50+"], "en": ["<20", "20–25", "25–30", "30–35", "35–40", "40–45", "45–50", "50+"]}
BOOTS = re.compile(r"boots|treads|greaves|bearing")
esc = html.escape


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def mmss(s):
    return f"{int(s) // 60}:{int(s) % 60:02d}"


class Group:
    """data/g4.json with the app's smoothing (heroWr, heroPick, adv, durWr)."""

    def __init__(self, d):
        self.d, self.n = d, len(d["heroes"])
        self.idx = {h: i for i, h in enumerate(d["heroes"])}

    def wr(self, h):
        i = self.idx.get(h)
        return 0.5 if i is None else (self.d["wins"][i] + K_HERO * 0.5) / (self.d["games"][i] + K_HERO)

    def pick(self, h):
        i = self.idx.get(h)
        return 0 if i is None else self.d["games"][i] / max(1, self.d["matches"] * 10) * 10

    def adv(self, a, b):
        i, j = self.idx.get(a), self.idx.get(b)
        if i is None or j is None:
            return 0
        g, w = self.d["vs_games"][i * self.n + j], self.d["vs_wins"][i * self.n + j]
        e = 0.5 + (self.wr(a) - 0.5) - (self.wr(b) - 0.5)
        return ((w + K_PAIR * e) / (g + K_PAIR) - e) * 100

    def dur(self, h, b):
        i = self.idx.get(h)
        if i is None:
            return 0.5
        return (self.d["dur_wins"][i * 8 + b] + K_DUR * self.wr(h)) / (self.d["dur_games"][i * 8 + b] + K_DUR)


def pos_prior(h, meta, heroes):
    c = (meta.get("positions") or {}).get(str(h)) or [0] * 5
    roles = heroes[h].get("roles") or []
    pr = [0.04, 0.04, 0.12, 0.4, 0.4] if "Support" in roles else [0.5, 0.2, 0.2, 0.05, 0.05] if "Carry" in roles else [0.2, 0.3, 0.4, 0.05, 0.05]
    tot = sum(c)
    return [(x + pr[i] * 8) / (tot + 8) for i, x in enumerate(c)]


def power_windows(power, core):
    if not power:
        return {}

    def win(series, lo, rel):
        v = [0 if i < 2 or x is None else x for i, x in enumerate(series)]
        top = max(v)
        if top < lo:
            return None
        i = v.index(top)
        cut = max(lo - 0.05, top * rel)
        a = b = i
        while a > 0 and v[a - 1] >= cut:
            a -= 1
        while b < len(v) - 1 and v[b + 1] >= cut:
            b += 1
        return (a + 1, b + 1, top) if b > a else None
    f = win(power["fight"], 1.25, 0.85)
    g = win(power["farm"], 1.07, 0.92) if core else None
    return {"lvl6": power.get("lvl6"), "fight": f and (f[0], f[1], f"{f[2]:.1f}"), "farm": g and (g[0], g[1], round((g[2] - 1) * 100))}


def item_spikes(gp, items, core):
    pub = gp.get("pub") or {}
    allr = [(r[0], r[1], r[4], r[5], "pub") for r in pub.get("build", []) if r[2] >= 0.3 and r[4] is not None and r[5] is not None]
    allr += [(k, t, f, sl, "pro") for k, t, f, sl in gp.get("timing", [])]
    seen, rows = set(), []
    for r in allr:
        if r[0] not in seen:
            seen.add(r[0])
            rows.append(r)
    gaps = sorted(r[2] - r[3] for r in rows)
    typical = gaps[len(gaps) // 2] if gaps else 0

    def ok(k):
        return not BOOTS.search(k) and ((items.get(k, {}).get("cost") or 0) >= (2000 if core else 1000) or k in ("blink", "ultimate_scepter", "aghanims_shard"))
    return sorted([r for r in rows if ok(r[0]) and r[2] - r[3] - typical >= 3], key=lambda r: -(r[2] - r[3]))[:3]


class Page:
    def __init__(self, lang, ctx):
        self.lang, self.c = lang, ctx

    def t(self, ru, en):
        return en if self.lang == "en" else ru

    def num(self, n):
        return f"{n:,}".replace(",", " " if self.lang == "ru" else ",")

    def url(self, path):  # site-relative link in this language
        return BASE + ("en/" if self.lang == "en" else "") + path

    def abs(self, path, lang=None):
        lang = lang or self.lang
        return SITE + ("en/" if lang == "en" else "") + path

    def hero_img(self, h, cls="hero-img"):
        hs = self.c["heroes"][h]
        return f'<img class="{cls}" src="{CDN}{hs["img"]}" alt="{esc(hs["localized_name"])}" loading="lazy" width="64" height="36">'

    def item(self, k):
        it = self.c["items"].get(k)
        if not it:
            return ""
        return f'<img class="item-icon" src="{CDN}{it["img"]}" alt="{esc(it.get("dname", k))}" title="{esc(it.get("dname", k))}" loading="lazy" width="44" height="32">'

    def iname(self, k):
        it = self.c["items"].get(k) or {}
        return it.get("dname", k)

    def hero_link(self, h):
        hs = self.c["heroes"][h]
        return f'<a class="hero-link" href="{self.url("hero/" + slug(hs["localized_name"]) + "/")}">{self.hero_img(h, "mini-hero")}<span>{esc(hs["localized_name"])}</span></a>'

    def shell(self, path, title, desc, body, crumbs, extra_ld=None):
        lang, other = self.lang, ("ru" if self.lang == "en" else "en")
        ld = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": self.abs(p)} for i, (n, p) in enumerate(crumbs)]}]
        if extra_ld:
            ld.append(extra_ld)
        nav = [(self.t("Игрок", "Player"), BASE + ("?lang=en" if lang == "en" else "")), (self.t("Мета", "Meta"), self.url("meta/")),
               (self.t("Герои", "Heroes"), self.url("heroes/")), (self.t("Обучение", "Learn"), BASE + ("?lang=en" if lang == "en" else "") + "#learn")]
        crumb_html = " › ".join(f'<a href="{self.url(p)}">{esc(n)}</a>' if i < len(crumbs) - 1 else f"<span>{esc(n)}</span>" for i, (n, p) in enumerate(crumbs))
        updated = datetime.fromtimestamp(self.c["updated"], timezone.utc).strftime("%d.%m.%Y")
        return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0b0e14">
<link rel="canonical" href="{self.abs(path)}">
<link rel="alternate" hreflang="ru" href="{self.abs(path, 'ru')}">
<link rel="alternate" hreflang="en" href="{self.abs(path, 'en')}">
<link rel="alternate" hreflang="x-default" href="{self.abs(path, 'ru')}">
<link rel="icon" href="{BASE}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{BASE}assets/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Dota 2 Analyzer">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{self.abs(path)}">
<meta property="og:image" content="{SITE}assets/og-image.png">
<meta property="og:locale" content="{'en_US' if lang == 'en' else 'ru_RU'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700&family=Russo+One&display=swap">
<link rel="stylesheet" href="{BASE}assets/style.css?v={self.c['v']}">
<link rel="stylesheet" href="{BASE}assets/pages.css?v={self.c['v']}">
<script type="application/ld+json">{json.dumps(ld if len(ld) > 1 else ld[0], ensure_ascii=False)}</script>
</head>
<body>
<div class="wrap">
  <header class="topbar">
    <a class="brand" href="{BASE}{'?lang=en' if lang == 'en' else ''}" aria-label="Dota 2 Analyzer">
      <span class="brand-mark"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20 6v6c0 4.6-3.3 8.4-8 9.5-4.7-1.1-8-4.9-8-9.5V6l8-3.5Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg></span>
      <span class="brand-text"><small>Dota 2</small><span>Analyzer</span></span>
    </a>
    <nav class="nav" aria-label="{self.t('Разделы', 'Sections')}">{''.join(f'<a href="{h}">{esc(n)}</a>' for n, h in nav)}</nav>
    <span class="updated">{self.t('Патч', 'Patch')} {esc(self.c['patch'])} · {self.t('данные от', 'data from')} {updated}</span>
    <a class="lang-btn" href="{self.abs(path, other)}" hreflang="{other}">{other.upper()}</a>
  </header>
  <main class="stack page">
    <nav class="crumbs" aria-label="{self.t('Навигация', 'Breadcrumbs')}">{crumb_html}</nav>
{body}
  </main>
  <footer class="page-foot">{self.t('Данные: OpenDota и Stratz, пабы Divine–Immortal и про-сцена. Обновляется каждый день.', 'Data: OpenDota and Stratz, Divine–Immortal pubs and the pro scene. Updated daily.')}</footer>
</div>
</body>
</html>
"""

    # ---------- hero guide ----------
    def hero(self, h):
        c, t = self.c, self.t
        hs = c["heroes"][h]
        name = hs["localized_name"]
        path = f"hero/{slug(name)}/"
        G, hp = c["G"], c["hero_pos"].get(str(h), {})
        weight = lambda p: (hp[p].get("pub") or {}).get("games", 0) + hp[p].get("n", 0) * 40
        plist = sorted(hp, key=lambda p: -weight(p))
        plist = [p for i, p in enumerate(plist) if i == 0 or weight(p) >= 0.08 * weight(plist[0])]
        wr, pick = G.wr(h) * 100, G.pick(h) * 100

        others = [x for x in c["heroes"] if x != h and G.idx.get(x) is not None and G.pick(x) >= 0.01]
        counters = sorted(others, key=lambda x: -G.adv(x, h))[:6]
        victims = sorted(others, key=lambda x: -G.adv(h, x))[:6]
        curve = [G.dur(h, b) for b in range(8)]
        avg = [sum(G.dur(x, b) for x in others) / max(1, len(others)) for b in range(8)]
        rel = [v - a for v, a in zip(curve, avg)]
        trend = sum(rel[5:8]) / 3 - sum(rel[0:3]) / 3
        lo, hi = (4, 8) if trend > 0.015 else (0, 4) if trend < -0.015 else (0, 8)
        peak = max(range(lo, hi), key=lambda b: rel[b])

        summary, sections = [], []
        main_pos = int(plist[0]) if plist else None
        if main_pos:
            summary.append(t(f"{name} чаще всего играют на позиции «{POS['ru'][main_pos]}».", f"{name} is played mostly as {POS['en'][main_pos]}."))
        for p in plist:
            gp, pi = hp[p], int(p)
            core = pi <= 3
            pub = gp.get("pub") or {}
            pw = power_windows(pub.get("power"), core)
            spikes = item_spikes(gp, c["items"], core)
            if p == plist[0]:
                if spikes:
                    k, tm, f, sl, _ = spikes[0]
                    summary.append(t(f"Главный предмет-пик — {self.iname(k)}: собранный до {mmss(tm)}, он даёт {f}% побед против {sl}% позже.",
                                     f"The key item spike is {self.iname(k)}: built by {mmss(tm)} it wins {f}% of games versus {sl}% later."))
                if pw.get("fight"):
                    a, b, x = pw["fight"]
                    summary.append(t(f"Окно драк — {a}–{b} минута: в {x} раза больше убийств и помощи, чем у среднего героя позиции.",
                                     f"Fight window: minutes {a}–{b}, with {x}× the kills and assists of an average hero in the role."))
                if pw.get("farm"):
                    summary.append(t(f"С {pw['farm'][0]}-й минуты фармит на {pw['farm'][2]}% быстрее среднего героя позиции.",
                                     f"From minute {pw['farm'][0]} it farms {pw['farm'][2]}% faster than an average hero in the role."))
            lis = []
            if pw.get("lvl6"):
                lis.append(t(f"<b>Ульта:</b> 6-й уровень в среднем к {pw['lvl6']}:00.", f"<b>Ultimate:</b> level 6 on average by {pw['lvl6']}:00."))
            if pw.get("fight"):
                a, b, x = pw["fight"]
                lis.append(t(f"<b>Окно драк: {a}–{b} мин.</b> Убийств и помощи в {x} раза больше, чем у среднего героя позиции. В это время ищи драки и убийства.",
                             f"<b>Fight window: {a}–{b} min.</b> {x}× the kills and assists of an average hero in the role. Look for fights and kills then."))
            if pw.get("farm"):
                lis.append(t(f"<b>Фарм-окно: с {pw['farm'][0]} мин.</b> Фармит на {pw['farm'][2]}% быстрее среднего: держи линии и лес, не трать время на пустые драки.",
                             f"<b>Farm window: from {pw['farm'][0]} min.</b> Farms {pw['farm'][2]}% faster than average: hold lanes and the jungle, skip pointless fights."))
            for k, tm, f, sl, src in spikes:
                lis.append(t(f"<b>{esc(self.iname(k))}</b> до {mmss(tm)}: {f}% побед, позже: {sl}%{' (про-сцена)' if src == 'pro' else ''}.",
                             f"<b>{esc(self.iname(k))}</b> by {mmss(tm)}: {f}% wins, later: {sl}%{' (pro scene)' if src == 'pro' else ''}."))
            blocks = []
            if lis:
                blocks.append(f'<h3>{t("Пики силы", "Power spikes")}</h3><ul class="facts">{"".join(f"<li>{x}</li>" for x in lis)}</ul>')
            if pub.get("build"):
                blocks.append(f'<h3>{t("Сборка в пабах Divine+", "Divine+ pub build")} <span class="note">{self.num(pub["games"])} {t("игр", "games")}</span></h3>'
                              f'<div class="card build-line">{"".join(f"<div class=build-step>{self.item(r[0])}<b>{mmss(r[1])}</b><span class=note>{r[3]}%</span></div>" for r in pub["build"])}</div>'
                              f'<p class="note">{t("Порядок покупки, медианное время и винрейт с предметом: ", "Purchase order, median time and win rate with the item: ")}'
                              f'{", ".join(f"{esc(self.iname(r[0]))} ({mmss(r[1])}, {r[3]}%)" for r in pub["build"])}.</p>')
            if gp.get("build"):
                blocks.append(f'<h3>{t("Сборка на про-сцене", "Pro scene build")} <span class="note">{gp["n"]} {t("игр", "games")} · {gp["wr"]}%</span></h3>'
                              f'<div class="card build-line">{"".join(f"<div class=build-step>{self.item(r[0])}<b>{mmss(r[1])}</b><span class=note>{round(r[2] * 100)}%</span></div>" for r in gp["build"])}</div>')
            tips = []
            if pub.get("start"):
                tips.append(t("Старт: ", "Starting items: ") + ", ".join(esc(self.iname(k)) + (f" ×{round(q)}" if q >= 1.5 else "") for k, q in pub["start"]) + ".")
            for k, rate, vs in gp.get("situational", []):
                tips.append(t(f"<b>{esc(self.iname(k))}</b> берут в {round(rate * 100)}% игр, чаще против: ", f"<b>{esc(self.iname(k))}</b> is bought in {round(rate * 100)}% of games, more often against: ")
                            + ", ".join(f"{esc(c['heroes'][e]['localized_name'])} (×{l})" for e, l in vs if e in c["heroes"]) + ".")
            if tips:
                blocks.append(f'<h3>{t("Подсказки по предметам", "Item tips")}</h3><ul class="facts">{"".join(f"<li>{x}</li>" for x in tips)}</ul>')
            farm = gp.get("farm") or []
            if any(farm):
                lh10, g10, g15, g20, g25 = (farm + [None] * 5)[:5]
                parts = []
                if core and lh10:
                    parts.append(t(f"{lh10} ластхитов к 10:00", f"{lh10} last hits by 10:00"))
                parts += [t(f"{self.num(v)} золота к {m}:00", f"{self.num(v)} gold by {m}:00") for v, m in ((g10, 10), (g15, 15), (g20, 20), (g25, 25)) if v]
                blocks.append(f'<h3>{t("Цели по фарму", "Farm targets")}</h3><p>{t("Медианы про-игроков на этой позиции: ", "Pro medians in this role: ")}{"; ".join(parts)}.</p>')
            if gp.get("top"):
                blocks.append(f'<h3>{t("Лучшие игроки", "Best players")}</h3><ul class="facts">'
                              + "".join(f'<li><b>{esc(x["name"])}</b>{" (" + esc(x["team"]) + ")" if x.get("team") else ""}: {x["games"]} {t("игр", "games")}, {x["wr"]}% {t("побед", "wins")}. '
                                        f'{t("Сборка", "Build")}: {", ".join(esc(self.iname(r[0])) for r in x["build"])}.</li>' for x in gp["top"]) + "</ul>")
            if gp.get("games"):
                rows = []
                for mid, pname, won, dur, enemies, b in gp["games"][:6]:
                    rows.append(f'<li><span class="chip {"pos" if won else "neg"}">{t("Победа", "Win") if won else t("Поражение", "Loss")}</span> '
                                f'<b>{esc(pname or t("Про-игрок", "Pro player"))}</b> · {mmss(dur)} · vs {" ".join(self.hero_img(e, "mini-hero") for e in enemies if e in c["heroes"])}'
                                f' <a class="note" href="{BASE}?{"lang=en&" if self.lang == "en" else ""}match={mid}" rel="nofollow">{t("разбор", "breakdown")}</a></li>')
                blocks.append(f'<h3>{t("Последние игры про", "Recent pro games")}</h3><ul class="pro-list">{"".join(rows)}</ul>')
            sections.append(f'<section class="section card pad pos-section" id="pos-{pi}"><h2 class="section-title">{POS[self.lang][pi]} · {t("позиция", "position")} {pi}</h2>{"".join(blocks)}</section>')

        if trend > 0.015:
            summary.append(t(f"Сильнее среднего героя в долгих играх, лучше всего в играх {DUR['ru'][peak]} минут.", f"Beats the average hero in long games, best at {DUR['en'][peak]} minutes."))
        elif trend < -0.015:
            summary.append(t(f"Сильнее среднего героя в коротких играх, лучше всего в играх {DUR['ru'][peak]} минут.", f"Beats the average hero in short games, best at {DUR['en'][peak]} minutes."))
        summary.append(t(f"Винрейт в пабах Divine–Immortal: {wr:.1f}%, пикрейт {pick:.1f}%.", f"Win rate in Divine–Immortal pubs: {wr:.1f}%, pick rate {pick:.1f}%."))

        pos_tags = "".join(f'<a class="chip" href="#pos-{p}">{POS[self.lang][int(p)]}</a>' for p in plist)
        cnt = lambda lst, f, cls: "".join(f'<li>{self.hero_link(x)}<span class="{cls}">{f(x):+.1f}%</span></li>' for x in lst)
        body = f"""    <div class="card pad hero-head page-hero">{self.hero_img(h, "hero-big")}<div><h1>{esc(name)}: {t('гайд, сборка и пики силы', 'guide, build and power spikes')}</h1>
      <p class="note">{t('Патч', 'Patch')} {esc(c['patch'])} · {pos_tags}</p></div>
      <a class="btn" href="{BASE}?{'lang=en&' if self.lang == 'en' else ''}hero={h}#learn">{t('Интерактивный гайд', 'Interactive guide')}</a></div>
    <p class="lead">{' '.join(summary)}</p>
{''.join(sections)}
    <section class="section"><div class="two-col">
      <div class="card pad"><h2 class="section-title">{t('Кто контрит', 'Countered by')} {esc(name)}</h2><ul class="hero-list">{cnt(counters, lambda x: G.adv(x, h), "neg")}</ul></div>
      <div class="card pad"><h2 class="section-title">{t('Кого контрит', 'Counters')} {esc(name)}</h2><ul class="hero-list">{cnt(victims, lambda x: G.adv(h, x), "pos")}</ul></div>
    </div><p class="note">{t('Преимущество в матчапе в пабах Divine–Immortal, с поправкой на общий винрейт героев.', 'Matchup advantage in Divine–Immortal pubs, adjusted for each hero’s overall win rate.')}</p></section>"""
        title = t(f"{name}: гайд, сборка, пики силы и контрпики — патч {c['patch']} | Dota 2 Analyzer",
                  f"{name} guide: build, power spikes and counters — patch {c['patch']} | Dota 2 Analyzer")
        desc = " ".join(summary)[:300]
        crumbs = [(t("Главная", "Home"), ""), (t("Герои", "Heroes"), "heroes/"), (name, path)]
        art = {"@context": "https://schema.org", "@type": "Article", "headline": title.split(" | ")[0], "inLanguage": self.lang,
               "about": {"@type": "VideoGame", "name": "Dota 2"}, "dateModified": datetime.fromtimestamp(c["updated"], timezone.utc).isoformat(),
               "author": {"@type": "Person", "name": "arseniyyx"}, "image": f"{CDN}{hs['img']}"}
        return path, self.shell(path, title, desc, body, crumbs, art)

    # ---------- hero index ----------
    def index(self):
        t, c = self.t, self.c
        groups = [("str", t("Сила", "Strength")), ("agi", t("Ловкость", "Agility")), ("int", t("Интеллект", "Intelligence")), ("all", t("Универсальные", "Universal"))]
        body = f"""    <h1>{t('Гайды по всем героям Dota 2', 'Guides for every Dota 2 hero')}</h1>
    <p class="lead">{t(f'Сборки, пики силы, контрпики, лучшие игроки и игры про для каждого героя патча {c["patch"]}. Данные пабов Divine–Immortal и про-сцены, обновляются каждый день.',
                      f'Builds, power spikes, counters, best players and pro games for every hero in patch {c["patch"]}. Divine–Immortal pubs and the pro scene, updated daily.')}</p>
""" + "".join(f"""    <section class="section"><h2 class="section-title">{label}</h2><div class="hero-index">{''.join(
            f'<a href="{self.url("hero/" + slug(hs["localized_name"]) + "/")}">{self.hero_img(h)}<span>{esc(hs["localized_name"])}</span></a>'
            for h, hs in sorted(((h, hs) for h, hs in c["heroes"].items() if hs.get("primary_attr") == a), key=lambda x: x[1]["localized_name"]))}</div></section>
""" for a, label in groups)
        title = t(f"Гайды по героям Dota 2 — сборки и контрпики, патч {c['patch']} | Dota 2 Analyzer", f"Dota 2 hero guides: builds and counters, patch {c['patch']} | Dota 2 Analyzer")
        return "heroes/", self.shell("heroes/", title, t("Гайды по всем героям Dota 2: сборки, пики силы, контрпики и игры про. Обновляется каждый день.",
                                                          "Guides for every Dota 2 hero: builds, power spikes, counters and pro games. Updated daily."),
                                     body, [(t("Главная", "Home"), ""), (t("Герои", "Heroes"), "heroes/")])

    # ---------- patch meta ----------
    def meta(self):
        t, c, G = self.t, self.c, self.c["G"]
        secs = []
        for p in range(1, 6):
            hs = [h for h in c["heroes"] if G.idx.get(h) is not None and G.pick(h) >= 0.01 and pos_prior(h, c["meta"], c["heroes"])[p - 1] >= 0.15]
            hs.sort(key=lambda h: -G.wr(h))
            rows = "".join(f'<tr><td>{i + 1}</td><td>{self.hero_link(h)}</td><td class="num">{G.wr(h) * 100:.1f}%</td><td class="num">{G.pick(h) * 100:.1f}%</td></tr>' for i, h in enumerate(hs[:12]))
            secs.append(f'<section class="section card pad"><h2 class="section-title">{POS[self.lang][p]} · {t("позиция", "position")} {p}</h2>'
                        f'<div class="table-wrap"><table><thead><tr><th>#</th><th>{t("Герой", "Hero")}</th><th>{t("Винрейт", "Win rate")}</th><th>{t("Пикрейт", "Pick rate")}</th></tr></thead><tbody>{rows}</tbody></table></div></section>')
        body = f"""    <h1>{t(f'Мета Dota 2, патч {c["patch"]}: сильнейшие герои по позициям', f'Dota 2 meta, patch {c["patch"]}: strongest heroes by position')}</h1>
    <p class="lead">{t(f'Лучшие герои для каждой позиции по винрейту в пабах Divine–Immortal за последние {c["days"]} дней. Контрпики и подбор героя под драфт — в интерактивной мете.',
                      f'The best heroes for each position by win rate in Divine–Immortal pubs over the last {c["days"]} days. Counterpicks and draft help are in the interactive meta.')}</p>
    <p><a class="btn" href="{BASE}{'?lang=en' if self.lang == 'en' else ''}#meta">{t('Интерактивная мета и контрпики', 'Interactive meta and counterpicks')}</a></p>
{''.join(secs)}"""
        title = t(f"Мета Dota 2 {c['patch']}: лучшие герои по позициям | Dota 2 Analyzer", f"Dota 2 meta {c['patch']}: best heroes by position | Dota 2 Analyzer")
        return "meta/", self.shell("meta/", title, t(f"Сильнейшие герои Dota 2 на каждой позиции в патче {c['patch']}: винрейт и пикрейт в пабах Divine–Immortal, обновляется каждый день.",
                                                     f"The strongest Dota 2 heroes in every position in patch {c['patch']}: win and pick rates in Divine–Immortal pubs, updated daily."),
                                   body, [(t("Главная", "Home"), ""), (t("Мета", "Meta"), "meta/")])


def write(rel, text):
    full = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)


def main():
    heroes = {h["id"]: h for h in get("heroStats")}
    items = get("constants/items")
    meta = load("meta.json")
    g4 = load("g4.json")
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        v = re.search(r"style\.css\?v=(\d+)", f.read()).group(1)
    ctx = {"heroes": heroes, "items": items, "meta": meta, "G": Group(g4), "hero_pos": load("heroes.json"),
           "patch": meta["patch"], "updated": meta["generated_at"], "days": g4.get("days", 5), "v": v}
    urls = ["", "heroes/", "meta/"]
    for lang in ("ru", "en"):
        pg = Page(lang, ctx)
        prefix = "en/" if lang == "en" else ""
        for path, text in [pg.index(), pg.meta()] + [pg.hero(h) for h in heroes]:
            write(prefix + path + "index.html", text)
            if lang == "ru" and path not in urls:
                urls.append(path)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def entry(path):
        ru, en = SITE + path, SITE + ("en/" + path if path else "?lang=en")
        alts = f'<xhtml:link rel="alternate" hreflang="ru" href="{ru}"/><xhtml:link rel="alternate" hreflang="en" href="{en}"/><xhtml:link rel="alternate" hreflang="x-default" href="{ru}"/>'
        return "".join(f"  <url><loc>{u}</loc>{alts}<lastmod>{today}</lastmod><changefreq>daily</changefreq></url>\n" for u in (ru, en))
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
                + "".join(entry(p) for p in urls) + "</urlset>\n")
    print(f"pages: {len(urls) - 1} per language, sitemap: {len(urls) * 2} urls")


if __name__ == "__main__":
    main()

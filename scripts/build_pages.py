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
POS_SLUG = ["", "carry", "mid", "offlane", "soft-support", "hard-support"]
# what people search for: "лучшие керри", "лучшие саппорты 5 позиции"
POS_WHO = {"ru": ["", "керри", "мидеры", "оффлейнеры", "саппорты 4 позиции", "саппорты 5 позиции"],
           "en": ["", "carry heroes", "mid heroes", "offlaners", "position 4 supports", "position 5 supports"]}
DUR = {"ru": ["до 20", "20–25", "25–30", "30–35", "35–40", "40–45", "45–50", "50+"], "en": ["<20", "20–25", "25–30", "30–35", "35–40", "40–45", "45–50", "50+"]}
BOOTS = re.compile(r"boots|treads|greaves|bearing")
esc = html.escape


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def short(text, limit=158):
    """Meta description that fits in search results: cut at a word boundary."""
    if len(text) <= limit:
        return text
    return text[:limit - 1].rsplit(" ", 1)[0].rstrip(",.:;—") + "…"


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
               (self.t("Герои", "Heroes"), self.url("heroes/")), (self.t("Моды", "Mods"), self.url("mods/"))]
        # every static page links to every landing page, so crawlers reach all of them from any hero guide
        foot = [(self.t(f"Лучшие {POS_WHO['ru'][p]}", f"Best {POS_WHO['en'][p]}"), self.url(f"meta/{POS_SLUG[p]}/")) for p in range(1, 6)]
        foot += [(self.t("Моды Dota 2", "Dota 2 mods"), self.url("mods/")), (self.t("Кастомизация героев", "Hero customisation"), self.url("paint/")),
                 (self.t("Кто нажал глиф", "Who pressed the glyph"), self.url("glyph/")), (self.t("Все герои", "All heroes"), self.url("heroes/"))]
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
  <nav class="foot-links" aria-label="{self.t('Разделы сайта', 'Site sections')}">{''.join(f'<a href="{h}">{esc(n)}</a>' for n, h in foot)}</nav>
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
            all_pos = t(f"Все лучшие {POS_WHO['ru'][pi]} патча", f"All the best {POS_WHO['en'][pi]} of the patch")
            blocks.append(f'<p><a href="{self.url("meta/" + POS_SLUG[pi] + "/")}">{all_pos} →</a></p>')
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
        title = t(f"{name}: сборка, контрпики и гайд, патч {c['patch']} | Dota 2 Analyzer", f"{name} build, counters and guide, patch {c['patch']} | Dota 2 Analyzer")
        desc = short(" ".join(summary))
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
        title = t(f"Гайды по героям Dota 2, патч {c['patch']} | Dota 2 Analyzer", f"Dota 2 hero guides, patch {c['patch']} | Dota 2 Analyzer")
        return "heroes/", self.shell("heroes/", title, t("Гайды по всем героям Dota 2: сборки, пики силы, контрпики и игры про. Обновляется каждый день.",
                                                          "Guides for every Dota 2 hero: builds, power spikes, counters and pro games. Updated daily."),
                                     body, [(t("Главная", "Home"), ""), (t("Герои", "Heroes"), "heroes/")])

    # ---------- patch meta ----------
    def pos_heroes(self, p):
        """Heroes really played in position p, best win rate first."""
        c, G = self.c, self.c["G"]
        hs = [h for h in c["heroes"] if G.idx.get(h) is not None and G.pick(h) >= 0.01 and pos_prior(h, c["meta"], c["heroes"])[p - 1] >= 0.15]
        return sorted(hs, key=lambda h: -G.wr(h))

    def meta(self):
        t, c, G = self.t, self.c, self.c["G"]
        secs, best = [], []
        for p in range(1, 6):
            hs = self.pos_heroes(p)
            top = next((h for h in hs if h not in {b[0] for b in best}), None)  # a different hero for every position
            if top is not None:
                best.append((top, f"{POS[self.lang][p].lower()} {c['heroes'][top]['localized_name']} {G.wr(top) * 100:.0f}%"))
            rows = "".join(f'<tr><td>{i + 1}</td><td>{self.hero_link(h)}</td><td class="num">{G.wr(h) * 100:.1f}%</td><td class="num">{G.pick(h) * 100:.1f}%</td></tr>' for i, h in enumerate(hs[:12]))
            more = t(f"Все {POS_WHO['ru'][p]}", f"All {POS_WHO['en'][p]}")
            secs.append(f'<section class="section card pad"><h2 class="section-title"><a href="{self.url("meta/" + POS_SLUG[p] + "/")}">{POS[self.lang][p]} · {t("позиция", "position")} {p}</a></h2>'
                        f'<div class="table-wrap"><table><thead><tr><th>#</th><th>{t("Герой", "Hero")}</th><th>{t("Винрейт", "Win rate")}</th><th>{t("Пикрейт", "Pick rate")}</th></tr></thead><tbody>{rows}</tbody></table></div>'
                        f'<p><a href="{self.url("meta/" + POS_SLUG[p] + "/")}">{more} ({len(hs)}) →</a></p></section>')
        body = f"""    <h1>{t(f'Мета Dota 2, патч {c["patch"]}: сильнейшие герои по позициям', f'Dota 2 meta, patch {c["patch"]}: strongest heroes by position')}</h1>
    <p class="lead">{t(f'Лучшие герои для каждой позиции по винрейту в пабах Divine–Immortal за последние {c["days"]} дней. Контрпики и подбор героя под драфт — в интерактивной мете.',
                      f'The best heroes for each position by win rate in Divine–Immortal pubs over the last {c["days"]} days. Counterpicks and draft help are in the interactive meta.')}</p>
    <p><a class="btn" href="{BASE}{'?lang=en' if self.lang == 'en' else ''}#meta">{t('Интерактивная мета и контрпики', 'Interactive meta and counterpicks')}</a></p>
{''.join(secs)}"""
        title = t(f"Мета Dota 2 {c['patch']}: тир-лист героев по позициям | Dota 2 Analyzer", f"Dota 2 meta {c['patch']}: hero tier list by position | Dota 2 Analyzer")
        # today's leaders right in the snippet: a concrete answer gets more clicks than a general promise
        lead = ", ".join(b[1] for b in best)
        desc = t(f"Тир-лист {c['patch']} на сегодня: {lead}. Пабы Divine–Immortal, обновляется каждый день.",
                 f"Tier list for {c['patch']} today: {lead}. Divine–Immortal pubs, updated daily.")
        return "meta/", self.shell("meta/", title, desc, body, [(t("Главная", "Home"), ""), (t("Мета", "Meta"), "meta/")])

    # ---------- best heroes of one position ----------
    def meta_pos(self, p):
        t, c, G = self.t, self.c, self.c["G"]
        path, hs = f"meta/{POS_SLUG[p]}/", self.pos_heroes(p)
        others = [x for x in c["heroes"] if G.idx.get(x) is not None and G.pick(x) >= 0.01]
        rows = []
        for i, h in enumerate(hs):
            gp = c["hero_pos"].get(str(h), {}).get(str(p)) or {}
            build = [r[0] for r in ((gp.get("pub") or {}).get("build") or gp.get("build") or [])][:4]
            foe = max(others, key=lambda x: G.adv(x, h) if x != h else -99)
            rows.append(f'<tr><td>{i + 1}</td><td>{self.hero_link(h)}</td><td class="num">{G.wr(h) * 100:.1f}%</td><td class="num">{G.pick(h) * 100:.1f}%</td>'
                        f'<td class="build-mini">{"".join(self.item(k) for k in build)}</td><td>{self.hero_link(foe)}</td></tr>')
        top3 = ", ".join(f"{c['heroes'][h]['localized_name']} ({G.wr(h) * 100:.1f}%)" for h in hs[:3])
        who = POS_WHO[self.lang][p]
        others_pos = " · ".join(f'<a href="{self.url("meta/" + POS_SLUG[q] + "/")}">{POS[self.lang][q]}</a>' for q in range(1, 6) if q != p)
        body = f"""    <h1>{t(f'Лучшие {who} Dota 2, патч {c["patch"]}', f'Best {who} in Dota 2, patch {c["patch"]}')}</h1>
    <p class="lead">{t(f'Сильнейшие {who} патча {c["patch"]} по винрейту в пабах Divine–Immortal за последние {c["days"]} дней: {top3}. Всего {len(hs)} героев, которых реально играют на позиции {p}. '
                      f'Для каждого героя — сборка, с которой его играют, и герой, против которого ему тяжелее всего.',
                      f'The strongest {who} of patch {c["patch"]} by win rate in Divine–Immortal pubs over the last {c["days"]} days: {top3}. {len(hs)} heroes that are really played in position {p}. '
                      f'For each hero: the build it is played with and the hero it struggles against most.')}</p>
    <p><a class="btn" href="{BASE}{'?lang=en' if self.lang == 'en' else ''}#meta">{t('Подобрать героя под драфт', 'Pick a hero for your draft')}</a></p>
    <section class="section card pad"><div class="table-wrap"><table><thead><tr><th>#</th><th>{t("Герой", "Hero")}</th><th>{t("Винрейт", "Win rate")}</th><th>{t("Пикрейт", "Pick rate")}</th><th>{t("Сборка", "Build")}</th><th>{t("Тяжело против", "Struggles vs")}</th></tr></thead>
      <tbody>{''.join(rows)}</tbody></table></div>
      <p class="note">{t('Винрейт сглажен по количеству игр, чтобы редкие герои не попадали наверх случайно. «Тяжело против» — самый неудобный матчап с поправкой на общий винрейт героев.',
                         'Win rates are smoothed by game count so rare heroes do not top the list by luck. “Struggles vs” is the worst matchup, adjusted for each hero’s overall win rate.')}</p></section>
    <p class="note">{t('Другие позиции', 'Other positions')}: {others_pos} · <a href="{self.url('meta/')}">{t('вся мета', 'full meta')}</a></p>"""
        titles = {"ru": ["", f"Лучшие керри Dota 2 {c['patch']}: топ героев на 1 позицию", f"Лучшие герои на мид Dota 2 {c['patch']}: топ мидеров",
                         f"Лучшие оффлейнеры Dota 2 {c['patch']}: топ героев на 3 позицию", f"Лучшие саппорты 4 позиции Dota 2 {c['patch']}: топ героев",
                         f"Лучшие саппорты 5 позиции Dota 2 {c['patch']}: топ героев"],
                  "en": ["", f"Best Dota 2 carry heroes {c['patch']}: position 1 tier list", f"Best Dota 2 mid heroes {c['patch']}: position 2 tier list",
                         f"Best Dota 2 offlaners {c['patch']}: position 3 tier list", f"Best Dota 2 position 4 supports {c['patch']}: tier list",
                         f"Best Dota 2 position 5 supports {c['patch']}: tier list"]}
        title = titles[self.lang][p] + " | Dota 2 Analyzer"
        desc = short(t(f"Топ {who} на сегодня: {top3}. Винрейт, пикрейт, сборки и контрпики, пабы Divine–Immortal, обновляется каждый день.",
                       f"Top {who} today: {top3}. Win rate, pick rate, builds and counters from Divine–Immortal pubs, updated daily."))
        lst = {"@context": "https://schema.org", "@type": "ItemList", "name": titles[self.lang][p], "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": self.abs("hero/" + slug(c["heroes"][h]["localized_name"]) + "/"), "name": c["heroes"][h]["localized_name"]} for i, h in enumerate(hs[:20])]}
        crumbs = [(t("Главная", "Home"), ""), (t("Мета", "Meta"), "meta/"), (POS[self.lang][p], path)]
        return path, self.shell(path, title, desc, body, crumbs, lst)

    # ---------- D2A Mods ----------
    def mods(self):
        t, lang, cat = self.t, self.lang, self.c["mods"]
        app = cat["app"]
        label = {"fps": "FPS", "sound": t("Звук", "Sound"), "visual": t("Вид", "Visual")}
        secs = []
        for tab in cat["tabs"]:
            items = []
            for m in [m for m in cat["mods"] if m.get("tab", "optimize") == tab["id"] and not m.get("hidden")]:
                fig = (f'<img src="{BASE}{esc(m["image"])}" alt="{esc(m["name"][lang])}: {t("было и стало", "before and after")}" loading="lazy" width="1016" height="252">'
                       if m.get("image") else "")
                items.append(f'<li><h3>{esc(m.get("icon", ""))} {esc(m["name"][lang])} <span class="chip">{label.get(m.get("category"), "")}</span></h3><p>{esc(m["desc"][lang])}</p>{fig}</li>')
            secs.append(f'<section class="section card pad"><h2 class="section-title">{esc(tab["name"][lang])}</h2><ul class="mod-list">{"".join(items)}</ul></section>')
        n = sum(1 for m in cat["mods"] if not m.get("hidden"))
        body = f"""    <h1>{t('Моды для Dota 2: D2A Mods', 'Dota 2 mods: D2A Mods')}</h1>
    <p class="lead">{t(f'Бесплатная программа для Windows: {n} своих модов и больше 200 модов сообщества. Больше FPS без погоды и лишних эффектов, без травы и кустов, тёмный ландшафт, контрастное ХП крипов, шрифты, курсоры, фоны меню и перекраска героев. Отмечаешь моды, нажимаешь «Установить» — программа сама находит Dota.',
                      f'A free Windows app with {n} of our own mods and over 200 community mods. More FPS without weather and extra effects, no grass and bushes, dark terrain, high-contrast creep HP, fonts, cursors, menu backgrounds and hero recolours. Tick the mods, press Install, the app finds Dota by itself.')}</p>
    <p><a class="btn" href="{esc(app['download'])}" rel="noopener">{t('Скачать D2A Mods', 'Download D2A Mods')} {esc(app['version'])}</a></p>
    <p class="note">{t('Только визуальные и звуковые моды без преимущества в игре и без вмешательства в процесс Dota. Файлы игры не меняются: моды ставятся отдельными файлами и удаляются одной кнопкой. Valve официально моды не поддерживает.',
                       'Visual and sound mods only, with no in-game advantage and no hooking into the Dota process. Game files stay untouched: mods go in as separate files and are removed with one button. Valve does not officially support mods.')}</p>
{''.join(secs)}
    <section class="section card pad"><h2 class="section-title">{t('Как поставить моды', 'How to install the mods')}</h2><ol class="facts">
      <li>{t('Скачай D2AMods.exe и закрой Dota 2.', 'Download D2AMods.exe and close Dota 2.')}</li>
      <li>{t('Запусти программу. Если Windows предупредит о неизвестном издателе: «Подробнее» → «Выполнить в любом случае».', 'Run it. If Windows warns about an unknown publisher: More info → Run anyway.')}</li>
      <li>{t('Отметь моды и нажми «Установить».', 'Tick the mods and press Install.')}</li>
      <li>{t('После обновления Dota, если моды пропали, нажми «Установить» ещё раз. Вернуть всё как было: «Удалить все моды».', 'If a Dota update turns the mods off, press Install again. To undo everything: Remove all mods.')}</li></ol></section>
    <p class="note">{t('Моды сообщества:', 'Community mods:')} <a href="https://github.com/h6rd/Dota2PornFxWeb" rel="noopener">Dota2PornFx</a>, <a href="https://github.com/Egezenn/dota2-minify" rel="noopener">Minify</a>. <a href="{self.url('paint/')}">{t('Кастомизация героев', 'Hero customisation')}</a> · <a href="{BASE}{'?lang=en' if lang == 'en' else ''}#mods">{t('Моды на сайте', 'Mods in the app')}</a></p>"""
        title = t("Моды для Dota 2: больше FPS, без травы, тёмный ландшафт, шрифты | D2A Mods", "Dota 2 mods: more FPS, no grass, dark terrain, fonts | D2A Mods")
        desc = short(t(f"Бесплатные моды для Dota 2 в одной программе: больше FPS, без погоды и травы, тёмный ландшафт, контрастное ХП крипов, шрифты и перекраска героев. Установка в один клик.",
                       f"Free Dota 2 mods in one app: more FPS, no weather and grass, dark terrain, high-contrast creep HP, fonts and hero recolours. One-click install."))
        soft = {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "D2A Mods", "operatingSystem": "Windows", "applicationCategory": "GameApplication",
                "softwareVersion": app["version"], "downloadUrl": app["download"], "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "inLanguage": ["ru", "en"]}
        return "mods/", self.shell("mods/", title, desc, body, [(t("Главная", "Home"), ""), (t("Моды", "Mods"), "mods/")], soft)

    # ---------- hero customisation ----------
    def paint(self):
        t, c = self.t, self.c
        by_npc = {hs.get("name"): (h, hs) for h, hs in c["heroes"].items()}
        cards = []
        for x in sorted(c["paint"], key=lambda x: x["name"]):
            h, hs = by_npc.get(x["npc"], (None, None))
            img = self.hero_img(h) if h else ""
            cards.append(f'<a href="{BASE}{"?lang=en" if self.lang == "en" else ""}#paint-{x["npc"].replace("npc_dota_hero_", "")}">{img}<span>{esc(x["name"])}</span></a>')
        body = f"""    <h1>{t('Кастомизация героев Dota 2: перекраска в 3D', 'Dota 2 hero customisation: recolour in 3D')}</h1>
    <p class="lead">{t(f'Перекрась любого из {len(c["paint"])} героев в любой цвет: открой 3D-модель, крути её мышкой, кликни по части тела или оружию и выбери цвет на RGB-круге. Можно красить отдельные части или всего героя сразу, а также иконки способностей. В игру цвета ставит программа D2A Mods, и видишь их только ты.',
                      f'Recolour any of the {len(c["paint"])} heroes in any colour: open the 3D model, turn it with the mouse, click a body part or weapon and pick a colour on the RGB wheel. Colour single parts or the whole hero at once, plus the ability icons. The D2A Mods app puts the colours into the game, and only you see them.')}</p>
    <p><a class="btn" href="{BASE}{'?lang=en' if self.lang == 'en' else ''}#paint">{t('Открыть 3D-редактор', 'Open the 3D editor')}</a></p>
    <section class="section card pad"><h2 class="section-title">{t('Как это работает', 'How it works')}</h2><ol class="facts">
      <li>{t('Выбери героя ниже и раскрась его в редакторе.', 'Pick a hero below and colour it in the editor.')}</li>
      <li>{t('Скопируй код цветов или открой редактор прямо из программы', 'Copy the colour code, or open the editor straight from the')} <a href="{self.url('mods/')}">D2A Mods</a>.</li>
      <li>{t('Нажми «Установить» в программе: она перекрасит текстуры героя из файлов самой игры.', 'Press Install in the app: it recolours the hero’s textures from the game’s own files.')}</li>
      <li>{t('Перекрашиваются стандартные модели героев. Платная косметика Valve не подключается и не открывается.', 'Default hero models are recoloured. Paid Valve cosmetics are neither included nor unlocked.')}</li></ol></section>
    <section class="section"><h2 class="section-title">{t('Герои', 'Heroes')}</h2><div class="hero-index">{''.join(cards)}</div></section>"""
        title = t("Кастомизация героев Dota 2: перекраска моделей в любой цвет | Dota 2 Analyzer", "Dota 2 hero customisation: recolour models in any colour | Dota 2 Analyzer")
        desc = t(f"Перекрась героев Dota 2 в 3D-редакторе: части тела, оружие, весь герой и иконки способностей. {len(c['paint'])} героев, цвета ставятся в игру одной кнопкой.",
                 f"Recolour Dota 2 heroes in a 3D editor: body parts, weapons, the whole hero and ability icons. {len(c['paint'])} heroes, colours go into the game with one button.")
        return "paint/", self.shell("paint/", title, desc, body, [(t("Главная", "Home"), ""), (t("Кастомизация героев", "Hero customisation"), "paint/")])

    # ---------- who pressed the glyph ----------
    def glyph(self):
        t = self.t
        app = f"{BASE}{'?lang=en' if self.lang == 'en' else ''}"
        body = f"""    <h1>{t('Кто нажал глиф в Dota 2', 'Who pressed the glyph in Dota 2')}</h1>
    <p class="lead">{t('Вставь номер матча или ссылку на него с Dotabuff, OpenDota или Stratz: покажем, кто из игроков нажимал глиф укреплений, сколько раз и на какой минуте. Удобно, когда глиф сожгли впустую и в чате начинаются споры.',
                      'Paste a match ID or a Dotabuff, OpenDota or Stratz link: you will see which players pressed the glyph of fortification, how many times and at what minute. Handy when the glyph was wasted and the chat starts arguing.')}</p>
    <form class="search-row card pad" onsubmit="var m=(this.q.value.match(/\\d{{6,}}/)||[])[0];if(m)location.href='{app}#glyph-'+m;return false">
      <input type="text" name="q" placeholder="{t('Например 9057311648', 'For example 9057311648')}" aria-label="{t('Номер матча или ссылка', 'Match ID or link')}" autocomplete="off">
      <button class="btn" type="submit">{t('Проверить', 'Check')}</button></form>
    <section class="section card pad"><h2 class="section-title">{t('Как это работает', 'How it works')}</h2><ul class="facts">
      <li>{t('Нажатия глифа берутся из разобранной записи матча на OpenDota. Если матч ещё не разобран, сайт сам отправит его на разбор и подождёт.', 'Glyph presses come from the parsed match replay on OpenDota. If the match is not parsed yet, the site requests parsing and waits.')}</li>
      <li>{t('Номер матча есть в клиенте Dota во вкладке матча, а также на Dotabuff, OpenDota и Stratz.', 'The match ID is in the Dota client on the match page, and on Dotabuff, OpenDota and Stratz.')}</li>
      <li>{t('Разбор матча целиком — карта, варды, драки и ход игры — в', 'The full match breakdown (map, wards, fights and game flow) is in the')} <a href="{app}">{t('разборе игрока', 'player analysis')}</a>.</li></ul></section>"""
        title = t("Кто нажал глиф в Dota 2: проверка по номеру матча | Dota 2 Analyzer", "Who pressed the glyph in Dota 2: check by match ID | Dota 2 Analyzer")
        desc = t("Узнай, кто нажал глиф в матче Dota 2: вставь номер матча или ссылку Dotabuff, OpenDota, Stratz. Все нажатия игроков по минутам.",
                 "Find out who pressed the glyph in a Dota 2 match: paste a match ID or a Dotabuff, OpenDota or Stratz link. Every player's presses by minute.")
        return "glyph/", self.shell("glyph/", title, desc, body, [(t("Главная", "Home"), ""), (t("Кто нажал глиф", "Who pressed the glyph"), "glyph/")])


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
           "patch": meta["patch"], "updated": meta["generated_at"], "days": g4.get("days", 5), "v": v,
           "mods": load("../mods/catalog.json"), "paint": load("../paint/index.json")}
    urls = ["", "heroes/", "meta/"]
    for lang in ("ru", "en"):
        pg = Page(lang, ctx)
        prefix = "en/" if lang == "en" else ""
        pages = [pg.index(), pg.meta()] + [pg.meta_pos(p) for p in range(1, 6)] + [pg.mods(), pg.paint(), pg.glyph()]
        for path, text in pages + [pg.hero(h) for h in heroes]:
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
    # the same pages as plain text, a second sitemap Search Console accepts
    with open(os.path.join(ROOT, "sitemap.txt"), "w", encoding="utf-8") as f:
        f.write("".join(f"{SITE + p}\n{SITE + ('en/' + p if p else '?lang=en')}\n" for p in urls))
    print(f"pages: {len(urls) - 1} per language, sitemap: {len(urls) * 2} urls")


if __name__ == "__main__":
    main()

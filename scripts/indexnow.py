"""Tells Yandex and Bing (IndexNow) about every page in sitemap.txt. Google does not take IndexNow; it reads the sitemap.
The key file lives next to the pages, so it covers everything under /dota2-analyzer/."""
import glob
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://arseniyyx.github.io/dota2-analyzer/"


def main():
    key = next(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(ROOT, "*.txt")) if len(os.path.basename(p)) == 36)
    urls = [u.strip() for u in open(os.path.join(ROOT, "sitemap.txt"), encoding="utf-8") if u.strip()]
    body = json.dumps({"host": "arseniyyx.github.io", "key": key, "keyLocation": f"{SITE}{key}.txt", "urlList": urls}).encode()
    for endpoint in ("https://yandex.com/indexnow", "https://www.bing.com/indexnow"):
        req = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print(endpoint, r.status, len(urls), "urls")
        except urllib.error.HTTPError as e:
            print(endpoint, e.code, e.read()[:200])
        except OSError as e:
            print(endpoint, "failed:", e)


if __name__ == "__main__":
    main()

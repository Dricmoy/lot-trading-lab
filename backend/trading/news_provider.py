"""Authenticated headline adapter; caller controls whether content may be exposed."""
import json
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


def fetch_headlines(symbol, key, secret):
    query = urlencode({"symbols": symbol, "limit": 5, "sort": "desc", "include_content": "false"})
    request = Request("https://data.alpaca.markets/v1beta1/news?" + query,
                      headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret})
    with urlopen(request, timeout=7) as result:
        data = json.load(result)
    if not isinstance(data, dict) or not isinstance(data.get("news", []), list):
        raise ValueError("Invalid news response")
    articles = []
    for article in data.get("news", [])[:5]:
        if not isinstance(article, dict):
            continue
        url = article.get("url", "")
        if not isinstance(url, str) or urlparse(url).scheme not in ("http", "https"):
            continue
        articles.append({"id": str(article.get("id", "")), "headline": str(article.get("headline", ""))[:500],
                         "source": str(article.get("source", "Alpaca news"))[:80], "published_at": article.get("created_at"), "url": url})
    return articles

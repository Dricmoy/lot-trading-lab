"""Owner-only attributed headlines. Provider content is never redistributed publicly."""
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .market import is_owner
from .services import SYMBOLS
from .views import resolve_account


@require_GET
def news(request):
    account = resolve_account(request)
    response_data, status = {"articles": [], "available": False}, 200
    if account and is_owner(account):
        symbol = request.GET.get("symbol", "NVDA")
        if symbol not in SYMBOLS:
            return JsonResponse({"error": "Unknown symbol."}, status=400)
        key, secret = os.getenv("ALPACA_API_KEY_ID"), os.getenv("ALPACA_API_SECRET_KEY")
        if not key or not secret:
            response_data, status = {"error": "News is unavailable. Your practice account is unchanged."}, 503
        else:
            query = urlencode({"symbols": symbol, "limit": 5, "sort": "desc", "include_content": "false"})
            upstream = Request("https://data.alpaca.markets/v1beta1/news?" + query,
                               headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret})
            try:
                with urlopen(upstream, timeout=7) as result:
                    data = json.load(result)
                if not isinstance(data, dict) or not isinstance(data.get("news", []), list):
                    raise ValueError("Invalid news response")
                articles = []
                for article in data.get("news", [])[:5]:
                    if not isinstance(article, dict):
                        continue
                    url = article.get("url", "")
                    if not isinstance(url, str):
                        continue
                    if urlparse(url).scheme not in ("http", "https"):
                        continue
                    articles.append({"id": str(article.get("id", "")), "headline": str(article.get("headline", ""))[:500],
                                     "source": str(article.get("source", "Alpaca news"))[:80], "published_at": article.get("created_at"), "url": url})
                response_data = {"articles": articles, "available": True, "source": "Alpaca news", "symbol": symbol}
            except (HTTPError, URLError, TimeoutError, ValueError, TypeError):
                response_data, status = {"error": "The news feed is unavailable. Please try again later."}, 503
    response = JsonResponse(response_data, status=status)
    response["Cache-Control"] = "private, no-store"
    return response

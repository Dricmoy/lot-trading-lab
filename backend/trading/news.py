"""Owner-only attributed headlines. Provider content is never redistributed publicly."""
import os
from urllib.error import HTTPError, URLError
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .market import is_owner
from .services import SYMBOLS
from .views import resolve_account
from .news_provider import fetch_headlines


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
            try:
                articles = fetch_headlines(symbol, key, secret)
                response_data = {"articles": articles, "available": True, "source": "Alpaca news", "symbol": symbol}
            except (HTTPError, URLError, TimeoutError, ValueError, TypeError):
                response_data, status = {"error": "The news feed is unavailable. Please try again later."}, 503
    response = JsonResponse(response_data, status=status)
    response["Cache-Control"] = "private, no-store"
    return response

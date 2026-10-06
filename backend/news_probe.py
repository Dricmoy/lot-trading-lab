"""Read-only deploy check. Print only availability/count, never keys or content."""
import json
import os
from .trading.news_provider import fetch_headlines

key, secret = os.getenv("ALPACA_API_KEY_ID"), os.getenv("ALPACA_API_SECRET_KEY")
result = {"check": "private_news", "configured": bool(key and secret), "available": False}
if key and secret:
    try:
        result.update(available=True, articles_returned=len(fetch_headlines("NVDA", key, secret)))
    except Exception as error:
        result["error_type"] = type(error).__name__
        if hasattr(error, "code"):
            result["provider_status"] = error.code
# Optional provider downtime must not prevent release of independent replay features.
print(json.dumps(result))

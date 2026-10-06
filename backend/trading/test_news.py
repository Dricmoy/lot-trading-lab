import json
import os
from urllib.error import URLError
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from .news_provider import fetch_headlines
from .models import Account


class NewsProviderTests(SimpleTestCase):
    @patch("backend.trading.news_provider.urlopen")
    def test_headlines_are_attributed_and_article_bodies_are_excluded(self, upstream):
        upstream.return_value.__enter__.return_value.read.return_value = json.dumps({"news": [
            {"id": 1, "headline": "Example headline", "source": "Example publisher", "created_at": "2026-10-06T00:00:00Z", "url": "https://example.test/article", "content": "body must not leave adapter"},
            {"id": 2, "headline": "Invalid link", "url": "javascript:alert(1)"},
        ]}).encode()
        articles = fetch_headlines("NVDA", "disposable-key", "disposable-secret")
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["source"], "Example publisher")
        self.assertNotIn("content", articles[0])
        request = upstream.call_args.args[0]
        self.assertIn("include_content=false", request.full_url)
        self.assertEqual(request.get_header("Apca-api-key-id"), "disposable-key")
        self.assertEqual(request.get_header("Apca-api-secret-key"), "disposable-secret")

    @patch("backend.trading.news_provider.urlopen")
    def test_invalid_provider_shape_is_rejected(self, upstream):
        upstream.return_value.__enter__.return_value.read.return_value = b'[]'
        with self.assertRaises(ValueError):
            fetch_headlines("NVDA", "key", "secret")


class OwnerNewsTests(TestCase):
    @patch("backend.trading.news.fetch_headlines", return_value=[{"id": "1", "headline": "Example", "source": "Publisher", "published_at": "2026-10-06T00:00:00Z", "url": "https://example.test/article"}])
    def test_only_owner_receives_provider_news_and_failure_does_not_trade(self, provider):
        token = "disposable-owner-token-longer-than-thirty-two-characters"
        with self.settings(LOT_OWNER_ACCESS_TOKEN=token), patch.dict(os.environ, {"ALPACA_API_KEY_ID": "key", "ALPACA_API_SECRET_KEY": "secret"}):
            self.client.get("/api/account")
            self.assertFalse(self.client.get("/api/news").json()["available"])
            provider.assert_not_called()
            account = self.client.post("/api/connect", {"token": token}, content_type="application/json").json()
            response = self.client.get("/api/news?symbol=NVDA")
            self.assertTrue(response.json()["available"])
            provider.assert_called_once_with("NVDA", "key", "secret")
            self.assertNotIn("secret", response.content.decode())
            provider.side_effect = URLError("unavailable")
            self.assertEqual(self.client.get("/api/news?symbol=NVDA").status_code, 503)
            self.assertEqual(Account.objects.get(id=account["id"]).cash, account["cash"])
            self.assertEqual(Account.objects.get(id=account["id"]).orders.count(), 0)

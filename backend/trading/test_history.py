import uuid
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from .history import record_snapshot, portfolio_history
from .models import Account, Position


class HistoryTests(TestCase):
    def test_observed_history_benchmark_and_epoch(self):
        account = Account.objects.create(cash=10000, cash_anchor=10000)
        Position.objects.create(account=account, symbol="HOOD", quantity=2, cost=20000)
        first = timezone.now().replace(second=0, microsecond=0) - timedelta(minutes=2)
        with patch("backend.trading.history.timezone.now", return_value=first):
            record_snapshot(account.id, {"assets": [{"symbol": "HOOD", "price": 10000}]})
            record_snapshot(account.id, {"assets": [{"symbol": "HOOD", "price": 10000}]})
        self.assertEqual(account.snapshots.count(), 1)
        with patch("backend.trading.history.timezone.now", return_value=first+timedelta(minutes=1)):
            record_snapshot(account.id, {"assets": [{"symbol": "HOOD", "price": 9000}]})
        history = portfolio_history(account)
        self.assertEqual(history["points"][-1]["benchmark"], 28000)
        self.assertAlmostEqual(history["return"], -2000/30000*100)
        self.assertAlmostEqual(history["drawdown"], 2000/30000*100)
        account.history_epoch = uuid.uuid4()
        account.save()
        self.assertEqual(portfolio_history(account)["points"], [])

    def test_missing_held_quote_does_not_create_fabricated_valuation(self):
        account = Account.objects.create()
        Position.objects.create(account=account, symbol="HOOD", quantity=2, cost=20000)
        record_snapshot(account.id, {"assets": [{"symbol": "NVDA", "price": 10000}]})
        self.assertEqual(account.snapshots.count(), 0)

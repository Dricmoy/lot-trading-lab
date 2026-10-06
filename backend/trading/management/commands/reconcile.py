from django.core.management.base import BaseCommand, CommandError
from backend.trading.reconciliation import reconcile


class Command(BaseCommand):
    help = "Read-only cash/fill/reservation/replay reconciliation; output aggregate counts only."

    def handle(self, *args, **options):
        counts, problems = reconcile()
        if problems:
            raise CommandError(f"Reconciliation failed: {len(problems)} discrepancies across {sorted(set(problems))}.")
        self.stdout.write(self.style.SUCCESS(f"PASS: {counts['accounts']} accounts, {counts['orders']} orders, {counts['replays']} replays reconciled."))

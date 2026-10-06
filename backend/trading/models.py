import uuid
from django.db import models
from django.conf import settings


class Account(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cash = models.BigIntegerField(default=10000000)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="trading_account")
    watchlist = models.JSONField(default=list)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(cash__gte=0), name="nonnegative_cash")]


class Position(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="positions")
    symbol = models.CharField(max_length=8)
    quantity = models.PositiveIntegerField(default=0)
    cost = models.BigIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["account", "symbol"], name="one_position_per_symbol")]


class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="orders")
    key = models.UUIDField()
    fingerprint = models.CharField(max_length=64)
    symbol = models.CharField(max_length=8)
    side = models.CharField(max_length=4)
    kind = models.CharField(max_length=6)
    requested = models.PositiveIntegerField()
    executed = models.PositiveIntegerField()
    total = models.BigIntegerField()
    status = models.CharField(max_length=12)
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["account", "key"], name="idempotent_order")]
        ordering = ["-created_at"]


class LedgerEntry(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    order = models.OneToOneField(Order, on_delete=models.CASCADE)
    cash_delta = models.BigIntegerField()
    cash_after = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class AuthThrottle(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    attempts = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField()

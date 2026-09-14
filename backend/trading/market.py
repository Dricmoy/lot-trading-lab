"""Owner-only market-data access. Anonymous visitors retain synthetic data."""
import hashlib
import uuid

from django.conf import settings


def owner_id():
    token = settings.LOT_OWNER_ACCESS_TOKEN
    return uuid.uuid5(uuid.NAMESPACE_URL, "lot-owner:" + token) if len(token) >= 32 else None


def is_owner(account):
    return bool(account and owner_id() and account.id == owner_id())


def market_headers(account):
    if not is_owner(account):
        return {}
    digest = hashlib.sha256(("lot-engine:" + settings.LOT_OWNER_ACCESS_TOKEN).encode()).hexdigest()
    return {"X-Lot-Market-Token": digest}

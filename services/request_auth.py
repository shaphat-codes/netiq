"""Resolve API keys from Flask request headers."""

from typing import Any, Optional, Tuple

from flask import Request

from config import AppConfig
from database.db import get_api_key_by_hash, hash_api_key, touch_api_key_used

CONFIG = AppConfig()


def parse_bearer_api_key(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return (request.headers.get("X-API-Key") or "").strip() or None


def resolve_api_key_request(request: Request) -> Tuple[Optional[int], Optional[int], Optional[str]]:
    """
    Returns (account_id, api_key_id, error_code).
    error_code: invalid_api_key | None
    """
    raw = parse_bearer_api_key(request)
    if not raw:
        return None, None, None
    row = get_api_key_by_hash(hash_api_key(raw))
    if not row:
        return None, None, "invalid_api_key"
    kid = int(row["id"])
    touch_api_key_used(kid)
    return int(row["account_id"]), kid, None


def gate_requires_key() -> bool:
    return CONFIG.REQUIRE_API_KEY

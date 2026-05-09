"""Subject-key helper for per-phone risk profiles."""

import hashlib


def subject_key_for_phone(account_id: int, phone: str) -> str:
    h = hashlib.sha256(f"{account_id}:{phone}".encode("utf-8")).hexdigest()
    return h[:40]

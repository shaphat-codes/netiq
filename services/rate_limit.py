"""Simple in-memory sliding window rate limiters.

Two flavours: per-API-key (used by /decision, /mcp, /a2a) and per-IP (used by
the public consumer chat endpoint where there is no API key).
"""

import threading
import time
from collections import deque
from typing import Deque, Dict, Optional

_lock = threading.Lock()
_windows: Dict[int, Deque[float]] = {}

_ip_lock = threading.Lock()
_ip_windows: Dict[str, Deque[float]] = {}


def check_rate_limit(key_id: int, limit_per_minute: int) -> tuple[bool, Optional[int]]:
    """Returns (allowed, retry_after_seconds)."""
    now = time.monotonic()
    cutoff = now - 60.0
    with _lock:
        w = _windows.setdefault(key_id, deque())
        while w and w[0] < cutoff:
            w.popleft()
        if len(w) >= limit_per_minute:
            retry = int(max(1, 60 - (now - w[0])))
            return False, retry
        w.append(now)
    return True, None


def check_ip_rate_limit(ip: str, limit_per_hour: int) -> tuple[bool, Optional[int]]:
    """Per-IP sliding window over a 1-hour bucket. Returns (allowed, retry_after_seconds).

    The ``ip`` key is treated opaquely — callers should normalise it (e.g. take
    the first entry of X-Forwarded-For) before passing it in.
    """
    if not ip:
        ip = "unknown"
    now = time.monotonic()
    cutoff = now - 3600.0
    with _ip_lock:
        w = _ip_windows.setdefault(ip, deque())
        while w and w[0] < cutoff:
            w.popleft()
        if len(w) >= limit_per_hour:
            retry = int(max(1, 3600 - (now - w[0])))
            return False, retry
        w.append(now)
    return True, None


def reset_for_tests() -> None:
    with _lock:
        _windows.clear()
    with _ip_lock:
        _ip_windows.clear()

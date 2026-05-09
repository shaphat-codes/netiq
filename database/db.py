import hashlib
import json
import logging
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from werkzeug.security import generate_password_hash

from database.migrate import run_migrations

_DB_DEFAULT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "netiq.db")
DEMO_PORTAL_EMAIL = "demo@netiq.local"
DB_PATH = os.getenv("NETIQ_DB_PATH", _DB_DEFAULT)
logger = logging.getLogger(__name__)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profiles (
                phone TEXT PRIMARY KEY,
                previous_risk REAL DEFAULT 0.0,
                last_decision TEXT,
                updated_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analyze_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                phone TEXT NOT NULL,
                intent TEXT NOT NULL,
                decision TEXT NOT NULL,
                confidence REAL NOT NULL,
                risk_score REAL NOT NULL,
                reason TEXT NOT NULL,
                signals_json TEXT NOT NULL,
                apis_called_json TEXT NOT NULL,
                api_errors_json TEXT NOT NULL,
                duration_ms REAL NOT NULL,
                policy_version TEXT NOT NULL
            )
            """
        )
        run_migrations(conn)
        conn.commit()
        logger.info("SQLite initialized at %s", DB_PATH)
    finally:
        conn.close()


def insert_analyze_event(
    created_at: str,
    phone: str,
    intent: str,
    decision: str,
    confidence: float,
    risk_score: float,
    reason: str,
    signals: Dict[str, Any],
    apis_called: List[str],
    api_errors: List[str],
    duration_ms: float,
    policy_version: str,
    *,
    account_id: Optional[int] = None,
    api_key_id: Optional[int] = None,
    compliance_mode: str = "relaxed",
    decision_trace: Optional[Dict[str, Any]] = None,
    policy_rule_id: Optional[str] = None,
    http_status: int = 200,
    idempotency_key: Optional[str] = None,
) -> int:
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO analyze_events (
                created_at, phone, intent, decision, confidence, risk_score, reason,
                signals_json, apis_called_json, api_errors_json, duration_ms, policy_version,
                account_id, api_key_id, compliance_mode, decision_trace_json, policy_rule_id,
                http_status, idempotency_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                created_at,
                phone,
                intent,
                decision,
                confidence,
                risk_score,
                reason,
                json.dumps(signals, default=str),
                json.dumps(apis_called),
                json.dumps(api_errors),
                duration_ms,
                policy_version,
                account_id,
                api_key_id,
                compliance_mode,
                json.dumps(decision_trace or {}, default=str),
                policy_rule_id,
                http_status,
                idempotency_key,
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def _row_to_event(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    d["signals"] = json.loads(d.pop("signals_json"))
    d["apis_called"] = json.loads(d.pop("apis_called_json"))
    d["api_errors"] = json.loads(d.pop("api_errors_json"))
    dt = d.pop("decision_trace_json", None)
    if dt:
        d["decision_trace"] = json.loads(dt) if isinstance(dt, str) else dt
    return d


def list_analyze_events(
    limit: int = 50,
    before_id: Optional[int] = None,
    account_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        if account_id is not None:
            if before_id is not None:
                cur = conn.execute(
                    """
                    SELECT * FROM analyze_events
                    WHERE account_id = ? AND id < ?
                    ORDER BY id DESC LIMIT ?
                    """,
                    (account_id, before_id, limit),
                )
            else:
                cur = conn.execute(
                    """
                    SELECT * FROM analyze_events WHERE account_id = ?
                    ORDER BY id DESC LIMIT ?
                    """,
                    (account_id, limit),
                )
        else:
            if before_id is not None:
                cur = conn.execute(
                    """
                    SELECT * FROM analyze_events WHERE id < ? ORDER BY id DESC LIMIT ?
                    """,
                    (before_id, limit),
                )
            else:
                cur = conn.execute(
                    """
                    SELECT * FROM analyze_events ORDER BY id DESC LIMIT ?
                    """,
                    (limit,),
                )
        rows = cur.fetchall()
        return [_row_to_event(row) for row in rows]
    finally:
        conn.close()


# --- Accounts & portal users ---


def ensure_demo_portal_user() -> int:
    """Return user id for the shared demo account; create account + user if missing."""
    existing = get_user_by_email(DEMO_PORTAL_EMAIL)
    if existing:
        return int(existing["id"])
    aid = create_account("Demo workspace")
    ph = generate_password_hash(secrets.token_hex(32))
    return create_portal_user(aid, DEMO_PORTAL_EMAIL, ph)


def create_account(name: str = "Workspace") -> int:
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        cur = conn.execute("INSERT INTO accounts (name, created_at) VALUES (?, ?)", (name, ts))
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def create_portal_user(account_id: int, email: str, password_hash: str) -> int:
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO portal_users (account_id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (account_id, email.lower().strip(), password_hash, ts),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute(
            "SELECT id, account_id, email, password_hash, created_at FROM portal_users WHERE email = ?",
            (email.lower().strip(),),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute(
            "SELECT id, account_id, email, password_hash, created_at FROM portal_users WHERE id = ?",
            (user_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_account(account_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute("SELECT id, name, created_at FROM accounts WHERE id = ?", (account_id,))
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# --- API keys ---


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_api_key(account_id: int, name: str, raw_key: str) -> Tuple[int, str]:
    """Returns (id, full raw key for one-time display)."""
    prefix = raw_key[:16] if len(raw_key) >= 16 else raw_key
    kh = hash_api_key(raw_key)
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO api_keys (account_id, name, key_hash, key_prefix, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (account_id, name, kh, prefix, ts),
        )
        conn.commit()
        return int(cur.lastrowid), raw_key
    finally:
        conn.close()


def get_api_key_by_hash(key_hash: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            SELECT id, account_id, name, key_hash, key_prefix, created_at, revoked_at, last_used_at
            FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL
            """,
            (key_hash,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def touch_api_key_used(key_id: int) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        conn.execute("UPDATE api_keys SET last_used_at = ? WHERE id = ?", (ts, key_id))
        conn.commit()
    finally:
        conn.close()


def list_api_keys(account_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            SELECT id, account_id, name, key_prefix, created_at, revoked_at, last_used_at
            FROM api_keys WHERE account_id = ? ORDER BY id DESC
            """,
            (account_id,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def revoke_api_key(account_id: int, key_id: int) -> bool:
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        cur = conn.execute(
            "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL",
            (ts, key_id, account_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --- Policies ---


def get_active_policy(account_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            SELECT id, account_id, version, content_json, is_active, created_at
            FROM policies WHERE account_id = ? AND is_active = 1
            ORDER BY id DESC LIMIT 1
            """,
            (account_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["content"] = json.loads(d.pop("content_json"))
        return d
    finally:
        conn.close()


def upsert_policy(account_id: int, version: str, content: Dict[str, Any]) -> int:
    """Legacy single-policy upsert — kept for backward compat. Creates new active policy."""
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        conn.execute("UPDATE policies SET is_active = 0 WHERE account_id = ?", (account_id,))
        cur = conn.execute(
            """
            INSERT INTO policies (account_id, name, version, content_json, is_active, created_at)
            VALUES (?, ?, ?, ?, 1, ?)
            """,
            (account_id, "Policy", version, json.dumps(content), ts),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_policies(account_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            SELECT id, account_id, name, version, is_active, created_at, content_json
            FROM policies WHERE account_id = ? ORDER BY id DESC
            """,
            (account_id,),
        )
        rows = []
        for row in cur.fetchall():
            d = dict(row)
            d["content"] = json.loads(d.pop("content_json"))
            rows.append(d)
        return rows
    finally:
        conn.close()


def create_policy(account_id: int, name: str, version: str, content: Dict[str, Any]) -> int:
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO policies (account_id, name, version, content_json, is_active, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            """,
            (account_id, name.strip() or "Policy", version, json.dumps(content), ts),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def activate_policy(account_id: int, policy_id: int) -> bool:
    conn = get_connection()
    try:
        conn.execute("UPDATE policies SET is_active = 0 WHERE account_id = ?", (account_id,))
        cur = conn.execute(
            "UPDATE policies SET is_active = 1 WHERE id = ? AND account_id = ?",
            (policy_id, account_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def update_policy(account_id: int, policy_id: int, name: str, version: str, content: Dict[str, Any]) -> bool:
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            UPDATE policies SET name = ?, version = ?, content_json = ?
            WHERE id = ? AND account_id = ?
            """,
            (name.strip() or "Policy", version, json.dumps(content), policy_id, account_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_policy(account_id: int, policy_id: int) -> bool:
    conn = get_connection()
    try:
        cur = conn.execute(
            "DELETE FROM policies WHERE id = ? AND account_id = ?",
            (policy_id, account_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --- Risk profiles ---


def get_risk_profile(account_id: int, subject_key: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.execute(
            "SELECT profile_json, updated_at FROM risk_profiles WHERE account_id = ? AND subject_key = ?",
            (account_id, subject_key),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {"profile": json.loads(row["profile_json"]), "updated_at": row["updated_at"]}
    finally:
        conn.close()


def upsert_risk_profile(account_id: int, subject_key: str, profile: Dict[str, Any]) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO risk_profiles (account_id, subject_key, profile_json, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(account_id, subject_key) DO UPDATE SET
                profile_json = excluded.profile_json,
                updated_at = excluded.updated_at
            """,
            (account_id, subject_key, json.dumps(profile, default=str), ts),
        )
        conn.commit()
    finally:
        conn.close()


# --- Metrics ---


def metrics_summary(account_id: int, since_iso: str) -> Dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            SELECT decision, COUNT(*) as c, AVG(risk_score) as avg_risk, AVG(duration_ms) as avg_ms
            FROM analyze_events
            WHERE account_id = ? AND created_at >= ?
            GROUP BY decision
            """,
            (account_id, since_iso),
        )
        by_decision = {row["decision"]: {"count": row["c"], "avg_risk": row["avg_risk"], "avg_ms": row["avg_ms"]} for row in cur.fetchall()}
        cur = conn.execute(
            """
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as err
            FROM analyze_events
            WHERE account_id = ? AND created_at >= ?
            """,
            (account_id, since_iso),
        )
        row = cur.fetchone()
        total = row["total"] or 0
        err = row["err"] or 0
        # risk buckets
        cur = conn.execute(
            """
            SELECT
              CASE
                WHEN risk_score <= 25 THEN '0-25'
                WHEN risk_score <= 50 THEN '26-50'
                WHEN risk_score <= 80 THEN '51-80'
                ELSE '81+'
              END as bucket,
              COUNT(*) as c
            FROM analyze_events
            WHERE account_id = ? AND created_at >= ?
            GROUP BY bucket
            """,
            (account_id, since_iso),
        )
        risk_distribution = {row["bucket"]: row["c"] for row in cur.fetchall()}
        # fraud prevented (rough): sum amount from payment BLOCK — need amount in events; skip for now use count block * placeholder
        cur = conn.execute(
            """
            SELECT COUNT(*) FROM analyze_events
            WHERE account_id = ? AND created_at >= ? AND decision = 'BLOCK'
            """,
            (account_id, since_iso),
        )
        blocks = cur.fetchone()[0]
        return {
            "total_requests": total,
            "error_count": err,
            "by_decision": by_decision,
            "risk_distribution": risk_distribution,
            "blocked_count": blocks,
            "window_start": since_iso,
        }
    finally:
        conn.close()



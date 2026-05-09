"""SQLite migrations — idempotent column/table adds."""

import logging
import sqlite3
from typing import List

logger = logging.getLogger(__name__)


def _columns(conn: sqlite3.Connection, table: str) -> List[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cur.fetchall()]


def _ensure_column(conn: sqlite3.Connection, table: str, col: str, decl: str) -> None:
    if col in _columns(conn, table):
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    logger.info("Added column %s.%s", table, col)


def run_migrations(conn: sqlite3.Connection) -> None:
    """Apply migrations after CREATE TABLE IF NOT EXISTS blocks."""
    if "analyze_events" in [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]:
        for col, decl in [
            ("account_id", "INTEGER"),
            ("api_key_id", "INTEGER"),
            ("compliance_mode", "TEXT DEFAULT 'relaxed'"),
            ("decision_trace_json", "TEXT"),
            ("policy_rule_id", "TEXT"),
            ("http_status", "INTEGER DEFAULT 200"),
            ("idempotency_key", "TEXT"),
        ]:
            _ensure_column(conn, "analyze_events", col, decl)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT 'Workspace',
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS portal_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            name TEXT NOT NULL DEFAULT 'default',
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            created_at TEXT NOT NULL,
            revoked_at TEXT,
            last_used_at TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_account ON api_keys(account_id)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            name TEXT NOT NULL DEFAULT 'Policy',
            version TEXT NOT NULL DEFAULT '1',
            content_json TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_policies_account ON policies(account_id)")
    _ensure_column(conn, "policies", "name", "TEXT NOT NULL DEFAULT 'Policy'")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS idempotency_responses (
            account_id INTEGER NOT NULL,
            key_hash TEXT NOT NULL,
            response_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (account_id, key_hash)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS risk_profiles (
            account_id INTEGER NOT NULL,
            subject_key TEXT NOT NULL,
            profile_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (account_id, subject_key)
        )
        """
    )

"""Portal and console JSON API (v1)."""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from config import AppConfig
from database.db import (
    activate_policy,
    create_account,
    create_api_key,
    create_policy,
    create_portal_user,
    delete_policy,
    ensure_demo_portal_user,
    get_account,
    get_active_policy,
    get_user_by_email,
    get_user_by_id,
    list_analyze_events,
    list_api_keys,
    list_policies,
    metrics_summary,
    revoke_api_key,
    update_policy,
)

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

api_v1_bp = Blueprint("api_v1", __name__, url_prefix="/api/v1")


def _require_session():
    uid = session.get("user_id")
    if not uid:
        return None, (jsonify({"errors": ["Unauthorized"]}), 401)
    user = get_user_by_id(int(uid))
    if not user:
        session.clear()
        return None, (jsonify({"errors": ["Unauthorized"]}), 401)
    acc = get_account(int(user["account_id"]))
    return {"user": user, "account": acc}, None


# --- Auth ---


@api_v1_bp.post("/auth/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("account_name") or "Workspace").strip()
    if not email or "@" not in email:
        return jsonify({"errors": ["valid email required"]}), 400
    if len(password) < 8:
        return jsonify({"errors": ["password must be at least 8 characters"]}), 400
    if get_user_by_email(email):
        return jsonify({"errors": ["email already registered"]}), 409
    aid = create_account(name)
    ph = generate_password_hash(password)
    uid = create_portal_user(aid, email, ph)
    session["user_id"] = uid
    session.permanent = True
    return jsonify({"user_id": uid, "account_id": aid, "email": email}), 201


@api_v1_bp.post("/auth/demo")
def demo_login():
    """One-click shared demo session (no password). Toggle with DEMO_OPEN_LOGIN."""
    if not CONFIG.DEMO_OPEN_LOGIN:
        return jsonify({"errors": ["demo login is disabled"]}), 403
    uid = ensure_demo_portal_user()
    session["user_id"] = uid
    session.permanent = True
    user = get_user_by_id(uid)
    acc = get_account(int(user["account_id"])) if user else None
    return jsonify(
        {
            "user_id": uid,
            "account_id": user["account_id"] if user else None,
            "email": user["email"] if user else "",
            "account_name": acc["name"] if acc else "",
        }
    )


@api_v1_bp.post("/auth/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = get_user_by_email(email)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"errors": ["invalid credentials"]}), 401
    session["user_id"] = user["id"]
    session.permanent = True
    return jsonify({"user_id": user["id"], "account_id": user["account_id"], "email": user["email"]})


@api_v1_bp.post("/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@api_v1_bp.get("/auth/me")
def me():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    u, a = ctx["user"], ctx["account"]
    return jsonify(
        {
            "user_id": u["id"],
            "email": u["email"],
            "account_id": a["id"],
            "account_name": a["name"],
        }
    )


# --- API keys ---


@api_v1_bp.get("/keys")
def list_keys():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    rows = list_api_keys(ctx["account"]["id"])
    return jsonify({"keys": rows})


@api_v1_bp.post("/keys")
def create_key():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "key").strip()[:80]
    raw = f"netiq_{secrets.token_urlsafe(32)}"
    kid, _ = create_api_key(ctx["account"]["id"], name, raw)
    return jsonify({"id": kid, "name": name, "api_key": raw, "warning": "Save this key; it will not be shown again."}), 201


@api_v1_bp.delete("/keys/<int:key_id>")
def revoke_key(key_id: int):
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    if revoke_api_key(ctx["account"]["id"], key_id):
        return jsonify({"ok": True})
    return jsonify({"errors": ["key not found"]}), 404


# --- Events (tenant-scoped) ---


@api_v1_bp.get("/events")
def console_events():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except ValueError:
        limit = 50
    before_id = request.args.get("before_id")
    bid = int(before_id) if before_id and before_id.isdigit() else None
    rows = list_analyze_events(limit=limit, before_id=bid, account_id=ctx["account"]["id"])
    return jsonify({"events": rows})


# --- Metrics ---


@api_v1_bp.get("/metrics/summary")
def metrics():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    days = int(request.args.get("days", "30"))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return jsonify(metrics_summary(ctx["account"]["id"], since))


# --- Policies ---


def _policy_row(p: dict) -> dict:
    return {
        "id": p["id"],
        "name": p.get("name", "Policy"),
        "version": p["version"],
        "is_active": bool(p.get("is_active")),
        "created_at": p.get("created_at"),
        "content": p["content"],
    }


@api_v1_bp.get("/policies")
def policies_list():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    rows = list_policies(ctx["account"]["id"])
    return jsonify({"policies": [_policy_row(p) for p in rows]})


@api_v1_bp.post("/policies")
def policies_create():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name") or "Policy").strip()[:80]
    ver = str(data.get("version") or "1")
    content = data.get("content")
    if not isinstance(content, dict):
        return jsonify({"errors": ["content object required"]}), 400
    pid = create_policy(ctx["account"]["id"], name, ver, content)
    return jsonify({"id": pid, "name": name, "version": ver}), 201


@api_v1_bp.put("/policies/<int:policy_id>")
def policies_update(policy_id: int):
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name") or "Policy").strip()[:80]
    ver = str(data.get("version") or "1")
    content = data.get("content")
    if not isinstance(content, dict):
        return jsonify({"errors": ["content object required"]}), 400
    if not update_policy(ctx["account"]["id"], policy_id, name, ver, content):
        return jsonify({"errors": ["policy not found"]}), 404
    return jsonify({"id": policy_id, "name": name, "version": ver})


@api_v1_bp.post("/policies/<int:policy_id>/activate")
def policies_activate(policy_id: int):
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    if not activate_policy(ctx["account"]["id"], policy_id):
        return jsonify({"errors": ["policy not found"]}), 404
    return jsonify({"ok": True, "active_policy_id": policy_id})


@api_v1_bp.delete("/policies/<int:policy_id>")
def policies_delete(policy_id: int):
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    if not delete_policy(ctx["account"]["id"], policy_id):
        return jsonify({"errors": ["policy not found"]}), 404
    return jsonify({"ok": True})


@api_v1_bp.get("/policies/active")
def policy_get():
    ctx, err = _require_session()
    if err:
        return err[0], err[1]
    p = get_active_policy(ctx["account"]["id"])
    if not p:
        return jsonify({"policy": None})
    return jsonify({"policy": _policy_row(p)})


@api_v1_bp.get("/openapi.json")
def openapi_json():
    from routes.openapi_spec import SPEC

    return jsonify(SPEC)

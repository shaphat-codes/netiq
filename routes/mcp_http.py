"""HTTP transport for the NetIQ MCP server.

Implements the MCP Streamable HTTP transport at ``POST /mcp`` so any
non-stdio client (browser-based agents, server-to-server orchestrators,
``curl`` for testing) can invoke NetIQ tools without launching a child
process.

This is a minimal, spec-compatible JSON-RPC 2.0 layer that supports the
methods required for tool discovery and invocation:

* ``initialize``
* ``initialized`` (notification)
* ``tools/list``
* ``tools/call``
* ``ping``

Auth: same Bearer API key as the rest of the platform (see
``services/request_auth.py``). Anonymous calls are allowed in dev
(REQUIRE_API_KEY=False) and run with no tenant scope.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request

from config import AppConfig
from services.mcp.tools import call_tool as mcp_call_tool
from services.mcp.tools import list_tools as mcp_list_tools
from services.rate_limit import check_rate_limit
from services.request_auth import parse_bearer_api_key, resolve_api_key_request

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

mcp_bp = Blueprint("mcp_http", __name__)

PROTOCOL_VERSION = "2025-03-26"
SERVER_NAME = "netiq"
SERVER_VERSION = "0.1.0"


def _auth_and_rate_limit() -> Tuple[Optional[int], Optional[int], Optional[Tuple[Dict[str, Any], int]]]:
    account_id, api_key_id, key_err = resolve_api_key_request(request)
    raw_key = parse_bearer_api_key(request)
    if CONFIG.REQUIRE_API_KEY and account_id is None:
        return None, None, ({"error": {"code": -32001, "message": "Valid API key required"}}, 401)
    if raw_key and key_err == "invalid_api_key":
        return None, None, ({"error": {"code": -32001, "message": "Invalid API key"}}, 401)
    if api_key_id is not None:
        allowed, retry_after = check_rate_limit(api_key_id, CONFIG.RATE_LIMIT_PER_MINUTE)
        if not allowed:
            return None, None, (
                {"error": {"code": -32002, "message": "rate_limited", "data": {"retry_after": retry_after}}},
                429,
            )
    return account_id, api_key_id, None


def _jsonrpc_result(req_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _jsonrpc_error(req_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    err: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": req_id, "error": err}


def _handle_initialize(_params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        "capabilities": {
            "tools": {"listChanged": False},
        },
        "instructions": (
            "NetIQ MCP server. Use `decide` for end-to-end network-aware risk decisions, "
            "`evaluate_policy` for tenant-rule decisions, `lookup_phone_history` to read "
            "cross-sector memory, `list_intents` for discoverability, and "
            "`get_decision_audit` to fetch a prior decision by id."
        ),
    }


def _handle_tools_list(_params: Dict[str, Any]) -> Dict[str, Any]:
    return {"tools": mcp_list_tools()}


def _handle_tools_call(
    params: Dict[str, Any],
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Dict[str, Any]:
    name = params.get("name")
    arguments = params.get("arguments") or {}
    if not isinstance(name, str) or not name:
        raise _RpcError(-32602, "tools/call requires a `name`")
    if not isinstance(arguments, dict):
        raise _RpcError(-32602, "tools/call `arguments` must be an object")

    ok, payload = mcp_call_tool(
        name,
        arguments,
        account_id=account_id,
        api_key_id=api_key_id,
    )
    text = json.dumps(payload, default=str, indent=2)
    return {
        "content": [{"type": "text", "text": text}],
        "isError": not ok,
    }


def _handle_ping(_params: Dict[str, Any]) -> Dict[str, Any]:
    return {}


class _RpcError(Exception):
    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


@mcp_bp.post("/mcp")
def mcp_endpoint():
    account_id, api_key_id, err = _auth_and_rate_limit()
    if err is not None:
        body, status = err
        body.update({"jsonrpc": "2.0", "id": None})
        return jsonify(body), status

    payload = request.get_json(force=True, silent=True)
    if payload is None:
        return jsonify(_jsonrpc_error(None, -32700, "Parse error: invalid JSON")), 400

    if isinstance(payload, list):
        responses = [_dispatch_one(p, account_id, api_key_id) for p in payload]
        return jsonify([r for r in responses if r is not None])

    response = _dispatch_one(payload, account_id, api_key_id)
    if response is None:
        return ("", 204)
    return jsonify(response)


@mcp_bp.get("/mcp")
def mcp_get():
    """Lightweight discovery probe so clients can sanity-check the endpoint."""
    return jsonify({
        "transport": "streamable-http",
        "protocolVersion": PROTOCOL_VERSION,
        "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        "tools": [t["name"] for t in mcp_list_tools()],
    })


def _dispatch_one(
    msg: Any,
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Optional[Dict[str, Any]]:
    if not isinstance(msg, dict):
        return _jsonrpc_error(None, -32600, "Invalid request: must be an object")

    req_id = msg.get("id")
    method = msg.get("method")
    params = msg.get("params") or {}

    if method is None:
        return _jsonrpc_error(req_id, -32600, "Invalid request: missing `method`")

    is_notification = "id" not in msg

    try:
        if method == "initialize":
            result = _handle_initialize(params)
        elif method == "initialized" or method == "notifications/initialized":
            return None  # notification, no response
        elif method == "tools/list":
            result = _handle_tools_list(params)
        elif method == "tools/call":
            result = _handle_tools_call(params, account_id, api_key_id)
        elif method == "ping":
            result = _handle_ping(params)
        else:
            if is_notification:
                return None
            return _jsonrpc_error(req_id, -32601, f"Method not found: {method}")
    except _RpcError as exc:
        if is_notification:
            return None
        return _jsonrpc_error(req_id, exc.code, exc.message, exc.data)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("MCP HTTP method %s crashed", method)
        if is_notification:
            return None
        return _jsonrpc_error(req_id, -32603, f"Internal error: {exc}")

    if is_notification:
        return None
    return _jsonrpc_result(req_id, result)

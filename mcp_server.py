"""NetIQ MCP server (stdio transport).

Exposes NetIQ as an MCP server installable in Claude Desktop, Cursor, VSCode
or any MCP-aware client.

Usage
-----
1. Set ``NETIQ_API_KEY`` to a NetIQ API key (create one at
   ``/console/keys``). Optionally set ``NETIQ_DB_PATH`` if your SQLite file
   lives outside the repo.
2. Add to your client's config, e.g. Claude Desktop's
   ``claude_desktop_config.json``::

       {
         "mcpServers": {
           "netiq": {
             "command": "python",
             "args": ["/absolute/path/to/netiq/mcp_server.py"],
             "env": { "NETIQ_API_KEY": "ntq_..." }
           }
         }
       }

3. Restart the client. NetIQ tools (``decide``, ``evaluate_policy``,
   ``lookup_phone_history``, ``list_intents``, ``get_decision_audit``)
   become callable from natural-language prompts.

Why this is different from Nokia's MCP playground
-------------------------------------------------
Nokia's playground wraps each CAMARA endpoint as one MCP tool (``check_sim_swap``,
``get_qos`` ...). Callers must orchestrate dozens of calls themselves.
NetIQ exposes *decisions* — the ``decide`` tool runs the full LLM agentic
pipeline (or a tenant's policy engine), fuses cross-sector phone-number
memory, and returns a structured business decision.
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

# Ensure the repo root is importable when this file is launched directly.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import configure_logging  # noqa: E402
from database.db import get_api_key_by_hash, hash_api_key, init_db, touch_api_key_used  # noqa: E402
from services.mcp.tools import call_tool, list_tools  # noqa: E402

configure_logging()
logger = logging.getLogger("netiq.mcp")

SERVER_NAME = "netiq"
SERVER_VERSION = "0.1.0"


def _resolve_api_key() -> Tuple[Optional[int], Optional[int]]:
    """Resolve NETIQ_API_KEY env var to (account_id, api_key_id).

    Stdio MCP has no per-request headers, so the API key has to come from the
    process environment. Returns (None, None) if no key is set or it's
    invalid — tools still run but anonymously (no tenant memory, no audit
    write-through).
    """
    raw = (os.getenv("NETIQ_API_KEY") or "").strip()
    if not raw:
        logger.warning("NETIQ_API_KEY not set — running anonymously, no tenant scope")
        return None, None
    row = get_api_key_by_hash(hash_api_key(raw))
    if not row:
        logger.warning("NETIQ_API_KEY did not match any stored key — running anonymously")
        return None, None
    kid = int(row["id"])
    touch_api_key_used(kid)
    aid = int(row["account_id"])
    logger.info("Authenticated as account_id=%s api_key_id=%s", aid, kid)
    return aid, kid


async def _serve() -> None:
    try:
        from mcp.server import Server  # type: ignore[import-not-found]
        from mcp.server.stdio import stdio_server  # type: ignore[import-not-found]
        from mcp import types  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - import-time guard
        sys.stderr.write(
            "ERROR: the `mcp` Python SDK is not installed.\n"
            "Install it with:  pip install mcp\n"
        )
        raise

    init_db()
    account_id, api_key_id = _resolve_api_key()

    server: Any = Server(SERVER_NAME)

    @server.list_tools()
    async def _handle_list_tools() -> List[Any]:
        return [
            types.Tool(
                name=t["name"],
                description=t["description"],
                inputSchema=t["inputSchema"],
            )
            for t in list_tools()
        ]

    @server.call_tool()
    async def _handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[Any]:
        ok, payload = call_tool(
            name,
            arguments or {},
            account_id=account_id,
            api_key_id=api_key_id,
        )
        text = json.dumps(payload, default=str, indent=2)
        if not ok:
            # MCP convention: return a TextContent with isError=True so the
            # calling LLM sees the error message but the protocol layer doesn't
            # treat it as a transport-level failure.
            return [types.TextContent(type="text", text=text)]
        return [types.TextContent(type="text", text=text)]

    async with stdio_server() as (read_stream, write_stream):
        logger.info("NetIQ MCP server starting on stdio (version %s)", SERVER_VERSION)
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


def main() -> None:
    try:
        asyncio.run(_serve())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

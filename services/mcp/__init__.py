"""NetIQ MCP server.

Exposes high-level *decision* tools to MCP clients (Claude Desktop, Cursor,
custom HTTP agents). Unlike Nokia's MCP playground — which mirrors raw CAMARA
endpoints one-to-one — these tools wrap the full NetIQ pipeline so a calling
agent only has to express *intent + phone + context* and gets back a ready
business decision (ALLOW / REVIEW / BLOCK) with trace and memory context.

The ``tools`` module defines the tool catalogue and pure handler functions.
The ``server`` module wires those tools to the MCP SDK for stdio transport.
The HTTP transport lives in ``routes/mcp_http.py``.
"""

from services.mcp.tools import (
    TOOL_DEFINITIONS,
    call_tool,
    list_tools,
)

__all__ = ["TOOL_DEFINITIONS", "call_tool", "list_tools"]

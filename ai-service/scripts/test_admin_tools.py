"""
Smoke-test admin analytics MCP tools.

Usage (from ai-service/):
  python scripts/test_admin_tools.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.mcp_server import mcp  # noqa: E402

EXPECTED = [
    "get_today_user_count",
    "get_today_trip_count",
    "get_revenue_summary",
    "get_popular_destinations",
    "get_disabled_users",
    "flag_suspicious_activity",
    "get_community_engagement_stats",
]


def _payload(result) -> object:
    structured = getattr(result, "structured_content", None)
    if structured is None:
        structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return structured
    content = getattr(result, "content", None) or []
    for block in content:
        text = getattr(block, "text", None)
        if text:
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return text
    return str(result)


async def main() -> None:
    tools = await mcp.list_tools()
    names = [t.name for t in tools]
    print("Registered tools:", names)
    for name in EXPECTED:
        assert name in names, f"missing {name}"

    cases = [
        ("get_today_user_count", {}),
        ("get_today_trip_count", {}),
        ("get_revenue_summary", {"period": "month"}),
        ("get_popular_destinations", {"limit": 3}),
        ("get_disabled_users", {}),
        ("flag_suspicious_activity", {"window_hours": 24, "trip_threshold": 5}),
        ("get_community_engagement_stats", {}),
    ]
    for tool, args in cases:
        result = await mcp.call_tool(tool, args)
        print(f"\n=== {tool} {args} ===")
        print(json.dumps(_payload(result), indent=2, default=str)[:3000])


if __name__ == "__main__":
    asyncio.run(main())

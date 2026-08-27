"""
Smoke-test user planning MCP tools.

Usage (from ai-service/):
  python scripts/test_planning_tools.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.mcp_server import mcp  # noqa: E402
from app.services.db import fetch_one  # noqa: E402


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
    for required in (
        "check_weather_for_trip",
        "compare_destinations",
        "optimize_itinerary_order",
        "find_similar_trips",
    ):
        assert required in names, f"missing {required}"
    print("OK registered:", required if False else "planning tools")

    today = date.today()
    weather = await mcp.call_tool(
        "check_weather_for_trip",
        {
            "destination": "London, United Kingdom",
            "dates": {
                "start": today.isoformat(),
                "end": (today + timedelta(days=2)).isoformat(),
            },
        },
    )
    print("\n=== check_weather_for_trip ===")
    print(json.dumps(_payload(weather), indent=2, default=str)[:2500])

    compare = await mcp.call_tool(
        "compare_destinations",
        {"city_a": "Paris", "city_b": "Rome", "budget": 40000 / 83},  # ~INR 40k as USD-ish
    )
    print("\n=== compare_destinations ===")
    print(json.dumps(_payload(compare), indent=2, default=str)[:3000])

    optimize = await mcp.call_tool(
        "optimize_itinerary_order",
        {
            "itinerary": [
                {
                    "title": "Day 1",
                    "description": "Evening departure prep. Visit the museum at noon. Arrive and check in to the hotel.",
                    "budget": "$100",
                },
                {
                    "title": "Day 2",
                    "description": "Catch the flight home. Morning coffee walk. Afternoon gallery.",
                    "budget": "$80",
                },
            ]
        },
    )
    print("\n=== optimize_itinerary_order ===")
    print(json.dumps(_payload(optimize), indent=2, default=str)[:2500])

    user = fetch_one('SELECT id FROM "User" ORDER BY "createdAt" DESC LIMIT 1')
    user_id = (user or {}).get("id") or "00000000-0000-0000-0000-000000000000"
    similar = await mcp.call_tool("find_similar_trips", {"user_id": user_id, "limit": 3})
    print("\n=== find_similar_trips ===")
    print(json.dumps(_payload(similar), indent=2, default=str)[:2500])


if __name__ == "__main__":
    asyncio.run(main())

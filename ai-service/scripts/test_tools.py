"""
Smoke tests for Step 2 MCP tools + optional re-plan loop.

Usage (from ai-service/):
  python scripts/test_tools.py --skip-gemini --query Lon
  python scripts/test_tools.py --tool check_budget
  python scripts/test_replan.py --skip-expenses --max-attempts 1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.mcp_server import mcp  # noqa: E402


def _print_result(label: str, result) -> None:
    print(f"\n=== {label} ===")
    structured = getattr(result, "structured_content", None)
    if structured is None:
        structured = getattr(result, "structuredContent", None)
    if structured is not None:
        print(json.dumps(structured, indent=2, default=str)[:5000])
        return
    content = getattr(result, "content", None)
    if content:
        for block in content:
            text = getattr(block, "text", None)
            print((text or str(block))[:5000])
        return
    print(result)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke-test GlobeTrotter MCP tools")
    parser.add_argument("--query", default="Lon", help="City search query")
    parser.add_argument("--region", default="", help="Optional region filter")
    parser.add_argument(
        "--skip-gemini",
        action="store_true",
        help="Skip tools that call Gemini",
    )
    parser.add_argument(
        "--tool",
        default="all",
        choices=["all", "search_cities", "check_budget", "search_activities", "generate_itinerary"],
    )
    parser.add_argument("--destination", default="London, United Kingdom")
    parser.add_argument("--start", default="2026-09-10")
    parser.add_argument("--end", default="2026-09-11")
    parser.add_argument("--budget", type=float, default=600.0)
    parser.add_argument("--interests", default="museums, food")
    args = parser.parse_args()

    tools = await mcp.list_tools()
    print("Registered MCP tools:", [t.name for t in tools])

    sample_itinerary = [
        {
            "id": "sec-1",
            "title": "Day 1",
            "description": "Fancy dinner and hotel",
            "startDate": args.start,
            "endDate": args.start,
            "budget": "$400",
        },
        {
            "id": "sec-2",
            "title": "Day 2",
            "description": "Museum and lunch",
            "startDate": args.end,
            "endDate": args.end,
            "budget": "$350",
        },
    ]

    async def run_cities() -> None:
        result = await mcp.call_tool(
            "search_cities",
            {"query": args.query, "region": args.region},
        )
        _print_result("search_cities", result)

    async def run_activities() -> None:
        result = await mcp.call_tool(
            "search_activities",
            {"city": "London", "category": "", "cost_type": ""},
        )
        _print_result("search_activities", result)

    async def run_budget() -> None:
        result = await mcp.call_tool(
            "check_budget",
            {"itinerary": sample_itinerary, "max_budget": 500.0},
        )
        _print_result("check_budget (expect fail)", result)

    async def run_generate() -> None:
        result = await mcp.call_tool(
            "generate_itinerary",
            {
                "destination": args.destination,
                "dates": {"start": args.start, "end": args.end},
                "budget": args.budget,
                "interests": args.interests,
            },
        )
        _print_result("generate_itinerary", result)

    if args.tool == "search_cities":
        await run_cities()
    elif args.tool == "search_activities":
        await run_activities()
    elif args.tool == "check_budget":
        await run_budget()
    elif args.tool == "generate_itinerary":
        await run_generate()
    else:
        await run_cities()
        await run_activities()
        await run_budget()
        if args.skip_gemini:
            print("\nSkipped generate_itinerary (--skip-gemini).")
        else:
            await run_generate()


if __name__ == "__main__":
    asyncio.run(main())

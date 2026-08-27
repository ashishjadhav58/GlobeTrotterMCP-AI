"""
Run the agentic re-plan loop in-process (MCP client → MCP tools).

Usage (from ai-service/):
  python scripts/test_replan.py --skip-expenses --max-attempts 1
  python scripts/test_replan.py --budget 400 --max-attempts 2
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

from app.agent.replan import plan_trip  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Test GlobeTrotter re-plan agent")
    parser.add_argument("--destination", default="London, United Kingdom")
    parser.add_argument("--start", default="2026-09-10")
    parser.add_argument("--end", default="2026-09-11")
    parser.add_argument("--budget", type=float, default=500.0)
    parser.add_argument("--interests", default="museums, walking")
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument(
        "--skip-expenses",
        action="store_true",
        help="Skip final expense generation (fewer Gemini calls)",
    )
    args = parser.parse_args()

    result = await plan_trip(
        destination=args.destination,
        start_date=args.start,
        end_date=args.end,
        max_budget=args.budget,
        interests=args.interests,
        name="Smoke-test London",
        max_attempts=args.max_attempts,
        include_expenses=not args.skip_expenses,
    )

    summary = {
        "budget_passed": result["budget_passed"],
        "attempts_used": result["attempts_used"],
        "budget_check": result.get("budget_check"),
        "itinerary_days": len(result.get("itinerary") or []),
        "expenses_count": len(result.get("expenses") or []),
        "trace_tools": [step["tool"] for step in result.get("tool_call_trace") or []],
    }
    print(json.dumps(summary, indent=2, default=str))
    print("\n--- full tool_call_trace (tool names + overage if present) ---")
    for step in result.get("tool_call_trace") or []:
        out = step.get("output") or {}
        extra = ""
        if isinstance(out, dict) and "overage_amount" in out:
            extra = f" overage={out.get('overage_amount')} passed={out.get('passed')}"
        if isinstance(out, dict) and "count" in out and "cities" in out:
            extra = f" cities={out.get('count')}"
        if isinstance(out, dict) and "count" in out and "activities" in out:
            extra = f" activities={out.get('count')}"
        print(f"  {step['step']}. {step['tool']}{extra}")


if __name__ == "__main__":
    asyncio.run(main())

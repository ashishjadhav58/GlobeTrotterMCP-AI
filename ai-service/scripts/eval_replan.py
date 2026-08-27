"""
Lightweight agent evaluation harness for the re-plan loop.

Measures:
  - budget pass rate within N attempts
  - average generate attempts
  - overage after final check_budget
  - trace integrity (generate always followed by check_budget; suggest only after fail)

Usage (from ai-service/):
  python scripts/eval_replan.py
  python scripts/eval_replan.py --cases 3 --max-attempts 2 --skip-expenses
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.agent.replan import plan_trip  # noqa: E402


DEFAULT_CASES = [
    {
        "name": "London mid budget",
        "destination": "London, United Kingdom",
        "start": "2026-09-10",
        "end": "2026-09-11",
        "budget": 500,
        "interests": "museums, walking",
    },
    {
        "name": "Dubai tight budget",
        "destination": "Dubai, United Arab Emirates",
        "start": "2026-10-01",
        "end": "2026-10-02",
        "budget": 200,
        "interests": "sightseeing",
    },
    {
        "name": "Oslo generous",
        "destination": "Oslo, Norway",
        "start": "2026-11-05",
        "end": "2026-11-06",
        "budget": 900,
        "interests": "food, culture",
    },
]


@dataclass
class CaseResult:
    name: str
    budget_passed: bool
    attempts_used: int
    overage: float
    estimated_total: float
    max_budget: float
    trace_ok: bool
    trace_tools: list[str]
    error: str | None = None


def validate_trace(trace: list[dict[str, Any]]) -> bool:
    """Every generate_itinerary must be followed by check_budget; suggest only after a failed check."""
    tools = [t.get("tool") for t in trace]
    for i, tool in enumerate(tools):
        if tool == "generate_itinerary":
            if i + 1 >= len(tools) or tools[i + 1] != "check_budget":
                return False
        if tool == "suggest_alternatives":
            # prior non-helper tool should be a failed check_budget
            prev = None
            for j in range(i - 1, -1, -1):
                if tools[j] in (
                    "check_budget",
                    "generate_itinerary",
                    "suggest_alternatives",
                ):
                    prev = trace[j]
                    break
            if not prev or prev.get("tool") != "check_budget":
                return False
            out = prev.get("output") or {}
            if isinstance(out, dict) and out.get("passed") is True:
                return False
    return "generate_itinerary" in tools and "check_budget" in tools


async def run_case(case: dict[str, Any], max_attempts: int, skip_expenses: bool) -> CaseResult:
    try:
        result = await plan_trip(
            destination=case["destination"],
            start_date=case["start"],
            end_date=case["end"],
            max_budget=float(case["budget"]),
            interests=case.get("interests", ""),
            name=case.get("name", "eval"),
            max_attempts=max_attempts,
            include_expenses=not skip_expenses,
        )
        budget = result.get("budget_check") or {}
        trace = result.get("tool_call_trace") or []
        return CaseResult(
            name=case["name"],
            budget_passed=bool(result.get("budget_passed")),
            attempts_used=int(result.get("attempts_used") or 0),
            overage=float(budget.get("overage_amount") or 0),
            estimated_total=float(budget.get("estimated_total") or 0),
            max_budget=float(case["budget"]),
            trace_ok=validate_trace(trace),
            trace_tools=[t.get("tool", "") for t in trace],
        )
    except Exception as exc:  # noqa: BLE001
        return CaseResult(
            name=case["name"],
            budget_passed=False,
            attempts_used=0,
            overage=0,
            estimated_total=0,
            max_budget=float(case["budget"]),
            trace_ok=False,
            trace_tools=[],
            error=str(exc),
        )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate GlobeTrotter re-plan agent")
    parser.add_argument("--cases", type=int, default=len(DEFAULT_CASES))
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument("--skip-expenses", action="store_true")
    parser.add_argument("--out", default="", help="Optional JSON report path")
    args = parser.parse_args()

    cases = DEFAULT_CASES[: max(1, min(args.cases, len(DEFAULT_CASES)))]
    results: list[CaseResult] = []
    for case in cases:
        print(f"Running: {case['name']} ...")
        results.append(await run_case(case, args.max_attempts, args.skip_expenses))

    ok = [r for r in results if r.error is None]
    passed = [r for r in ok if r.budget_passed]
    trace_ok = [r for r in ok if r.trace_ok]

    summary = {
        "cases": len(results),
        "errors": sum(1 for r in results if r.error),
        "budget_pass_rate": (len(passed) / len(ok)) if ok else 0.0,
        "trace_integrity_rate": (len(trace_ok) / len(ok)) if ok else 0.0,
        "avg_attempts": (sum(r.attempts_used for r in ok) / len(ok)) if ok else 0.0,
        "avg_overage": (sum(r.overage for r in ok) / len(ok)) if ok else 0.0,
        "results": [asdict(r) for r in results],
    }

    print(json.dumps(summary, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"Wrote {args.out}")


if __name__ == "__main__":
    asyncio.run(main())

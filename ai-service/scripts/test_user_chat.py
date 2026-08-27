"""
Smoke tests for user planning chat (in-process, no JWT).

Usage:
  python scripts/test_user_chat.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.agent.user_chat import run_user_plan_chat  # noqa: E402
from app.services.db import fetch_one  # noqa: E402


async def main() -> None:
    user = fetch_one('SELECT id FROM "User" WHERE status = \'Active\' ORDER BY "createdAt" DESC LIMIT 1')
    if not user:
        raise SystemExit("No active user in DB")
    user_id = user["id"]
    print("user_id", user_id)

    # 1) Slot-filling — should ask for missing params, not generate yet
    r1 = await run_user_plan_chat("plan me a trip", user_id=user_id)
    print("\n=== turn1 slot-fill ===")
    print(json.dumps({
        "session_id": r1["session_id"],
        "answer": r1["answer"],
        "trace_tools": [t["tool"] for t in r1["tool_call_trace"]],
    }, indent=2)[:2000])

    # 2) Multi-tool compare question
    r2 = await run_user_plan_chat(
        "should I go to Paris or Rome for 5 days under ₹40000?",
        user_id=user_id,
        session_id=r1["session_id"],
    )
    print("\n=== turn2 compare ===")
    print(json.dumps({
        "answer": r2["answer"],
        "trace_tools": [t["tool"] for t in r2["tool_call_trace"]],
        "rounds_used": r2["rounds_used"],
    }, indent=2, default=str)[:3500])


if __name__ == "__main__":
    asyncio.run(main())

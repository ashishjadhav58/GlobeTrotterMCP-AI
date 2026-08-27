"""
In-process smoke test for admin chat agent (no JWT required).

Usage:
  python scripts/test_admin_chat.py
  python scripts/test_admin_chat.py --message "revenue this month and disabled users"
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

from app.agent.admin_chat import run_admin_chat  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--message",
        default="how many users signed up today and what are the top 3 destinations?",
    )
    args = parser.parse_args()
    result = await run_admin_chat(args.message)
    print(
        json.dumps(
            {
                "answer": result.get("answer"),
                "rounds_used": result.get("rounds_used"),
                "trace_tools": [t["tool"] for t in result.get("tool_call_trace") or []],
                "tool_call_trace": result.get("tool_call_trace"),
            },
            indent=2,
            default=str,
        )[:6000]
    )


if __name__ == "__main__":
    asyncio.run(main())

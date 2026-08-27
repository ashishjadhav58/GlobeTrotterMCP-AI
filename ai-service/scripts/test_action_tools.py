"""
Smoke-test action MCP tools (PDF + email dry-run).

Usage (from ai-service/):
  python scripts/test_action_tools.py
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
    assert "export_trip_pdf" in names
    assert "send_trip_reminder_email" in names

    trip = fetch_one('SELECT id FROM "Trip" ORDER BY "createdAt" DESC LIMIT 1')
    if not trip:
        raise SystemExit("No trips in DB to test against")
    trip_id = trip["id"]
    print("Using trip_id:", trip_id)

    pdf = await mcp.call_tool("export_trip_pdf", {"trip_id": trip_id})
    pdf_out = _payload(pdf)
    print("\n=== export_trip_pdf ===")
    print(json.dumps(pdf_out, indent=2, default=str))
    path = (pdf_out or {}).get("path") if isinstance(pdf_out, dict) else None
    if path:
        assert Path(path).exists(), f"PDF missing: {path}"

    mail = await mcp.call_tool(
        "send_trip_reminder_email",
        {"trip_id": trip_id, "dry_run": True},
    )
    print("\n=== send_trip_reminder_email (dry_run) ===")
    print(json.dumps(_payload(mail), indent=2, default=str)[:2500])


if __name__ == "__main__":
    asyncio.run(main())

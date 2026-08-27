"""Admin chat agent — LLM chooses MCP tools via Gemini function calling."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.mcp_server import mcp
from app.services.gemini_tools import gemini_generate_with_tools, mcp_tool_to_gemini_declaration

logger = logging.getLogger(__name__)

ADMIN_TOOL_NAMES = {
    "get_today_user_count",
    "get_today_trip_count",
    "get_revenue_summary",
    "get_popular_destinations",
    "get_disabled_users",
    "flag_suspicious_activity",
    "get_community_engagement_stats",
}

ADMIN_SYSTEM = """You are GlobeTrotter's admin analytics assistant.
You answer questions about users, trips, revenue (mock), destinations, disabled accounts,
suspicious trip-creation bursts, and community engagement.

Rules:
- Use the provided tools when you need live data. Prefer tools over guessing.
- You may call multiple tools in one turn when the question needs them (e.g. today's users AND top destinations).
- After tool results arrive, synthesize a clear natural-language answer for an admin.
- Do not invent numbers. If a tool returns empty data, say so.
- Revenue tools may return is_mock=true — disclose that revenue is mocked when relevant.
- Never claim you disabled users or changed data; these tools are read-only analytics.
"""


def _tool_payload(result: Any) -> Any:
    if getattr(result, "is_error", False):
        parts = []
        for block in getattr(result, "content", None) or []:
            text = getattr(block, "text", None)
            if text:
                parts.append(text)
        raise RuntimeError("; ".join(parts) or "tool error")
    structured = getattr(result, "structured_content", None)
    if structured is None:
        structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return structured
    content = getattr(result, "content", None) or []
    texts = [getattr(b, "text", None) for b in content]
    texts = [t for t in texts if t]
    if not texts:
        return None
    joined = "\n".join(texts)
    try:
        return json.loads(joined)
    except json.JSONDecodeError:
        return {"text": joined}


async def run_admin_chat(
    message: str,
    *,
    history: list[dict[str, str]] | None = None,
    max_rounds: int = 6,
) -> dict[str, Any]:
    """
    Gemini function-calling loop over admin MCP tools.

    history: optional prior turns [{role: user|assistant, content: str}]
    """
    text = (message or "").strip()
    if not text:
        raise ValueError("message is required")

    all_tools = await mcp.list_tools()
    admin_tools = [t for t in all_tools if t.name in ADMIN_TOOL_NAMES]
    declarations = [mcp_tool_to_gemini_declaration(t) for t in admin_tools]
    if not declarations:
        raise RuntimeError("No admin tools registered on the MCP server")

    contents: list[dict[str, Any]] = []
    for turn in history or []:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        gem_role = "user" if role == "user" else "model"
        contents.append({"role": gem_role, "parts": [{"text": content}]})
    contents.append({"role": "user", "parts": [{"text": text}]})

    trace: list[dict[str, Any]] = []
    final_answer = ""

    for round_i in range(max(1, max_rounds)):
        result = await gemini_generate_with_tools(
            contents=contents,
            function_declarations=declarations,
            system_instruction=ADMIN_SYSTEM,
        )
        calls = result.get("function_calls") or []
        if not calls:
            final_answer = result.get("text") or "I could not produce an answer."
            break

        # Append model functionCall turn
        model_parts = result.get("raw_model_parts") or [
            {"functionCall": {"name": c["name"], "args": c.get("args") or {}}} for c in calls
        ]
        contents.append({"role": "model", "parts": model_parts})

        response_parts: list[dict[str, Any]] = []
        for call in calls:
            name = call.get("name") or ""
            args = call.get("args") or {}
            if name not in ADMIN_TOOL_NAMES:
                output: Any = {"error": f"Tool '{name}' is not allowed for admin chat"}
            else:
                try:
                    tool_result = await mcp.call_tool(name, args)
                    output = _tool_payload(tool_result)
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Admin tool %s failed", name)
                    output = {"error": str(exc)}

            trace.append(
                {
                    "step": len(trace) + 1,
                    "round": round_i + 1,
                    "tool": name,
                    "input": args,
                    "output": output,
                }
            )
            # Gemini expects functionResponse.response to be an object
            if not isinstance(output, dict):
                response_obj = {"result": output}
            else:
                response_obj = output
            response_parts.append(
                {
                    "functionResponse": {
                        "name": name,
                        "response": response_obj,
                    }
                }
            )

        contents.append({"role": "user", "parts": response_parts})
    else:
        final_answer = (
            result.get("text")
            or "Reached the tool-call limit before a final answer. See tool_call_trace."
        )

    return {
        "answer": final_answer,
        "tool_call_trace": trace,
        "tools_available": sorted(ADMIN_TOOL_NAMES),
        "rounds_used": (trace[-1]["round"] if trace else 0),
    }

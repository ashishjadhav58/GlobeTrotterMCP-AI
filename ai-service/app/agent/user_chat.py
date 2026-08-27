"""User planning chat — Gemini function calling with slot-filling + session memory."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings
from app.mcp_server import mcp
from app.services import sessions as session_store
from app.services.gemini_tools import gemini_generate_with_tools, mcp_tool_to_gemini_declaration
from app.services.trip_persist import persist_planned_trip

logger = logging.getLogger(__name__)

USER_TOOL_NAMES = {
    "search_cities",
    "generate_itinerary",
    "check_budget",
    "suggest_alternatives",
    "search_activities",
    "compare_destinations",
    "check_weather_for_trip",
    "optimize_itinerary_order",
    "find_similar_trips",
    "persist_planned_trip",
}

USER_SYSTEM = """You are GlobeTrotter's trip-planning assistant in a multi-turn chat.

You have tools for searching cities, comparing destinations, weather, generating itineraries,
checking budgets, suggesting cheaper alternatives, optimizing order, finding similar trips,
and persisting a final trip (persist_planned_trip).

CRITICAL slot-filling rules:
- Before calling generate_itinerary you MUST know: destination, start date, end date, and budget (USD number).
- If any of those are missing or ambiguous, DO NOT call generate_itinerary. Ask a short clarifying question instead.
- Dates should be concrete (YYYY-MM-DD). If the user says "5 days in Goa next month", ask for exact start date (or propose one and confirm).
- Budget may be given in ₹ — convert roughly to USD for tools (≈ ÷83) and state the conversion briefly.

Planning flow (when slots are filled):
1. Optionally compare_destinations / check_weather_for_trip / find_similar_trips if relevant.
2. generate_itinerary with destination, dates {{start,end}}, budget, interests.
3. check_budget on the itinerary; if over budget, suggest_alternatives then regenerate with constraints.
4. When the user is happy OR you have a solid final itinerary, call persist_planned_trip with user_id,
   destination, start_date, end_date, max_budget, itinerary (array), and optional name/description.
5. In your final natural-language answer, include the itinerary_link from persist_planned_trip
   phrased naturally, e.g. "Done! Here's your itinerary: <link>".

Multi-tool: questions like "Paris or Rome for 5 days under ₹40000" should use compare_destinations
(and budget reasoning) — not a single tool only.

Never invent trip links — only use itinerary_link returned by persist_planned_trip.
The authenticated user_id is provided in the developer context; pass it to find_similar_trips and persist_planned_trip.
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


async def _execute_user_tool(name: str, args: dict[str, Any], user_id: str) -> Any:
    args = dict(args or {})
    if name == "persist_planned_trip":
        # Force authenticated user — do not trust model-supplied user_id for writes
        return persist_planned_trip(
            user_id=user_id,
            destination=str(args.get("destination") or ""),
            start_date=str(args.get("start_date") or args.get("startDate") or ""),
            end_date=str(args.get("end_date") or args.get("endDate") or ""),
            max_budget=float(args.get("max_budget") or args.get("maxBudget") or 0),
            name=str(args.get("name") or ""),
            description=str(args.get("description") or args.get("interests") or ""),
            itinerary=args.get("itinerary") if isinstance(args.get("itinerary"), list) else None,
            expenses=args.get("expenses") if isinstance(args.get("expenses"), list) else None,
        )
    if name == "find_similar_trips":
        args["user_id"] = user_id
    if name not in USER_TOOL_NAMES:
        return {"error": f"Tool '{name}' is not allowed in user planning chat"}
    tool_result = await mcp.call_tool(name, args)
    return _tool_payload(tool_result)


async def run_user_plan_chat(
    message: str,
    *,
    user_id: str,
    session_id: str | None = None,
    max_rounds: int = 8,
) -> dict[str, Any]:
    text = (message or "").strip()
    if not text:
        raise ValueError("message is required")
    if not user_id:
        raise ValueError("user_id is required")

    session_store.ensure_chat_sessions_table()
    if session_id:
        session = session_store.get_session(session_id, user_id)
        if not session:
            raise ValueError("session_id not found for this user")
    else:
        session = session_store.create_session(user_id)
        session_id = session["id"]

    history: list[dict[str, Any]] = list(session.get("messages") or [])

    all_tools = await mcp.list_tools()
    # persist_planned_trip is registered on MCP; filter to user set
    user_tools = [t for t in all_tools if t.name in USER_TOOL_NAMES]
    declarations = [mcp_tool_to_gemini_declaration(t) for t in user_tools]

    contents: list[dict[str, Any]] = []
    for turn in history:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        gem_role = "user" if role == "user" else "model"
        contents.append({"role": gem_role, "parts": [{"text": content}]})

    # Inject identity context with the user message
    user_blob = (
        f"{text}\n\n[system context: authenticated user_id={user_id}; "
        f"frontend_base={settings.frontend_base_url}]"
    )
    contents.append({"role": "user", "parts": [{"text": user_blob}]})

    trace: list[dict[str, Any]] = []
    final_answer = ""
    trip_link = None

    for round_i in range(max(1, max_rounds)):
        result = await gemini_generate_with_tools(
            contents=contents,
            function_declarations=declarations,
            system_instruction=USER_SYSTEM,
        )
        calls = result.get("function_calls") or []
        if not calls:
            final_answer = result.get("text") or "How else can I help plan your trip?"
            break

        model_parts = result.get("raw_model_parts") or [
            {"functionCall": {"name": c["name"], "args": c.get("args") or {}}} for c in calls
        ]
        contents.append({"role": "model", "parts": model_parts})

        response_parts: list[dict[str, Any]] = []
        for call in calls:
            name = call.get("name") or ""
            args = call.get("args") or {}
            try:
                output = await _execute_user_tool(name, args, user_id)
            except Exception as exc:  # noqa: BLE001
                logger.exception("User tool %s failed", name)
                output = {"error": str(exc)}

            if isinstance(output, dict) and output.get("itinerary_link"):
                trip_link = output["itinerary_link"]

            trace.append(
                {
                    "step": len(trace) + 1,
                    "round": round_i + 1,
                    "tool": name,
                    "input": {**args, **({"user_id": user_id} if name in ("persist_planned_trip", "find_similar_trips") else {})},
                    "output": output,
                }
            )
            response_obj = output if isinstance(output, dict) else {"result": output}
            response_parts.append(
                {"functionResponse": {"name": name, "response": response_obj}}
            )

        contents.append({"role": "user", "parts": response_parts})
    else:
        final_answer = (
            result.get("text")
            or "Reached the tool-call limit before finishing. See tool_call_trace."
        )

    # Persist conversation (store clean user text, not system context blob)
    history.append({"role": "user", "content": text})
    history.append({"role": "assistant", "content": final_answer})
    session_store.save_messages(session_id, user_id, history)

    return {
        "session_id": session_id,
        "answer": final_answer,
        "itinerary_link": trip_link,
        "tool_call_trace": trace,
        "tools_available": sorted(USER_TOOL_NAMES),
        "rounds_used": (trace[-1]["round"] if trace else 0),
    }

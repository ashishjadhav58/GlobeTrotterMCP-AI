"""User planning chat — Gemini function calling with slot-filling + confirm-before-create."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import settings
from app.mcp_server import mcp
from app.services import sessions as session_store
from app.services.gemini_tools import gemini_generate_with_tools, mcp_tool_to_gemini_declaration
from app.services.trip_persist import (
    INR_PER_USD,
    delete_user_trip,
    itinerary_looks_complete,
    persist_planned_trip,
    update_planned_trip,
)
from app.services.gemini import generate_expenses, generate_itinerary


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
    "update_planned_trip",
    "delete_user_trip",
}

USER_SYSTEM = """You are GlobeTrotter's trip-planning assistant in a multi-turn chat.

You have tools for searching cities, comparing destinations, weather, generating itineraries,
checking budgets, suggesting cheaper alternatives, optimizing order, finding similar trips,
saving trips (persist_planned_trip), updating trips (update_planned_trip), and deleting trips
(delete_user_trip).

═══════════════════════════════════════
REQUIRED CONVERSATION FLOW (strict)
═══════════════════════════════════════

STEP A — Collect missing slots (ask, do NOT generate yet):
Required before generate_itinerary:
  1) destination
  2) start date (YYYY-MM-DD)
  3) end date (YYYY-MM-DD)
  4) budget in INR if the user speaks in ₹ / lakh / thousand rupees

Ask ONE short clarifying question at a time when something is missing.

STEP B — Generate a real draft with tools (when slots are filled):
1. Call generate_itinerary with destination, dates {{start,end}}, budget in USD (₹÷83),
   and interests/notes (stay area, vibe, etc.).
2. Call check_budget; if over budget, suggest_alternatives / regenerate with constraints.
Whenever the user CHANGES budget, dates, stay area, or activities after a draft,
you MUST call generate_itinerary again before summarizing — never only rewrite the prose.

STEP C — Show a SUMMARY in chat (NO persist yet):
Include destination, dates, budget in ₹, and day-by-day highlights from the tool output.
Ask: "Does this look good? Reply yes to create/save this trip."

STEP D — Create ONLY after user confirms ("yes", "create this", "add it"):
Call persist_planned_trip with destination, start_date, end_date,
max_budget = the user's INR budget number (e.g. 50000 for ₹50k — NOT the USD conversion),
and the full itinerary array from the latest generate_itinerary result
(objects with title, description, startDate, endDate, budget — NOT {{day, activities}} stubs).
Then include itinerary_link from the tool (never invent links).

UPDATE / DELETE in the same chat:
- If the user asks to change a saved trip: regenerate if needed, then call update_planned_trip
  with the last trip_id from context (or the trip id in the itinerary link).
- If the user asks to delete/remove a trip: call delete_user_trip with that trip_id after
  a short confirmation ("Delete the Goa trip? Reply yes").
- Never delete without clear user intent.

═══════════════════════════════════════
HARD RULES
═══════════════════════════════════════
- NEVER call generate_itinerary without concrete start AND end dates.
- NEVER call persist_planned_trip until the user confirms after a summary.
- Initial "create/plan itinerary for …" is NOT a save confirmation.
- Pass authenticated user_id from developer context when needed.
- Cover photos: the UI may attach cover_image_url. When saving/updating, include that cover.
  If the user uploads a photo mid-chat, acknowledge it and apply it to the trip when created/updated.
"""


_CONFIRM_RE = re.compile(
    r"^\s*(y|yes|yeah|yep|yup|ok|okay|sure|confirm|please)\s*[!.]*\s*$"
    r"|\b(yes[, ]+)?(please\s+)?(create|add|save|book)\s+(this|it|the\s+trip|the\s+itinerary)\b"
    r"|\b(go\s+ahead|do\s+it|looks\s+good|that\s+works|create\s+it|add\s+it|save\s+it)\b"
    r"|\bi\s+(confirm|approve)\b",
    re.IGNORECASE,
)

_INR_BUDGET_RE = re.compile(
    r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|k)\b"
    r"|budget\s*(?:is|of|=|:)?\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|k)?"
    r"|(?:₹|rs\.?)\s*(\d+(?:\.\d+)?)",
    re.IGNORECASE,
)


def _parse_inr_from_text(text: str) -> float | None:
    """Pull an INR budget hint from casual user text (50k, 1 lakh, ₹50000)."""
    raw = text or ""
    t = raw.lower()
    if not any(tok in t for tok in ("budget", "₹", "rs", "inr", "lakh", "lac", "rupee")) and not re.search(
        r"\b\d+\s*(k|lakh|lac)\b", t
    ):
        return None
    best: float | None = None
    for m in _INR_BUDGET_RE.finditer(raw):
        if m.group(1) is not None:
            num_s, unit = m.group(1), (m.group(2) or "").lower()
        elif m.group(3) is not None:
            num_s, unit = m.group(3), (m.group(4) or "").lower()
        else:
            num_s, unit = m.group(5), ""
        if not num_s:
            continue
        try:
            num = float(num_s)
        except ValueError:
            continue
        if unit in ("lakh", "lac"):
            num *= 100_000
        elif unit == "k":
            num *= 1_000
        if num >= 1000:
            best = num if best is None else max(best, num)
    return best


def _looks_like_create_confirm(text: str) -> bool:
    """True only for explicit confirmations — not the initial 'create itinerary for X' request."""
    t = (text or "").strip()
    if not t:
        return False
    lower = t.lower()
    # Initial planning requests are NOT confirmations
    if re.search(r"\b(for|to|in|under|with|budget|from|days?)\b", lower) and len(t) > 40:
        return False
    if re.search(r"\b(create|plan|make)\s+(an?\s+)?(itinerary|trip)\s+(for|to|in)\b", lower):
        return False
    return bool(_CONFIRM_RE.search(t))


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


def _dates_present(args: dict[str, Any]) -> bool:
    dates = args.get("dates")
    start = args.get("start_date") or args.get("startDate")
    end = args.get("end_date") or args.get("endDate")
    if isinstance(dates, dict):
        start = start or dates.get("start")
        end = end or dates.get("end")
    if isinstance(dates, str) and " to " in dates.lower():
        return True
    return bool(start and end)


def _extract_dates(args: dict[str, Any], draft: dict[str, Any]) -> tuple[str, str]:
    dates = args.get("dates") or draft.get("dates")
    start = args.get("start_date") or args.get("startDate") or draft.get("start_date") or draft.get("startDate")
    end = args.get("end_date") or args.get("endDate") or draft.get("end_date") or draft.get("endDate")
    if isinstance(dates, dict):
        start = start or dates.get("start")
        end = end or dates.get("end")
    if isinstance(dates, str) and " to " in dates.lower():
        parts = re.split(r"\s+to\s+", dates, flags=re.IGNORECASE)
        if len(parts) == 2:
            start = start or parts[0].strip()
            end = end or parts[1].strip()
    return str(start or "").strip(), str(end or "").strip()


def _normalize_inr_amount(n: float) -> float:
    """Treat small amounts as USD leftovers and convert to INR."""
    if n <= 0:
        return 0.0
    if n < 5000:
        return round(n * INR_PER_USD)
    return n


def _guess_budget_inr(
    args: dict[str, Any],
    draft: dict[str, Any],
    history: list[dict[str, Any]] | None = None,
) -> float:
    candidates: list[float] = []
    for key in ("budget_inr", "max_budget_inr", "budgetInr"):
        for src in (args, draft):
            val = src.get(key)
            if val is None:
                continue
            try:
                candidates.append(_normalize_inr_amount(float(val)))
            except (TypeError, ValueError):
                pass
    raw = args.get("max_budget") or args.get("maxBudget") or args.get("budget")
    draft_budget = draft.get("budget") or draft.get("max_budget")
    for val in (raw, draft_budget):
        if val is None:
            continue
        try:
            candidates.append(_normalize_inr_amount(float(val)))
        except (TypeError, ValueError):
            pass
    if history:
        for turn in history:
            if turn.get("role") != "user":
                continue
            hint = _parse_inr_from_text(str(turn.get("content") or ""))
            if hint:
                candidates.append(float(hint))
    return max(candidates) if candidates else 0.0


async def _execute_user_tool(
    name: str,
    args: dict[str, Any],
    user_id: str,
    *,
    allow_persist: bool,
    agent_state: dict[str, Any],
    history: list[dict[str, Any]] | None = None,
) -> Any:
    args = dict(args or {})
    draft = dict(agent_state.get("draft") or {})

    if name == "generate_itinerary" and not _dates_present(args):
        return {
            "error": "missing_dates",
            "message": "Cannot generate yet — ask the user for start date and end date (YYYY-MM-DD).",
        }

    if name == "delete_user_trip":
        trip_id = str(args.get("trip_id") or agent_state.get("last_trip_id") or "").strip()
        if not trip_id:
            return {
                "error": "missing_trip_id",
                "message": "No trip_id. Ask which trip to delete or use the saved itinerary link id.",
            }
        result = delete_user_trip(user_id=user_id, trip_id=trip_id)
        if agent_state.get("last_trip_id") == trip_id:
            agent_state["last_trip_id"] = None
        return result

    if name == "update_planned_trip":
        trip_id = str(
            args.get("trip_id") or agent_state.get("last_trip_id") or ""
        ).strip()
        if not trip_id:
            return {
                "error": "missing_trip_id",
                "message": "No trip_id to update. Use the last saved trip link id.",
            }
        start_date, end_date = _extract_dates(args, draft)
        budget_inr = _guess_budget_inr(args, draft, history)
        budget_usd = max(1.0, round(budget_inr / INR_PER_USD, 2)) if budget_inr else 0.0
        interests = str(
            args.get("description") or args.get("interests") or draft.get("interests") or ""
        ).strip()
        destination = str(args.get("destination") or draft.get("destination") or "").strip()
        itinerary = args.get("itinerary") if isinstance(args.get("itinerary"), list) else None
        if not itinerary_looks_complete(itinerary):
            itinerary = draft.get("itinerary") if isinstance(draft.get("itinerary"), list) else None
        if not itinerary_looks_complete(itinerary) and destination and start_date and end_date and budget_usd:
            generated = await generate_itinerary(
                destination=destination,
                dates={"start": start_date, "end": end_date},
                budget=budget_usd,
                interests=interests or "Updated preferences from chat",
            )
            itinerary = generated.get("itinerary") or []
            start_date = str(generated.get("startDate") or start_date)
            end_date = str(generated.get("endDate") or end_date)
        expenses = args.get("expenses") if isinstance(args.get("expenses"), list) else None
        if expenses is None and itinerary_looks_complete(itinerary):
            try:
                expenses = await generate_expenses(
                    destination=destination or "trip",
                    dates={"start": start_date, "end": end_date},
                    budget=budget_usd or 1,
                    interests=interests,
                    itinerary=itinerary or [],
                )
            except Exception:  # noqa: BLE001
                expenses = []
        result = update_planned_trip(
            user_id=user_id,
            trip_id=trip_id,
            destination=destination,
            start_date=start_date,
            end_date=end_date,
            max_budget=budget_inr or budget_usd,
            budget_inr=budget_inr or None,
            name=str(args.get("name") or ""),
            description=interests,
            itinerary=itinerary,
            expenses=expenses,
            cover_image=str(
                args.get("cover_image")
                or args.get("coverImage")
                or agent_state.get("cover_image_url")
                or ""
            )
            or None,
        )
        if result.get("cover_image"):
            agent_state["cover_image_url"] = result["cover_image"]
        agent_state["last_trip_id"] = trip_id
        return result

    if name == "persist_planned_trip":
        if not allow_persist:
            return {
                "error": "confirmation_required",
                "message": (
                    "Do not save yet. First show a trip summary in chat and ask the user "
                    "to confirm (e.g. yes / create this / add it). Only then call persist again."
                ),
            }

        destination = str(
            args.get("destination") or draft.get("destination") or ""
        ).strip()
        start_date, end_date = _extract_dates(args, draft)
        interests = str(
            args.get("description")
            or args.get("interests")
            or draft.get("interests")
            or ""
        ).strip()
        budget_inr = _guess_budget_inr(args, draft, history)
        budget_usd = max(1.0, round(budget_inr / INR_PER_USD, 2)) if budget_inr else 0.0

        itinerary = args.get("itinerary") if isinstance(args.get("itinerary"), list) else None
        if not itinerary_looks_complete(itinerary):
            itinerary = draft.get("itinerary") if isinstance(draft.get("itinerary"), list) else None

        # Always ensure a rich itinerary before save (model often passes empty stubs)
        if not itinerary_looks_complete(itinerary):
            if not destination or not start_date or not end_date or budget_usd <= 0:
                return {
                    "error": "incomplete_trip",
                    "message": (
                        "Missing destination/dates/budget to rebuild the itinerary. "
                        "Ask the user for any missing fields, regenerate, then confirm again."
                    ),
                }
            try:
                generated = await generate_itinerary(
                    destination=destination,
                    dates={"start": start_date, "end": end_date},
                    budget=budget_usd,
                    interests=interests or "Premium stay preferences from chat",
                )
                itinerary = generated.get("itinerary") or []
                start_date = str(generated.get("startDate") or start_date)
                end_date = str(generated.get("endDate") or end_date)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Regenerate on persist failed")
                return {"error": "generate_failed", "message": str(exc)}

        expenses = args.get("expenses") if isinstance(args.get("expenses"), list) else None
        if not expenses:
            try:
                expenses = await generate_expenses(
                    destination=destination,
                    dates={"start": start_date, "end": end_date},
                    budget=budget_usd,
                    interests=interests,
                    itinerary=itinerary if isinstance(itinerary, list) else [],
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Expense generation on persist failed: %s", exc)
                expenses = []

        result = persist_planned_trip(
            user_id=user_id,
            destination=destination,
            start_date=start_date,
            end_date=end_date,
            max_budget=budget_inr or budget_usd,
            budget_inr=budget_inr or None,
            name=str(args.get("name") or draft.get("name") or ""),
            description=interests,
            itinerary=itinerary if isinstance(itinerary, list) else [],
            expenses=expenses if isinstance(expenses, list) else [],
            cover_image=str(
                args.get("cover_image")
                or args.get("coverImage")
                or agent_state.get("cover_image_url")
                or ""
            ),
        )
        agent_state["awaiting_confirm"] = False
        agent_state["last_trip_id"] = result.get("trip_id")
        agent_state["draft"] = {
            **draft,
            "destination": destination,
            "startDate": start_date,
            "endDate": end_date,
            "budget_inr": budget_inr,
            "itinerary": itinerary,
        }
        return result

    if name == "find_similar_trips":
        args["user_id"] = user_id
    if name not in USER_TOOL_NAMES:
        return {"error": f"Tool '{name}' is not allowed in user planning chat"}
    tool_result = await mcp.call_tool(name, args)
    payload = _tool_payload(tool_result)

    if name == "generate_itinerary" and isinstance(payload, dict) and not payload.get("error"):
        budget_arg = args.get("budget") or args.get("max_budget")
        try:
            budget_usd = float(budget_arg or 0)
        except (TypeError, ValueError):
            budget_usd = 0.0
        prior_inr = _guess_budget_inr({}, draft, history)
        budget_inr = prior_inr if prior_inr >= 5000 else (
            budget_usd if budget_usd >= 5000 else round(budget_usd * INR_PER_USD)
        )
        start = payload.get("startDate")
        end = payload.get("endDate")
        agent_state["awaiting_confirm"] = True
        agent_state["draft"] = {
            "destination": payload.get("destination") or args.get("destination"),
            "dates": {"start": start, "end": end},
            "startDate": start,
            "endDate": end,
            "budget": budget_usd,
            "budget_inr": budget_inr,
            "interests": args.get("interests") or args.get("constraints") or "",
            "itinerary": payload.get("itinerary") or payload.get("days"),
        }

    return payload


async def run_user_plan_chat(
    message: str,
    *,
    user_id: str,
    session_id: str | None = None,
    max_rounds: int = 8,
    cover_image_url: str | None = None,
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
    agent_state: dict[str, Any] = dict(session.get("agent_state") or {})

    if not agent_state.get("title") and text:
        agent_state["title"] = (text[:72] + "…") if len(text) > 72 else text

    cover = (cover_image_url or "").strip()
    if cover:
        agent_state["cover_image_url"] = cover
        # If a trip already exists in this chat, apply cover immediately
        last_trip = str(agent_state.get("last_trip_id") or "").strip()
        if last_trip:
            try:
                update_planned_trip(
                    user_id=user_id,
                    trip_id=last_trip,
                    cover_image=cover,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not apply cover to last trip: %s", exc)

    inr_hint = _parse_inr_from_text(text)
    if inr_hint:
        draft = dict(agent_state.get("draft") or {})
        draft["budget_inr"] = inr_hint
        agent_state["draft"] = draft

    allow_persist = bool(agent_state.get("awaiting_confirm")) and _looks_like_create_confirm(text)

    all_tools = await mcp.list_tools()
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

    policy = (
        f"[policy: awaiting_confirm={bool(agent_state.get('awaiting_confirm'))}; "
        f"user_confirmed_create={allow_persist}; "
        f"last_trip_id={agent_state.get('last_trip_id') or 'none'}; "
        f"cover_image_url={agent_state.get('cover_image_url') or 'none'}; "
        f"if awaiting_confirm and user confirms → you may persist_planned_trip; "
        f"otherwise never persist; if dates missing → ask for dates only; "
        f"for delete/update use last_trip_id when user refers to 'this trip'; "
        f"if cover_image_url is set, include it when saving/updating the trip]"
    )
    user_blob = (
        f"{text}\n\n[system context: authenticated user_id={user_id}; "
        f"frontend_base={settings.frontend_base_url}]\n{policy}"
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
                output = await _execute_user_tool(
                    name,
                    args,
                    user_id,
                    allow_persist=allow_persist,
                    agent_state=agent_state,
                    history=history + [{"role": "user", "content": text}],
                )
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
                    "input": {
                        **args,
                        **(
                            {"user_id": user_id}
                            if name
                            in (
                                "persist_planned_trip",
                                "find_similar_trips",
                                "update_planned_trip",
                                "delete_user_trip",
                            )
                            else {}
                        ),
                    },
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

    history.append({"role": "user", "content": text})
    history.append({"role": "assistant", "content": final_answer})
    session_store.save_session(session_id, user_id, history, agent_state)

    return {
        "session_id": session_id,
        "answer": final_answer,
        "itinerary_link": trip_link,
        "awaiting_confirm": bool(agent_state.get("awaiting_confirm")),
        "last_trip_id": agent_state.get("last_trip_id"),
        "cover_image_url": agent_state.get("cover_image_url"),
        "tool_call_trace": trace,
        "tools_available": sorted(USER_TOOL_NAMES),
        "rounds_used": (trace[-1]["round"] if trace else 0),
    }

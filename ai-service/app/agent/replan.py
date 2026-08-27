"""Agentic re-plan loop — MCP client that orchestrates travel tools."""

from __future__ import annotations

import json
from typing import Any

from app.config import settings
from app.mcp_server import mcp
from app.services import gemini as gemini_service


def _tool_payload(result: Any) -> Any:
    """Normalize CallToolResult into a plain Python value for the trace."""
    if getattr(result, "is_error", False):
        parts = []
        for block in getattr(result, "content", None) or []:
            text = getattr(block, "text", None)
            if text:
                parts.append(text)
        raise RuntimeError("; ".join(parts) or "MCP tool call failed")

    structured = getattr(result, "structured_content", None)
    if structured is not None:
        return structured

    # Some SDK builds use camelCase attribute access via model fields.
    if hasattr(result, "structuredContent") and result.structuredContent is not None:
        return result.structuredContent

    content = getattr(result, "content", None) or []
    texts: list[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if text:
            texts.append(text)
    if not texts:
        return None
    joined = "\n".join(texts)
    try:
        return json.loads(joined)
    except json.JSONDecodeError:
        return {"text": joined}


async def _call_tool(name: str, arguments: dict[str, Any], trace: list[dict[str, Any]]) -> Any:
    result = await mcp.call_tool(name, arguments)
    output = _tool_payload(result)
    trace.append(
        {
            "step": len(trace) + 1,
            "tool": name,
            "input": arguments,
            "output": output,
        }
    )
    return output


async def plan_trip(
    *,
    destination: str,
    start_date: str,
    end_date: str,
    max_budget: float,
    interests: str = "",
    name: str = "",
    description: str = "",
    max_attempts: int | None = None,
    include_expenses: bool = True,
) -> dict[str, Any]:
    """
    MCP-client re-plan loop:

    generate_itinerary → check_budget → (if fail) suggest_alternatives → regenerate
    → re-check, up to N attempts → expenses + full tool-call trace.
    """
    attempts = max_attempts if max_attempts is not None else settings.max_replan_attempts
    attempts = max(1, int(attempts))

    notes = " | ".join(
        part for part in [(interests or "").strip(), (description or "").strip()] if part
    )
    dates = {"start": start_date, "end": end_date}
    city_hint = destination.split(",")[0].strip() if destination else ""

    trace: list[dict[str, Any]] = []
    constraints = ""
    final_itinerary: list[dict[str, Any]] = []
    last_budget: dict[str, Any] | None = None
    budget_passed = False

    # Optional catalog grounding up front (recorded in the trace).
    await _call_tool(
        "search_cities",
        {"query": city_hint or destination, "region": ""},
        trace,
    )
    await _call_tool(
        "search_activities",
        {"city": city_hint, "category": "", "cost_type": ""},
        trace,
    )

    for attempt in range(1, attempts + 1):
        gen_args: dict[str, Any] = {
            "destination": destination,
            "dates": dates,
            "budget": float(max_budget),
            "interests": notes,
        }
        if constraints:
            gen_args["constraints"] = constraints

        generated = await _call_tool("generate_itinerary", gen_args, trace)
        days = (generated or {}).get("itinerary") or []
        final_itinerary = days

        budget_result = await _call_tool(
            "check_budget",
            {"itinerary": days, "max_budget": float(max_budget)},
            trace,
        )
        last_budget = budget_result
        if budget_result and budget_result.get("passed"):
            budget_passed = True
            break

        overage = float((budget_result or {}).get("overage_amount") or 0)
        if attempt >= attempts:
            break

        alternatives = await _call_tool(
            "suggest_alternatives",
            {
                "itinerary": days,
                "overage_amount": overage,
                "city": city_hint,
                "max_budget": float(max_budget),
            },
            trace,
        )
        constraints = (alternatives or {}).get("constraints_for_regen") or (
            f"Cut at least ${overage:.2f}. Keep total day budgets <= ${float(max_budget):.2f}."
        )

    expenses: list[dict[str, Any]] = []
    if include_expenses:
        expenses = await gemini_service.generate_expenses(
            destination=destination,
            dates=dates,
            budget=float(max_budget),
            interests=notes,
            itinerary=final_itinerary,
        )
        trace.append(
            {
                "step": len(trace) + 1,
                "tool": "generate_expenses",
                "input": {
                    "destination": destination,
                    "dates": dates,
                    "budget": float(max_budget),
                    "interests": notes,
                },
                "output": {"count": len(expenses), "expenses": expenses},
            }
        )

    return {
        "name": name or f"Trip to {destination}",
        "destination": destination,
        "startDate": start_date,
        "endDate": end_date,
        "maxBudget": float(max_budget),
        "interests": interests,
        "description": description,
        "budget_passed": budget_passed,
        "budget_check": last_budget,
        "attempts_used": sum(1 for t in trace if t["tool"] == "generate_itinerary"),
        "max_attempts": attempts,
        "itinerary": final_itinerary,
        "expenses": expenses,
        "tool_call_trace": trace,
    }

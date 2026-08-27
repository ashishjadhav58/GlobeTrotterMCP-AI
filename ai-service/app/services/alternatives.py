"""Suggest cheaper itinerary swaps when over budget."""

from __future__ import annotations

import json
from typing import Any

from app.services import activities as activities_service
from app.services.budget import _coerce_itinerary, check_budget, parse_money
from app.services.llm import call_llm_json


async def suggest_alternatives(
    itinerary: Any,
    overage_amount: float,
    *,
    city: str = "",
    max_budget: float | None = None,
) -> dict[str, Any]:
    """
    Propose specific cheaper swaps to cut roughly `overage_amount` from the plan.

    Uses catalog activities (when available) plus Gemini for concrete replacements.
    """
    days = _coerce_itinerary(itinerary)
    overage = float(overage_amount)
    if overage < 0:
        overage = 0.0

    if max_budget is None:
        # Infer a soft ceiling from current spend minus overage.
        current = check_budget(days, max(overage + 1.0, 1.0))
        max_budget = max(1.0, current["estimated_total"] - overage)

    city_hint = (city or "").strip()
    if not city_hint:
        # Best-effort: first day title often embeds a place name; catalog search still optional.
        city_hint = ""

    cheaper: list[dict[str, Any]] = []
    if city_hint:
        for cost_type in ("Free", "$", "$$"):
            cheaper.extend(
                activities_service.search_activities(
                    city=city_hint,
                    category="",
                    cost_type=cost_type,
                )
            )
            if len(cheaper) >= 12:
                break
    cheaper = cheaper[:12]

    catalog_blob = json.dumps(
        [
            {
                "title": a.get("title"),
                "category": a.get("category"),
                "costType": a.get("costType"),
                "costAmount": a.get("costAmount"),
                "cityName": a.get("cityName"),
            }
            for a in cheaper
        ],
        default=str,
    )

    itinerary_blob = json.dumps(days, default=str)
    prompt = f"""You are a travel budget editor. The itinerary is OVER BUDGET by ${overage:.2f} USD.
Target max budget: ${float(max_budget):.2f} USD.

Current itinerary JSON:
{itinerary_blob}

Optional cheaper catalog activities (prefer these when relevant; otherwise invent REAL cheaper local options):
{catalog_blob}

Return a JSON array of swap objects only. Each object must have:
- day (number, 1-based)
- replace (string: expensive item/activity/meal/stay to remove or downgrade)
- with (string: cheaper specific alternative)
- estimated_savings (number, USD)
- reason (short string)

Propose enough swaps that estimated_savings roughly sum to at least ${overage:.2f}.
Be concrete (named venues). Do not change the destination city."""

    swaps_raw = await call_llm_json(prompt)
    swaps: list[dict[str, Any]] = []
    total_savings = 0.0
    for index, item in enumerate(swaps_raw):
        if not isinstance(item, dict):
            continue
        savings = parse_money(item.get("estimated_savings") or item.get("savings"))
        total_savings += savings
        swaps.append(
            {
                "day": int(item.get("day") or (index + 1)),
                "replace": str(item.get("replace") or item.get("from") or ""),
                "with": str(item.get("with") or item.get("to") or ""),
                "estimated_savings": savings,
                "reason": str(item.get("reason") or ""),
            }
        )

    return {
        "overage_amount": overage,
        "max_budget": float(max_budget),
        "suggested_savings_total": round(total_savings, 2),
        "catalog_options_considered": len(cheaper),
        "swaps": swaps,
        "constraints_for_regen": _format_constraints(swaps, overage, float(max_budget)),
    }


def _format_constraints(swaps: list[dict[str, Any]], overage: float, max_budget: float) -> str:
    lines = [
        f"RE-PLAN CONSTRAINTS: cut at least ${overage:.2f} so total day budgets sum to <= ${max_budget:.2f}.",
        "Apply these cheaper swaps (or equivalents):",
    ]
    for swap in swaps:
        lines.append(
            f"- Day {swap['day']}: replace '{swap['replace']}' with '{swap['with']}' "
            f"(save ~${swap['estimated_savings']}). {swap['reason']}"
        )
    return "\n".join(lines)

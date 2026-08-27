"""Budget validation for itinerary day budgets."""

from __future__ import annotations

import re
from typing import Any


_MONEY_RE = re.compile(r"[-+]?\d*\.?\d+")


def parse_money(value: Any) -> float:
    """Extract a USD-like number from int/float/'$180'/ 'USD 180'."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "").strip()
    match = _MONEY_RE.search(text)
    if not match:
        return 0.0
    try:
        return float(match.group(0))
    except ValueError:
        return 0.0


def _coerce_itinerary(itinerary: Any) -> list[dict[str, Any]]:
    if isinstance(itinerary, dict):
        days = itinerary.get("itinerary") or itinerary.get("days") or itinerary.get("sections")
        if isinstance(days, list):
            return [d for d in days if isinstance(d, dict)]
        return []
    if isinstance(itinerary, list):
        return [d for d in itinerary if isinstance(d, dict)]
    if isinstance(itinerary, str):
        import json

        return _coerce_itinerary(json.loads(itinerary))
    raise ValueError("itinerary must be a list of day objects or a generate_itinerary result")


def check_budget(itinerary: Any, max_budget: float) -> dict[str, Any]:
    """
    Validate that summed day budgets do not exceed max_budget.

    Returns pass/fail, estimated total, and overage amount (0 when under budget).
    """
    days = _coerce_itinerary(itinerary)
    ceiling = float(max_budget)
    if ceiling <= 0:
        raise ValueError("max_budget must be greater than 0")

    day_totals: list[dict[str, Any]] = []
    estimated_total = 0.0
    for index, day in enumerate(days):
        amount = parse_money(day.get("budget") or day.get("dailyBudget") or day.get("cost"))
        estimated_total += amount
        day_totals.append(
            {
                "day": index + 1,
                "id": day.get("id"),
                "title": day.get("title"),
                "budget": amount,
            }
        )

    estimated_total = round(estimated_total, 2)
    overage = round(max(0.0, estimated_total - ceiling), 2)
    passed = overage <= 0.01  # tiny float slack

    return {
        "passed": passed,
        "max_budget": ceiling,
        "estimated_total": estimated_total,
        "overage_amount": overage,
        "remaining": round(max(0.0, ceiling - estimated_total), 2),
        "day_count": len(days),
        "day_totals": day_totals,
    }

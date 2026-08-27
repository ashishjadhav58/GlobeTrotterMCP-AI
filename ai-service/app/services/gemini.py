"""Google Gemini / multi-provider JSON helpers for itinerary generation."""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any

from app.services.llm import call_llm_json as call_gemini_json


def _format_iso_date(value: date | datetime | str) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.date().isoformat()


def _parse_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()


def inclusive_trip_days(start: date | datetime | str, end: date | datetime | str) -> int:
    start_d = _parse_date(start)
    end_d = _parse_date(end)
    return max(1, (end_d - start_d).days + 1)


def normalize_itinerary(
    sections: list[dict[str, Any]],
    start_date: date | datetime | str,
    day_count: int,
    max_budget: float,
) -> list[dict[str, Any]]:
    start = _parse_date(start_date)
    per_day = round((float(max_budget) or 0) / day_count) if day_count > 0 else 0
    normalized: list[dict[str, Any]] = []

    for index, section in enumerate(sections[:day_count]):
        day_date = start + timedelta(days=index)
        iso = day_date.isoformat()
        budget_value = section.get("budget", section.get("dailyBudget", per_day))
        if isinstance(budget_value, (int, float)):
            budget = f"${budget_value}"
        else:
            budget = str(budget_value or f"${per_day}")

        normalized.append(
            {
                "id": f"sec-{index + 1}",
                "title": str(section.get("title") or f"Day {index + 1}"),
                "description": str(
                    section.get("description") or section.get("details") or ""
                ),
                "startDate": str(section.get("startDate") or section.get("date") or iso),
                "endDate": str(
                    section.get("endDate")
                    or section.get("startDate")
                    or section.get("date")
                    or iso
                ),
                "budget": budget,
            }
        )
    return normalized


def _parse_dates(dates: Any) -> tuple[str, str]:
    """Accept {'start','end'}, {'startDate','endDate'}, or 'YYYY-MM-DD to YYYY-MM-DD'."""
    if isinstance(dates, dict):
        start = dates.get("start") or dates.get("startDate") or dates.get("from")
        end = dates.get("end") or dates.get("endDate") or dates.get("to")
        if not start or not end:
            raise ValueError("dates must include start and end (or startDate/endDate)")
        return _format_iso_date(start), _format_iso_date(end)

    if isinstance(dates, str):
        parts = re.split(r"\s*(?:to|/|->|–|—)\s*", dates.strip(), maxsplit=1)
        if len(parts) != 2:
            raise ValueError("dates string must look like 'YYYY-MM-DD to YYYY-MM-DD'")
        return _format_iso_date(parts[0]), _format_iso_date(parts[1])

    raise ValueError("dates must be an object or a 'start to end' string")


async def generate_itinerary(
    destination: str,
    dates: Any,
    budget: float,
    interests: str = "",
    constraints: str = "",
) -> dict[str, Any]:
    """Generate a day-by-day itinerary for a destination (MCP tool implementation)."""
    destination = (destination or "").strip()
    if not destination:
        raise ValueError("destination is required")

    start, end = _parse_dates(dates)
    day_count = inclusive_trip_days(start, end)
    max_budget = float(budget)
    if max_budget <= 0:
        raise ValueError("budget must be greater than 0")

    interests_text = (interests or "").strip() or "None"
    constraints_text = (constraints or "").strip()
    constraints_block = (
        f"\nAdditional hard constraints from budget re-plan:\n{constraints_text}\n"
        if constraints_text
        else ""
    )

    prompt = f"""You are a professional travel planner. Create a REAL, destination-specific daily itinerary.

Destination(s): {destination}
Dates: {start} to {end} (exactly {day_count} day(s), inclusive)
Traveler interests / notes: {interests_text}
Total trip budget: ${max_budget} USD
{constraints_block}
Hard rules:
- Plan ONLY for "{destination}". Do not invent a different city or country.
- Do not use placeholder, generic, or example destinations (no fake "Global" sightseeing).
- Every activity, hotel, restaurant, transit option, and landmark must be a real named place that exists in that destination.
- Create exactly {day_count} objects, one for each calendar day from {start} through {end}.
- Daily section budgets must be realistic for that day's activities and MUST sum to approximately ${max_budget} (do not exceed it).
- Scale lodging, food, and attractions to this budget (budget vs mid-range vs premium).
- Vary each day. Cover arrival/departure logistics on first and last days.
- Reflect the traveler interests when choosing activities.

Return a JSON array only. Each object must have:
- title (string, e.g. "Day 1: Neighborhood and landmark names")
- description (string, detailed paragraph with specific place names, meals, and transport)
- startDate (YYYY-MM-DD for that day)
- endDate (YYYY-MM-DD for that day, same as startDate)
- budget (string like "$180")"""

    sections = await call_gemini_json(prompt)
    normalized = normalize_itinerary(sections, start, day_count, max_budget)
    if not normalized:
        raise RuntimeError("Gemini returned no itinerary days")

    return {
        "destination": destination,
        "startDate": start,
        "endDate": end,
        "dayCount": day_count,
        "budget": max_budget,
        "interests": interests_text if interests_text != "None" else "",
        "constraints": constraints_text,
        "itinerary": normalized,
    }


def normalize_expenses(items: list[dict[str, Any]], day_count: int) -> list[dict[str, Any]]:
    allowed = {"Transport", "Stay", "Activities", "Meals"}
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        category = item.get("category") if item.get("category") in allowed else "Activities"
        day = int(item.get("day") or ((index % day_count) + 1))
        day = min(max(day, 1), day_count)
        cost_raw = item.get("cost")
        try:
            cost = float(cost_raw) if cost_raw is not None else 0.0
        except (TypeError, ValueError):
            cost = 0.0
        normalized.append(
            {
                "id": str(item.get("id") or f"e{index + 1}"),
                "day": day,
                "activityTitle": str(
                    item.get("activityTitle") or item.get("title") or item.get("name") or "Activity"
                ),
                "category": category,
                "cost": cost,
            }
        )
    return normalized


async def generate_expenses(
    destination: str,
    dates: Any,
    budget: float,
    interests: str = "",
    itinerary: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Itemized expenses aligned with an itinerary (used after the re-plan loop)."""
    start, end = _parse_dates(dates)
    day_count = inclusive_trip_days(start, end)
    max_budget = float(budget)
    interests_text = (interests or "").strip() or "None"
    itinerary_blob = json.dumps(itinerary or [], default=str)

    prompt = f"""You are a travel budget analyst. Create a REAL itemized expense list for this trip.

Destination(s): {destination}
Dates: {start} to {end} (exactly {day_count} day(s))
Traveler notes: {interests_text}
Total trip budget: ${max_budget} USD

Itinerary to cost out (match these days/activities when possible):
{itinerary_blob}

Hard rules:
- Expenses must match "{destination}" only. Use real local hotels, transit, restaurants, and attractions by name.
- No generic placeholders and no unrelated cities.
- Cover every day from 1 to {day_count}.
- Each day should typically include Stay, Transport, Meals, and Activities when realistic.
- All costs are USD numbers. The SUM of every cost must be <= ${max_budget} and close to that total.
- Scale prices to the given budget and local cost of living.

Return a JSON array only. Each object must have:
- id (string, e.g. "e1")
- day (number from 1 to {day_count})
- activityTitle (string with a specific real venue or service name)
- category (exactly one of: "Transport", "Stay", "Activities", "Meals")
- cost (number)"""

    items = await call_gemini_json(prompt)
    normalized = normalize_expenses(items, day_count)
    if not normalized:
        raise RuntimeError("Gemini returned no expenses")
    return normalized

"""User-side planning helpers: weather, compare, optimize, similar trips."""

from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from app.services.db import fetch_all, fetch_one


def _parse_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()


def _parse_dates(dates: Any) -> tuple[date, date]:
    if isinstance(dates, dict):
        start = dates.get("start") or dates.get("startDate") or dates.get("from")
        end = dates.get("end") or dates.get("endDate") or dates.get("to")
        if not start or not end:
            raise ValueError("dates must include start and end")
        return _parse_date(start), _parse_date(end)
    if isinstance(dates, str):
        parts = re.split(r"\s*(?:to|/|->|–|—)\s*", dates.strip(), maxsplit=1)
        if len(parts) != 2:
            raise ValueError("dates string must look like 'YYYY-MM-DD to YYYY-MM-DD'")
        return _parse_date(parts[0]), _parse_date(parts[1])
    raise ValueError("dates must be an object or 'start to end' string")


async def _geocode(destination: str) -> dict[str, Any]:
    """Resolve a place name via Open-Meteo Geocoding API (no key)."""
    query = (destination or "").strip()
    if not query:
        raise ValueError("destination is required")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": query.split(",")[0].strip(), "count": 1, "language": "en", "format": "json"},
        )
        response.raise_for_status()
        payload = response.json()
    results = payload.get("results") or []
    if not results:
        raise ValueError(f"Could not geocode destination: {destination}")
    hit = results[0]
    return {
        "name": hit.get("name"),
        "country": hit.get("country"),
        "latitude": float(hit["latitude"]),
        "longitude": float(hit["longitude"]),
        "timezone": hit.get("timezone") or "UTC",
    }


async def check_weather_for_trip(destination: str, dates: Any) -> dict[str, Any]:
    """
    Forecast summary via Open-Meteo (free, no API key).

    Uses daily max/min temp and precipitation probability for the trip window
    (clamped to API horizon ~16 days ahead).
    """
    start, end = _parse_dates(dates)
    if end < start:
        raise ValueError("end date must be on or after start date")

    place = await _geocode(destination)
    # Open-Meteo forecast typically covers ~16 days from "today"
    today = datetime.utcnow().date()
    api_start = max(start, today)
    api_end = min(end, today + timedelta(days=15))
    if api_end < api_start:
        return {
            "destination": destination,
            "resolved": place,
            "requested_start": start.isoformat(),
            "requested_end": end.isoformat(),
            "available": False,
            "message": "Requested dates are outside the free forecast horizon (~16 days). Try nearer dates.",
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": place["latitude"],
                "longitude": place["longitude"],
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
                "timezone": place["timezone"],
                "start_date": api_start.isoformat(),
                "end_date": api_end.isoformat(),
            },
        )
        response.raise_for_status()
        payload = response.json()

    daily = payload.get("daily") or {}
    days: list[dict[str, Any]] = []
    times = daily.get("time") or []
    for i, day in enumerate(times):
        days.append(
            {
                "date": day,
                "temp_max_c": (daily.get("temperature_2m_max") or [None])[i],
                "temp_min_c": (daily.get("temperature_2m_min") or [None])[i],
                "precip_probability_max": (daily.get("precipitation_probability_max") or [None])[i],
                "weathercode": (daily.get("weathercode") or [None])[i],
            }
        )

    maxes = [d["temp_max_c"] for d in days if d["temp_max_c"] is not None]
    mins = [d["temp_min_c"] for d in days if d["temp_min_c"] is not None]
    precip = [d["precip_probability_max"] for d in days if d["precip_probability_max"] is not None]
    avg_high = round(sum(maxes) / len(maxes), 1) if maxes else None
    avg_low = round(sum(mins) / len(mins), 1) if mins else None
    avg_precip = round(sum(precip) / len(precip), 1) if precip else None

    suitability = "mixed"
    if avg_high is not None and avg_precip is not None:
        if avg_precip >= 60:
            suitability = "wet — pack rain gear; indoor backups recommended"
        elif 15 <= avg_high <= 28 and avg_precip < 40:
            suitability = "pleasant for outdoor sightseeing"
        elif avg_high > 32:
            suitability = "hot — schedule outdoor time morning/evening"
        elif avg_high < 10:
            suitability = "cold — prioritize warm layers"

    return {
        "destination": destination,
        "resolved": place,
        "requested_start": start.isoformat(),
        "requested_end": end.isoformat(),
        "forecast_start": api_start.isoformat(),
        "forecast_end": api_end.isoformat(),
        "available": True,
        "source": "Open-Meteo",
        "summary": {
            "avg_high_c": avg_high,
            "avg_low_c": avg_low,
            "avg_precip_probability": avg_precip,
            "suitability": suitability,
        },
        "daily": days,
    }


def _city_cost_index(city_name: str) -> dict[str, Any] | None:
    row = fetch_one(
        """
        SELECT id, name, country, region, "costIndex", latitude, longitude, popularity
        FROM "City"
        WHERE name ILIKE %s
        ORDER BY popularity DESC NULLS LAST
        LIMIT 1
        """,
        [city_name.strip()],
    )
    return dict(row) if row else None


def _activity_snapshot(city_name: str, limit: int = 5) -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT title, category, "costType", "costAmount", rating, popularity
        FROM "Activity"
        WHERE COALESCE("cityName", '') ILIKE %s
        ORDER BY popularity DESC NULLS LAST, rating DESC NULLS LAST
        LIMIT %s
        """,
        [f"%{city_name.strip()}%", limit],
    )
    return [
        {
            "title": r["title"],
            "category": r["category"],
            "costType": r["costType"],
            "costAmount": r["costAmount"],
            "rating": r["rating"],
        }
        for r in rows
    ]


def _estimate_trip_cost(cost_index: int | None, budget: float, days: int = 5) -> dict[str, Any]:
    """Rough daily cost band from costIndex (0-100) scaled to requested budget."""
    idx = 50 if cost_index is None else max(0, min(int(cost_index), 100))
    # Higher costIndex → higher daily spend estimate
    daily = round(40 + (idx / 100.0) * 180, 2)
    total = round(daily * max(1, days), 2)
    fits = total <= float(budget) * 1.05
    return {
        "estimated_daily_usd": daily,
        "estimated_total_usd": total,
        "assumed_days": max(1, days),
        "fits_budget": fits,
        "cost_index": idx,
    }


async def compare_destinations(city_a: str, city_b: str, budget: float) -> dict[str, Any]:
    """
    Structured comparison: estimated cost, popular activities, weather suitability snapshot.
    """
    if float(budget) <= 0:
        raise ValueError("budget must be > 0")

    a_name = (city_a or "").strip()
    b_name = (city_b or "").strip()
    if not a_name or not b_name:
        raise ValueError("city_a and city_b are required")

    today = datetime.utcnow().date()
    sample_dates = {
        "start": today.isoformat(),
        "end": (today + timedelta(days=4)).isoformat(),
    }

    def build_side(name: str, weather: dict[str, Any]) -> dict[str, Any]:
        city = _city_cost_index(name.split(",")[0])
        cost = _estimate_trip_cost(
            None if not city else city.get("costIndex"),
            float(budget),
            days=5,
        )
        activities = _activity_snapshot(name.split(",")[0])
        return {
            "query": name,
            "catalog_city": (
                None
                if not city
                else {
                    "id": city["id"],
                    "name": city["name"],
                    "country": city["country"],
                    "costIndex": city.get("costIndex"),
                }
            ),
            "cost": cost,
            "popular_activities": activities,
            "weather": {
                "available": weather.get("available"),
                "summary": weather.get("summary"),
                "resolved": weather.get("resolved"),
            },
        }

    weather_a = await check_weather_for_trip(a_name, sample_dates)
    weather_b = await check_weather_for_trip(b_name, sample_dates)
    side_a = build_side(a_name, weather_a)
    side_b = build_side(b_name, weather_b)

    # Pick a simple recommendation
    score = lambda s: (
        (2 if s["cost"]["fits_budget"] else 0)
        + (1 if (s["weather"].get("summary") or {}).get("avg_precip_probability", 100) < 50 else 0)
        + min(len(s["popular_activities"]), 3) * 0.2
    )
    winner = a_name if score(side_a) >= score(side_b) else b_name

    return {
        "budget_usd": float(budget),
        "city_a": side_a,
        "city_b": side_b,
        "recommendation": {
            "preferred": winner,
            "reason": (
                "Weighted by budget fit, milder precip outlook, and catalog activity coverage "
                "(heuristic — not personalized)."
            ),
        },
    }


_COORD_RE = re.compile(
    r"(-?\d{1,3}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)|"
    r"lat(?:itude)?[:=\s]+(-?\d{1,3}\.\d+).{0,20}lon(?:gitude)?[:=\s]+(-?\d{1,3}\.\d+)",
    re.I,
)


def _extract_coords(activity: dict[str, Any], index: int) -> tuple[float, float]:
    """Pull lat/lon from fields or description; else place on a synthetic ring."""
    for lat_key, lon_key in (("lat", "lon"), ("latitude", "longitude")):
        if activity.get(lat_key) is not None and activity.get(lon_key) is not None:
            return float(activity[lat_key]), float(activity[lon_key])
    text = " ".join(
        str(activity.get(k) or "")
        for k in ("description", "title", "name", "location", "address")
    )
    match = _COORD_RE.search(text)
    if match:
        if match.group(1) and match.group(2):
            return float(match.group(1)), float(match.group(2))
        if match.group(3) and match.group(4):
            return float(match.group(3)), float(match.group(4))
    # Deterministic pseudo-coordinates so order is stable without geo data
    angle = (index * 2.4) % (2 * math.pi)
    return math.cos(angle), math.sin(angle)


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def optimize_itinerary_order(itinerary: Any) -> dict[str, Any]:
    """
    Reorder activities by nearest-neighbor geographic proximity.

    Accepts either:
      - list of activity objects (a single day), or
      - generate_itinerary-style { itinerary: [ days ] } / list of day sections
        (then reorders by parsing place-like tokens — falls back to title order).

    For day sections without coordinates, uses a lightweight keyword clustering
    (hotel/arrival first, departure last, others by title).
    """
    if isinstance(itinerary, dict):
        days = itinerary.get("itinerary") or itinerary.get("days") or itinerary.get("activities")
        if isinstance(days, list) and days and isinstance(days[0], dict) and (
            "title" in days[0] or "description" in days[0]
        ):
            # Day sections — apply logical flow heuristics per day (no true geo)
            optimized_days = []
            for day in days:
                optimized_days.append(_order_day_section(day))
            return {
                "mode": "day_sections_logical_flow",
                "original_count": len(days),
                "itinerary": optimized_days,
                "note": "Day sections reordered with arrival/hotel-first and departure-last heuristics.",
            }
        if isinstance(days, list):
            activities = days
        else:
            raise ValueError("itinerary must be a list of activities or day sections")
    elif isinstance(itinerary, list):
        activities = itinerary
    else:
        raise ValueError("itinerary must be a list or object")

    if not activities:
        return {"mode": "empty", "activities": []}

    # If items look like day sections
    if all(isinstance(a, dict) and ("description" in a or "budget" in a) and "title" in a for a in activities):
        return {
            "mode": "day_sections_logical_flow",
            "original_count": len(activities),
            "itinerary": [_order_day_section(a) for a in activities],
            "note": "Day sections reordered with arrival/hotel-first and departure-last heuristics.",
        }

    points = [_extract_coords(a if isinstance(a, dict) else {"title": str(a)}, i) for i, a in enumerate(activities)]
    remaining = list(range(len(activities)))
    order = [remaining.pop(0)]
    while remaining:
        last = order[-1]
        nxt = min(remaining, key=lambda j: _haversine_km(points[last], points[j]))
        remaining.remove(nxt)
        order.append(nxt)

    ordered = []
    for new_i, old_i in enumerate(order):
        item = activities[old_i]
        if isinstance(item, dict):
            cloned = dict(item)
            cloned["optimize_index"] = new_i
            cloned["original_index"] = old_i
            ordered.append(cloned)
        else:
            ordered.append({"value": item, "optimize_index": new_i, "original_index": old_i})

    path_km = 0.0
    for i in range(1, len(order)):
        path_km += _haversine_km(points[order[i - 1]], points[order[i]])

    return {
        "mode": "nearest_neighbor",
        "original_count": len(activities),
        "estimated_path_km": round(path_km, 2),
        "activities": ordered,
    }


def _order_day_section(day: dict[str, Any]) -> dict[str, Any]:
    """Bias description sentences: arrival/hotel early, departure late."""
    out = dict(day)
    desc = str(day.get("description") or "")
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", desc) if p.strip()]
    if len(parts) < 2:
        out["optimize_note"] = "unchanged (short description)"
        return out

    def rank(sentence: str) -> int:
        s = sentence.lower()
        if any(w in s for w in ("arriv", "check-in", "check in", "hotel", "airport")):
            return 0
        if any(w in s for w in ("depart", "check-out", "check out", "return", "flight home")):
            return 2
        return 1

    ordered = sorted(parts, key=rank)
    out["description"] = " ".join(ordered)
    out["optimize_note"] = "sentences reordered for arrival→activities→departure flow"
    return out


def _tokenize(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    stop = {
        "the", "and", "for", "with", "from", "trip", "to", "a", "an", "of", "in",
        "on", "at", "day", "days", "plan", "travel",
    }
    return {t for t in tokens if len(t) > 2 and t not in stop}


def find_similar_trips(user_id: str, limit: int = 5) -> dict[str, Any]:
    """
    Find trips similar to this user's past destinations/interests.

    Embedding approach: lightweight token Jaccard over destination strings +
    description/interests (no external embedding API / Pinecone in this repo).
    Compares the user's trips to other users' trips.
    """
    uid = (user_id or "").strip()
    if not uid:
        raise ValueError("user_id is required")

    mine = fetch_all(
        """
        SELECT t.id, t.name, t.description, t."maxBudget", t."startDate", t."endDate",
               COALESCE(string_agg(DISTINCT c.name || ', ' || c.country, ' | '), '') AS destinations
        FROM "Trip" t
        LEFT JOIN "TripStop" ts ON ts."tripId" = t.id
        LEFT JOIN "City" c ON c.id = ts."cityId"
        WHERE t."userId" = %s
        GROUP BY t.id
        ORDER BY t."createdAt" DESC
        LIMIT 20
        """,
        [uid],
    )
    if not mine:
        return {
            "user_id": uid,
            "count": 0,
            "similar_trips": [],
            "message": "No past trips for this user — nothing to compare.",
            "method": "token_jaccard",
        }

    profile_text = " ".join(
        f"{r.get('destinations') or ''} {r.get('description') or ''} {r.get('name') or ''}"
        for r in mine
    )
    profile = _tokenize(profile_text)
    others = fetch_all(
        """
        SELECT t.id, t.name, t.description, t."maxBudget", t."userId",
               COALESCE(string_agg(DISTINCT c.name || ', ' || c.country, ' | '), '') AS destinations
        FROM "Trip" t
        LEFT JOIN "TripStop" ts ON ts."tripId" = t.id
        LEFT JOIN "City" c ON c.id = ts."cityId"
        WHERE t."userId" <> %s
        GROUP BY t.id
        ORDER BY t."createdAt" DESC
        LIMIT 200
        """,
        [uid],
    )

    scored: list[dict[str, Any]] = []
    for row in others:
        text = f"{row.get('destinations') or ''} {row.get('description') or ''} {row.get('name') or ''}"
        tokens = _tokenize(text)
        if not tokens or not profile:
            continue
        inter = len(profile & tokens)
        union = len(profile | tokens) or 1
        score = inter / union
        if score <= 0:
            continue
        scored.append(
            {
                "trip_id": row["id"],
                "name": row["name"],
                "destinations": row["destinations"],
                "description": row.get("description"),
                "maxBudget": row.get("maxBudget"),
                "owner_user_id": row["userId"],
                "similarity": round(score, 4),
            }
        )

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    top = scored[: max(1, min(int(limit or 5), 20))]
    return {
        "user_id": uid,
        "method": "token_jaccard",
        "profile_tokens": sorted(list(profile))[:30],
        "source_trip_count": len(mine),
        "count": len(top),
        "similar_trips": top,
        "note": (
            "Uses bag-of-tokens Jaccard similarity (no vector DB). "
            "Swap for real embeddings/Pinecone when available."
        ),
    }

"""Persist a planned itinerary as a real Trip row for chat agents."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any

import psycopg

from app.config import settings
from app.services.db import fetch_one

INR_PER_USD = 83.0


def _parse_money(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def coerce_itinerary_rows(
    itinerary: list[dict[str, Any]] | None,
    *,
    start_date: str = "",
    end_date: str = "",
) -> list[dict[str, Any]]:
    """Convert alternate shapes ({day, activities}) into UI section objects."""
    from datetime import datetime, timedelta

    rows = itinerary if isinstance(itinerary, list) else []
    start = None
    try:
        if start_date:
            start = datetime.fromisoformat(str(start_date).replace("Z", "")[:10])
    except ValueError:
        start = None

    out: list[dict[str, Any]] = []
    for index, raw in enumerate(rows):
        sec = raw if isinstance(raw, dict) else {}
        acts = sec.get("activities")
        description = str(
            sec.get("description") or sec.get("details") or sec.get("summary") or ""
        ).strip()
        if not description and isinstance(acts, list):
            description = " ".join(str(a).strip() for a in acts if a).strip()
        elif not description and isinstance(acts, str):
            description = acts.strip()

        day_num = sec.get("day")
        try:
            day_index = max(0, int(day_num) - 1) if day_num is not None else index
        except (TypeError, ValueError):
            day_index = index

        iso = ""
        if start is not None:
            iso = (start + timedelta(days=day_index)).date().isoformat()

        title = str(sec.get("title") or f"Day {day_index + 1}").strip()
        start_s = str(sec.get("startDate") or sec.get("date") or sec.get("start_date") or iso).strip()
        end_s = str(sec.get("endDate") or sec.get("end_date") or start_s or iso).strip()
        out.append(
            {
                "id": str(sec.get("id") or f"sec-{day_index + 1}"),
                "title": title,
                "description": description,
                "startDate": start_s,
                "endDate": end_s,
                "budget": sec.get("budget", sec.get("dailyBudget")),
            }
        )
    return out


def normalize_itinerary_for_ui(
    itinerary: list[dict[str, Any]] | None,
    *,
    budget_inr: float,
    use_inr_labels: bool = True,
    start_date: str = "",
    end_date: str = "",
) -> list[dict[str, Any]]:
    """Shape day sections for ItineraryBuilder (title/description/dates/budget + unique ids)."""
    rows = coerce_itinerary_rows(itinerary, start_date=start_date, end_date=end_date)
    day_count = max(1, len(rows))
    per_day = round(float(budget_inr) / day_count) if budget_inr > 0 else 0
    out: list[dict[str, Any]] = []
    for index, sec in enumerate(rows):
        title = str(sec.get("title") or f"Day {index + 1}").strip()
        description = str(sec.get("description") or "").strip()
        start = str(sec.get("startDate") or "").strip()
        end = str(sec.get("endDate") or start).strip()
        budget_raw = sec.get("budget", per_day)
        amount = _parse_money(budget_raw)
        if amount is None:
            amount = float(per_day)
        # Heuristic: tiny "$180"-style amounts were USD — convert for INR UI
        if use_inr_labels and amount > 0 and amount < 2500 and budget_inr >= 5000:
            amount = round(amount * INR_PER_USD)
        budget_str = f"₹{int(round(amount))}" if use_inr_labels else str(budget_raw)
        out.append(
            {
                "id": f"sec-{index + 1}",
                "title": title,
                "description": description,
                "startDate": start,
                "endDate": end,
                "budget": budget_str,
            }
        )
    return out


def normalize_expenses_for_ui(
    expenses: list[dict[str, Any]] | None,
    *,
    budget_inr: float,
) -> list[dict[str, Any]]:
    rows = expenses if isinstance(expenses, list) else []
    out: list[dict[str, Any]] = []
    for index, raw in enumerate(rows):
        item = raw if isinstance(raw, dict) else {}
        cost = _parse_money(item.get("cost")) or 0.0
        # Convert USD-scale expense lists to INR for the budget page
        if cost > 0 and cost < 800 and budget_inr >= 5000:
            cost = round(cost * INR_PER_USD, 2)
        out.append(
            {
                "id": str(item.get("id") or f"e{index + 1}"),
                "day": int(item.get("day") or ((index % 7) + 1)),
                "activityTitle": str(item.get("activityTitle") or item.get("title") or "Activity"),
                "category": item.get("category")
                if item.get("category") in {"Transport", "Stay", "Activities", "Meals"}
                else "Activities",
                "cost": cost,
            }
        )
    return out


def itinerary_looks_complete(itinerary: list[dict[str, Any]] | None) -> bool:
    if not isinstance(itinerary, list) or len(itinerary) < 1:
        return False
    # Chat models often pass {day, activities[]} stubs — never treat as final
    if any(isinstance(s, dict) and "activities" in s and not s.get("description") for s in itinerary):
        return False
    rich = 0
    for sec in itinerary:
        if not isinstance(sec, dict):
            continue
        desc = str(sec.get("description") or sec.get("details") or "").strip()
        start = str(sec.get("startDate") or sec.get("date") or "").strip()
        if len(desc) >= 40 and start:
            rich += 1
    return rich >= max(1, (len(itinerary) + 1) // 2)


def persist_planned_trip(
    *,
    user_id: str,
    destination: str,
    start_date: str,
    end_date: str,
    max_budget: float,
    name: str = "",
    description: str = "",
    itinerary: list[dict[str, Any]] | None = None,
    expenses: list[dict[str, Any]] | None = None,
    budget_inr: float | None = None,
    cover_image: str = "",
) -> dict[str, Any]:
    """
    Insert Trip (+ optional TripStop) for the authenticated user.
    Returns trip_id and frontend itinerary link.
    """
    uid = (user_id or "").strip()
    dest = (destination or "").strip()
    if not uid:
        raise ValueError("user_id is required")
    if not dest:
        raise ValueError("destination is required")
    if float(max_budget) <= 0 and not (budget_inr and float(budget_inr) > 0):
        raise ValueError("max_budget must be > 0")

    user = fetch_one('SELECT id FROM "User" WHERE id = %s', [uid])
    if not user:
        raise ValueError("user_id not found")

    start = datetime.fromisoformat(str(start_date).replace("Z", "+00:00"))
    end = datetime.fromisoformat(str(end_date).replace("Z", "+00:00"))
    if end < start:
        raise ValueError("end_date must be on or after start_date")

    # GlobeTrotter UI is INR — prefer explicit INR; else convert small USD-looking values
    stored_budget = float(budget_inr) if budget_inr and float(budget_inr) > 0 else float(max_budget)
    if stored_budget > 0 and stored_budget < 5000:
        stored_budget = round(stored_budget * INR_PER_USD)

    ui_itinerary = normalize_itinerary_for_ui(
        itinerary,
        budget_inr=stored_budget,
        start_date=str(start_date),
        end_date=str(end_date),
    )
    ui_expenses = normalize_expenses_for_ui(expenses, budget_inr=stored_budget)

    trip_id = str(uuid.uuid4())
    trip_name = (name or "").strip() or f"Trip to {dest.split(',')[0].strip()}"
    itinerary_json = json.dumps(ui_itinerary, default=str)
    expenses_json = json.dumps(ui_expenses, default=str)
    desc = (description or "").strip() or f"Chat-planned trip to {dest.split(',')[0].strip()}"
    cover = (cover_image or "").strip() or None

    database_url = settings.require_database_url()
    with psycopg.connect(database_url) as conn:
        conn.execute(
            """
            INSERT INTO "Trip" (
              id, "userId", name, description, "startDate", "endDate",
              "maxBudget", "coverImage", itinerary, expenses, "createdAt", "updatedAt"
            ) VALUES (
              %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, NOW(), NOW()
            )
            """,
            [
                trip_id,
                uid,
                trip_name,
                desc,
                start,
                end,
                stored_budget,
                cover,
                itinerary_json,
                expenses_json,
            ],
        )

        # Best-effort city stop
        city_name = dest.split(",")[0].strip()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM "City"
                WHERE name ILIKE %s
                ORDER BY popularity DESC NULLS LAST
                LIMIT 1
                """,
                [city_name],
            )
            city_row = cur.fetchone()
            if city_row:
                city_id = city_row[0]
            else:
                city_id = str(uuid.uuid4())
                parts = [p.strip() for p in dest.split(",") if p.strip()]
                country = parts[1] if len(parts) > 1 else "Unknown"
                cur.execute(
                    """
                    INSERT INTO "City" (id, name, country, region)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [city_id, city_name, country, country],
                )
            stop_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO "TripStop" (id, "tripId", "cityId", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, NOW(), NOW())
                """,
                [stop_id, trip_id, city_id],
            )
        conn.commit()

    link = f"{settings.frontend_base_url.rstrip('/')}/itinerary/{trip_id}"
    return {
        "trip_id": trip_id,
        "name": trip_name,
        "destination": dest,
        "max_budget_inr": stored_budget,
        "days_saved": len(ui_itinerary),
        "expense_items": len(ui_expenses),
        "cover_image": cover,
        "itinerary_link": link,
        "message": f"Trip saved with {len(ui_itinerary)} day(s). Open your itinerary: {link}",
    }


def delete_user_trip(*, user_id: str, trip_id: str) -> dict[str, Any]:
    """Delete a trip owned by the authenticated user."""
    uid = (user_id or "").strip()
    tid = (trip_id or "").strip()
    if not uid or not tid:
        raise ValueError("user_id and trip_id are required")

    row = fetch_one(
        'SELECT id, name FROM "Trip" WHERE id = %s AND "userId" = %s',
        [tid, uid],
    )
    if not row:
        raise ValueError("Trip not found for this user")

    database_url = settings.require_database_url()
    with psycopg.connect(database_url) as conn:
        conn.execute('DELETE FROM "TripStop" WHERE "tripId" = %s', [tid])
        try:
            conn.execute('DELETE FROM "TripActivity" WHERE "tripId" = %s', [tid])
        except Exception:
            pass
        conn.execute('DELETE FROM "Trip" WHERE id = %s AND "userId" = %s', [tid, uid])
        conn.commit()

    return {
        "deleted": True,
        "trip_id": tid,
        "name": row.get("name"),
        "message": f'Deleted trip "{row.get("name")}" ({tid}).',
    }


def update_planned_trip(
    *,
    user_id: str,
    trip_id: str,
    destination: str = "",
    start_date: str = "",
    end_date: str = "",
    max_budget: float = 0,
    name: str = "",
    description: str = "",
    itinerary: list[dict[str, Any]] | None = None,
    expenses: list[dict[str, Any]] | None = None,
    budget_inr: float | None = None,
    cover_image: str | None = None,
) -> dict[str, Any]:
    """Update an existing trip owned by the user."""
    uid = (user_id or "").strip()
    tid = (trip_id or "").strip()
    if not uid or not tid:
        raise ValueError("user_id and trip_id are required")

    existing = fetch_one(
        """
        SELECT id, name, description, "startDate", "endDate", "maxBudget",
               itinerary, expenses, "coverImage"
        FROM "Trip" WHERE id = %s AND "userId" = %s
        """,
        [tid, uid],
    )
    if not existing:
        raise ValueError("Trip not found for this user")

    dest = (destination or "").strip()
    start_raw = start_date or str(existing["startDate"])
    end_raw = end_date or str(existing["endDate"])
    start_s = str(start_raw).replace("Z", "+00:00")[:10]
    end_s = str(end_raw).replace("Z", "+00:00")[:10]
    start = datetime.fromisoformat(str(start_raw).replace("Z", "+00:00")[:19])
    end = datetime.fromisoformat(str(end_raw).replace("Z", "+00:00")[:19])

    stored_budget = float(budget_inr) if budget_inr and float(budget_inr) > 0 else float(max_budget or 0)
    if stored_budget <= 0:
        stored_budget = float(existing.get("maxBudget") or 0)
    if stored_budget > 0 and stored_budget < 5000:
        stored_budget = round(stored_budget * INR_PER_USD)

    if itinerary is not None:
        ui_itinerary = normalize_itinerary_for_ui(
            itinerary, budget_inr=stored_budget, start_date=start_s, end_date=end_s
        )
        itinerary_json = json.dumps(ui_itinerary, default=str)
    else:
        itinerary_json = existing.get("itinerary")

    if expenses is not None:
        ui_expenses = normalize_expenses_for_ui(expenses, budget_inr=stored_budget)
        expenses_json = json.dumps(ui_expenses, default=str)
    else:
        expenses_json = existing.get("expenses")

    trip_name = (name or "").strip() or existing.get("name")
    desc = (description or "").strip() or existing.get("description")
    if cover_image is None:
        cover = existing.get("coverImage")
    else:
        cover = (cover_image or "").strip() or None

    database_url = settings.require_database_url()
    with psycopg.connect(database_url) as conn:
        conn.execute(
            """
            UPDATE "Trip"
            SET name = %s,
                description = %s,
                "startDate" = %s,
                "endDate" = %s,
                "maxBudget" = %s,
                "coverImage" = %s,
                itinerary = %s,
                expenses = %s,
                "updatedAt" = NOW()
            WHERE id = %s AND "userId" = %s
            """,
            [
                trip_name,
                desc,
                start,
                end,
                stored_budget,
                cover,
                itinerary_json,
                expenses_json,
                tid,
                uid,
            ],
        )
        conn.commit()

    link = f"{settings.frontend_base_url.rstrip('/')}/itinerary/{tid}"
    return {
        "trip_id": tid,
        "name": trip_name,
        "destination": dest or None,
        "max_budget_inr": stored_budget,
        "cover_image": cover,
        "itinerary_link": link,
        "updated": True,
        "message": f"Trip updated. Open your itinerary: {link}",
    }

"""Persist a planned itinerary as a real Trip row for chat agents."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

import psycopg

from app.config import settings
from app.services.db import fetch_one


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
    if float(max_budget) <= 0:
        raise ValueError("max_budget must be > 0")

    user = fetch_one('SELECT id FROM "User" WHERE id = %s', [uid])
    if not user:
        raise ValueError("user_id not found")

    start = datetime.fromisoformat(str(start_date).replace("Z", "+00:00"))
    end = datetime.fromisoformat(str(end_date).replace("Z", "+00:00"))
    if end < start:
        raise ValueError("end_date must be on or after start_date")

    trip_id = str(uuid.uuid4())
    trip_name = (name or "").strip() or f"Trip to {dest.split(',')[0].strip()}"
    itinerary_json = json.dumps(itinerary or [], default=str)
    expenses_json = json.dumps(expenses or [], default=str)
    desc = (description or "").strip() or None

    database_url = settings.require_database_url()
    with psycopg.connect(database_url) as conn:
        conn.execute(
            """
            INSERT INTO "Trip" (
              id, "userId", name, description, "startDate", "endDate",
              "maxBudget", itinerary, expenses, "createdAt", "updatedAt"
            ) VALUES (
              %s, %s, %s, %s, %s, %s,
              %s, %s, %s, NOW(), NOW()
            )
            """,
            [
                trip_id,
                uid,
                trip_name,
                desc,
                start,
                end,
                float(max_budget),
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
        "itinerary_link": link,
        "message": f"Trip saved. Open your itinerary: {link}",
    }

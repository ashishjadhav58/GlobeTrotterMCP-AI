"""Activity catalog search — mirrors backend activityController.getActivities filters."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import settings


def search_activities(
    city: str = "",
    category: str = "",
    cost_type: str = "",
) -> list[dict[str, Any]]:
    """
    Search activities by city name, category, and cost type (Free, $, $$, $$$).

    Same filter semantics as GET /api/activities (Prisma Activity model).
    """
    database_url = settings.require_database_url()
    city_q = (city or "").strip()
    category_q = (category or "").strip()
    cost_q = (cost_type or "").strip()

    clauses: list[str] = []
    params: list[Any] = []

    if city_q and city_q.lower() != "all":
        clauses.append('COALESCE("cityName", \'\') ILIKE %s')
        params.append(f"%{city_q}%")

    if category_q and category_q.lower() != "all":
        clauses.append("category ILIKE %s")
        params.append(category_q)

    if cost_q and cost_q.lower() != "all":
        clauses.append('"costType" = %s')
        params.append(cost_q)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""
        SELECT id, name, title, description, type, category,
               cost, "costType", "costAmount", duration, rating,
               popularity, image, "cityId", "cityName"
        FROM "Activity"
        {where}
        ORDER BY popularity DESC NULLS LAST, rating DESC NULLS LAST
        LIMIT 40
    """

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return [dict(row) for row in rows]

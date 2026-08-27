"""City catalog access — wraps the same Postgres City table Prisma uses."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import settings


def search_cities(query: str = "", region: str = "") -> list[dict[str, Any]]:
    """
    Search destination cities from the GlobeTrotter catalog.

    Mirrors backend `GET /api/trips/cities` (prisma.city.findMany) with optional
    case-insensitive filters on name/country/region.
    """
    database_url = settings.require_database_url()
    q = (query or "").strip()
    r = (region or "").strip()

    clauses: list[str] = []
    params: list[Any] = []

    if q:
        clauses.append(
            "(name ILIKE %s OR country ILIKE %s OR COALESCE(region, '') ILIKE %s)"
        )
        like = f"%{q}%"
        params.extend([like, like, like])

    if r:
        clauses.append("COALESCE(region, '') ILIKE %s")
        params.append(f"%{r}%")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""
        SELECT id, name, country, region, image, description,
               popularity, latitude, longitude, "costIndex"
        FROM "City"
        {where}
        ORDER BY name ASC
        LIMIT 50
    """

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "country": row["country"],
            "region": row["region"],
            "image": row.get("image"),
            "description": row.get("description"),
            "popularity": row.get("popularity"),
            "latitude": row.get("latitude"),
            "longitude": row.get("longitude"),
            "costIndex": row.get("costIndex"),
        }
        for row in rows
    ]

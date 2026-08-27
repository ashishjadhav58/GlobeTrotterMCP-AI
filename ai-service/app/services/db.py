"""Shared Postgres helpers for MCP tools (same DATABASE_URL as Prisma)."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import settings


def fetch_one(sql: str, params: list[Any] | tuple[Any, ...] | None = None) -> dict[str, Any] | None:
    database_url = settings.require_database_url()
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchone()


def fetch_all(sql: str, params: list[Any] | tuple[Any, ...] | None = None) -> list[dict[str, Any]]:
    database_url = settings.require_database_url()
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return list(cur.fetchall())

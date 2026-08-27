"""Chat session persistence for the user planning agent."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.services.db import fetch_one
from app.config import settings
import psycopg


def ensure_chat_sessions_table() -> None:
    """Create ChatSession table if Prisma migrate/push has not run yet."""
    database_url = settings.require_database_url()
    ddl = """
    CREATE TABLE IF NOT EXISTS "ChatSession" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      messages TEXT NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "ChatSession_userId_idx" ON "ChatSession"("userId");
    CREATE INDEX IF NOT EXISTS "ChatSession_userId_updatedAt_idx"
      ON "ChatSession"("userId", "updatedAt");
    """
    with psycopg.connect(database_url) as conn:
        conn.execute(ddl)
        conn.commit()


def create_session(user_id: str) -> dict[str, Any]:
    ensure_chat_sessions_table()
    sid = str(uuid.uuid4())
    database_url = settings.require_database_url()
    with psycopg.connect(database_url) as conn:
        conn.execute(
            """
            INSERT INTO "ChatSession" (id, "userId", messages, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, NOW(), NOW())
            """,
            [sid, user_id, "[]"],
        )
        conn.commit()
    return {"id": sid, "userId": user_id, "messages": []}


def get_session(session_id: str, user_id: str) -> dict[str, Any] | None:
    ensure_chat_sessions_table()
    row = fetch_one(
        """
        SELECT id, "userId", messages, "createdAt", "updatedAt"
        FROM "ChatSession"
        WHERE id = %s AND "userId" = %s
        """,
        [session_id, user_id],
    )
    if not row:
        return None
    messages = []
    try:
        messages = json.loads(row.get("messages") or "[]")
    except json.JSONDecodeError:
        messages = []
    return {
        "id": row["id"],
        "userId": row["userId"],
        "messages": messages if isinstance(messages, list) else [],
        "createdAt": row.get("createdAt"),
        "updatedAt": row.get("updatedAt"),
    }


def save_messages(session_id: str, user_id: str, messages: list[dict[str, Any]]) -> None:
    ensure_chat_sessions_table()
    database_url = settings.require_database_url()
    payload = json.dumps(messages, default=str)
    with psycopg.connect(database_url) as conn:
        conn.execute(
            """
            UPDATE "ChatSession"
            SET messages = %s, "updatedAt" = NOW()
            WHERE id = %s AND "userId" = %s
            """,
            [payload, session_id, user_id],
        )
        conn.commit()

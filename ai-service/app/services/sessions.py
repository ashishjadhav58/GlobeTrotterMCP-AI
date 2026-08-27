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


def _parse_blob(raw: str | None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Support legacy list-only JSON and {messages, agent_state}."""
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return [], {}
    if isinstance(data, list):
        return data, {}
    if isinstance(data, dict):
        messages = data.get("messages") if isinstance(data.get("messages"), list) else []
        state = data.get("agent_state") if isinstance(data.get("agent_state"), dict) else {}
        return messages, state
    return [], {}


def create_session(user_id: str) -> dict[str, Any]:
    ensure_chat_sessions_table()
    sid = str(uuid.uuid4())
    database_url = settings.require_database_url()
    blob = json.dumps({"messages": [], "agent_state": {}})
    with psycopg.connect(database_url) as conn:
        conn.execute(
            """
            INSERT INTO "ChatSession" (id, "userId", messages, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, NOW(), NOW())
            """,
            [sid, user_id, blob],
        )
        conn.commit()
    return {"id": sid, "userId": user_id, "messages": [], "agent_state": {}}


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
    messages, agent_state = _parse_blob(row.get("messages"))
    return {
        "id": row["id"],
        "userId": row["userId"],
        "messages": messages,
        "agent_state": agent_state,
        "createdAt": row.get("createdAt"),
        "updatedAt": row.get("updatedAt"),
    }


def save_session(
    session_id: str,
    user_id: str,
    messages: list[dict[str, Any]],
    agent_state: dict[str, Any] | None = None,
) -> None:
    ensure_chat_sessions_table()
    database_url = settings.require_database_url()
    payload = json.dumps(
        {"messages": messages, "agent_state": agent_state or {}},
        default=str,
    )
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


def save_messages(session_id: str, user_id: str, messages: list[dict[str, Any]]) -> None:
    """Backward-compatible: preserve existing agent_state when only messages change."""
    existing = get_session(session_id, user_id)
    state = (existing or {}).get("agent_state") or {}
    save_session(session_id, user_id, messages, state)


def _session_title(messages: list[dict[str, Any]], agent_state: dict[str, Any]) -> str:
    titled = str(agent_state.get("title") or "").strip()
    if titled:
        return titled[:80]
    for turn in messages:
        if turn.get("role") == "user":
            content = str(turn.get("content") or "").strip()
            if content:
                return (content[:72] + "…") if len(content) > 72 else content
    return "New chat"


def list_sessions(user_id: str, limit: int = 40) -> list[dict[str, Any]]:
    ensure_chat_sessions_table()
    database_url = settings.require_database_url()
    lim = max(1, min(int(limit or 40), 100))
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, messages, "createdAt", "updatedAt"
                FROM "ChatSession"
                WHERE "userId" = %s
                ORDER BY "updatedAt" DESC
                LIMIT %s
                """,
                [user_id, lim],
            )
            rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        messages, agent_state = _parse_blob(row[1])
        out.append(
            {
                "id": row[0],
                "title": _session_title(messages, agent_state),
                "message_count": len(messages),
                "createdAt": row[2],
                "updatedAt": row[3],
            }
        )
    return out


def delete_session(session_id: str, user_id: str) -> bool:
    ensure_chat_sessions_table()
    database_url = settings.require_database_url()
    with psycopg.connect(database_url) as conn:
        cur = conn.execute(
            'DELETE FROM "ChatSession" WHERE id = %s AND "userId" = %s',
            [session_id, user_id],
        )
        conn.commit()
        return cur.rowcount > 0

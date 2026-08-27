"""JWT admin auth for the AI service (mirrors backend adminAuth middleware)."""

from __future__ import annotations

import os
from typing import Any

import jwt

from app.services.db import fetch_one

# Same fallback pattern as backend/middleware/adminAuth.js
_DEFAULT_SECRET = "globe_trotter_secret_key_987654321_abc"


def jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "").strip() or _DEFAULT_SECRET


def verify_bearer_token(authorization: str | None) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise PermissionError("Access denied. Authorization token required.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise PermissionError("Access denied. Authorization token required.")
    try:
        decoded = jwt.decode(token, jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise PermissionError("Forbidden: Invalid or expired admin token.") from exc
    return decoded


def require_admin(authorization: str | None) -> dict[str, Any]:
    """
    Verify Bearer JWT and ensure the user is an Active ADMIN in Postgres.
    Returns { userId, email?, adminUser: { id, role, status, firstName, email } }.
    """
    decoded = verify_bearer_token(authorization)
    user_id = decoded.get("userId") or decoded.get("id")
    if not user_id:
        raise PermissionError("Invalid user session.")

    row = fetch_one(
        """
        SELECT id, role, status, "firstName", email
        FROM "User"
        WHERE id = %s
        """,
        [user_id],
    )
    if not row:
        raise PermissionError("Invalid user session.")
    if row.get("status") == "Disabled":
        raise PermissionError("Account has been disabled by system administrator.")
    if row.get("role") != "ADMIN":
        raise PermissionError("Access denied. Admin privileges required.")

    return {
        "userId": user_id,
        "email": decoded.get("email") or row.get("email"),
        "adminUser": {
            "id": row["id"],
            "role": row["role"],
            "status": row["status"],
            "firstName": row.get("firstName"),
            "email": row.get("email"),
        },
    }


def require_user(authorization: str | None) -> dict[str, Any]:
    """Verify Bearer JWT for any Active user (Part 3 planning chat)."""
    decoded = verify_bearer_token(authorization)
    user_id = decoded.get("userId") or decoded.get("id")
    if not user_id:
        raise PermissionError("Invalid user session.")
    row = fetch_one(
        """
        SELECT id, role, status, "firstName", email
        FROM "User"
        WHERE id = %s
        """,
        [user_id],
    )
    if not row:
        raise PermissionError("Invalid user session.")
    if row.get("status") == "Disabled":
        raise PermissionError("Account has been disabled by system administrator.")
    return {
        "userId": user_id,
        "email": decoded.get("email") or row.get("email"),
        "user": dict(row),
    }

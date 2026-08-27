"""Admin analytics queries against the GlobeTrotter Postgres catalog."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.db import fetch_all, fetch_one


def _utc_today_bounds() -> tuple[str, str, str]:
    """Return (iso_date, start_iso, end_iso) for the current UTC calendar day."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.date().isoformat(), start.isoformat(), end.isoformat()


def get_today_user_count() -> dict[str, Any]:
    """
    Count users whose createdAt falls on the current UTC calendar day.

    Data source: Prisma model User → table "User".
    """
    day, start_iso, end_iso = _utc_today_bounds()
    row = fetch_one(
        """
        SELECT COUNT(*)::int AS count
        FROM "User"
        WHERE "createdAt" >= %s::timestamptz
          AND "createdAt" < %s::timestamptz
        """,
        [start_iso, end_iso],
    )
    count = int((row or {}).get("count") or 0)
    return {
        "count": count,
        "metric": "users_signed_up_today",
        "day_utc": day,
        "window_start_utc": start_iso,
        "window_end_utc": end_iso,
    }


def get_today_trip_count() -> dict[str, Any]:
    """
    Count trips whose createdAt falls on the current UTC calendar day.

    Data source: Prisma model Trip → table "Trip".
    """
    day, start_iso, end_iso = _utc_today_bounds()
    row = fetch_one(
        """
        SELECT COUNT(*)::int AS count
        FROM "Trip"
        WHERE "createdAt" >= %s::timestamptz
          AND "createdAt" < %s::timestamptz
        """,
        [start_iso, end_iso],
    )
    count = int((row or {}).get("count") or 0)
    return {
        "count": count,
        "metric": "trips_created_today",
        "day_utc": day,
        "window_start_utc": start_iso,
        "window_end_utc": end_iso,
    }


# Mock ARPU (USD) used when no payment/billing tables exist.
_MOCK_ARPU_PER_TRIP_USD = 12.5
_MOCK_SUBSCRIPTION_BASE_USD = {
    "day": 40.0,
    "week": 220.0,
    "month": 900.0,
    "year": 9800.0,
}


def _period_window(period: str) -> tuple[str, datetime, datetime]:
    """
    Normalize period to (label, start_utc, end_utc exclusive).

    Accepted: day | today | week | month | year
    (also last_7_days / last_30_days aliases).
    """
    raw = (period or "month").strip().lower()
    now = datetime.now(timezone.utc)
    end = now
    if raw in ("day", "today"):
        label = "day"
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif raw in ("week", "last_7_days", "7d"):
        label = "week"
        start = now - timedelta(days=7)
    elif raw in ("month", "last_30_days", "30d"):
        label = "month"
        start = now - timedelta(days=30)
    elif raw in ("year", "last_365_days", "365d"):
        label = "year"
        start = now - timedelta(days=365)
    else:
        raise ValueError(
            "period must be one of: day, week, month, year "
            "(aliases: today, last_7_days, last_30_days, last_365_days)"
        )
    return label, start, end


def get_revenue_summary(period: str = "month") -> dict[str, Any]:
    """
    Revenue summary for a period.

    There is no payment system in GlobeTrotter yet, so this returns **mock revenue**
    derived from:
      mock_trip_fees = trips_created_in_period * MOCK_ARPU
      mock_subscriptions = fixed base by period
      total = trip_fees + subscriptions

    Real trip counts still come from Postgres `"Trip"."createdAt"`.
    """
    label, start, end = _period_window(period)
    row = fetch_one(
        """
        SELECT COUNT(*)::int AS trip_count,
               COALESCE(SUM("maxBudget"), 0)::float AS budget_sum
        FROM "Trip"
        WHERE "createdAt" >= %s::timestamptz
          AND "createdAt" < %s::timestamptz
        """,
        [start.isoformat(), end.isoformat()],
    )
    trip_count = int((row or {}).get("trip_count") or 0)
    budget_sum = float((row or {}).get("budget_sum") or 0.0)
    trip_fees = round(trip_count * _MOCK_ARPU_PER_TRIP_USD, 2)
    subscriptions = float(_MOCK_SUBSCRIPTION_BASE_USD[label])
    total = round(trip_fees + subscriptions, 2)

    return {
        "period": label,
        "period_input": period,
        "currency": "USD",
        "is_mock": True,
        "mock_note": (
            "No billing tables exist; trip_fees = trip_count * "
            f"${_MOCK_ARPU_PER_TRIP_USD} ARPU; subscriptions are fixed mock base."
        ),
        "window_start_utc": start.isoformat(),
        "window_end_utc": end.isoformat(),
        "trip_count": trip_count,
        "sum_trip_max_budgets": round(budget_sum, 2),
        "breakdown": {
            "mock_trip_fees": trip_fees,
            "mock_subscriptions": subscriptions,
        },
        "total_revenue": total,
    }


def get_popular_destinations(limit: int = 5) -> dict[str, Any]:
    """
    Top destinations by TripStop selection count (same idea as dashboard regional-selections).

    Joins TripStop → City, groups by city name/country.
    """
    n = max(1, min(int(limit or 5), 50))
    rows = fetch_all(
        """
        SELECT
          c.id AS city_id,
          c.name AS city,
          c.country,
          c.region,
          COUNT(ts.id)::int AS trip_stop_count,
          COUNT(DISTINCT ts."tripId")::int AS trip_count
        FROM "TripStop" ts
        INNER JOIN "City" c ON c.id = ts."cityId"
        GROUP BY c.id, c.name, c.country, c.region
        ORDER BY trip_stop_count DESC, c.name ASC
        LIMIT %s
        """,
        [n],
    )
    destinations = [
        {
            "rank": i + 1,
            "city_id": r["city_id"],
            "city": r["city"],
            "country": r["country"],
            "region": r["region"],
            "trip_stop_count": r["trip_stop_count"],
            "trip_count": r["trip_count"],
        }
        for i, r in enumerate(rows)
    ]
    return {
        "limit": n,
        "count": len(destinations),
        "destinations": destinations,
    }


def get_disabled_users() -> dict[str, Any]:
    """
    List users with status = 'Disabled'.

    Data source: Prisma User.status.
    """
    rows = fetch_all(
        """
        SELECT id, username, email, "firstName", "lastName", role, status,
               "createdAt", "updatedAt"
        FROM "User"
        WHERE status = 'Disabled'
        ORDER BY "updatedAt" DESC
        """
    )
    users = [
        {
            "id": r["id"],
            "username": r["username"],
            "email": r["email"],
            "firstName": r["firstName"],
            "lastName": r["lastName"],
            "role": r["role"],
            "status": r["status"],
            "createdAt": r["createdAt"].isoformat() if r.get("createdAt") else None,
            "updatedAt": r["updatedAt"].isoformat() if r.get("updatedAt") else None,
        }
        for r in rows
    ]
    return {"count": len(users), "users": users}


def flag_suspicious_activity(
    window_hours: int = 24,
    trip_threshold: int = 5,
) -> dict[str, Any]:
    """
    Simple heuristic (NOT a fraud model):

    Flag users who created >= `trip_threshold` trips within the last
    `window_hours` hours. High burst trip-creation is treated as suspicious
    for admin review.

    Documented intentionally as a blunt rule so interviewers know the limits.
    """
    hours = max(1, min(int(window_hours or 24), 168))
    threshold = max(2, min(int(trip_threshold or 5), 100))
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)

    rows = fetch_all(
        """
        SELECT
          u.id AS user_id,
          u.username,
          u.email,
          u.status,
          COUNT(t.id)::int AS trips_in_window,
          MIN(t."createdAt") AS first_trip_at,
          MAX(t."createdAt") AS last_trip_at
        FROM "Trip" t
        INNER JOIN "User" u ON u.id = t."userId"
        WHERE t."createdAt" >= %s::timestamptz
          AND t."createdAt" < %s::timestamptz
        GROUP BY u.id, u.username, u.email, u.status
        HAVING COUNT(t.id) >= %s
        ORDER BY trips_in_window DESC
        """,
        [start.isoformat(), now.isoformat(), threshold],
    )

    flagged = [
        {
            "user_id": r["user_id"],
            "username": r["username"],
            "email": r["email"],
            "status": r["status"],
            "trips_in_window": r["trips_in_window"],
            "first_trip_at": r["first_trip_at"].isoformat() if r.get("first_trip_at") else None,
            "last_trip_at": r["last_trip_at"].isoformat() if r.get("last_trip_at") else None,
            "reason": (
                f"Created {r['trips_in_window']} trips in {hours}h "
                f"(threshold >= {threshold})"
            ),
        }
        for r in rows
    ]
    return {
        "heuristic": "high_trip_creation_rate",
        "window_hours": hours,
        "trip_threshold": threshold,
        "window_start_utc": start.isoformat(),
        "window_end_utc": now.isoformat(),
        "flagged_count": len(flagged),
        "flagged_users": flagged,
        "disclaimer": (
            "Simple rate heuristic only — not a real fraud detector. "
            "False positives expected for power users / demos."
        ),
    }


def get_community_engagement_stats() -> dict[str, Any]:
    """
    Community likes/comments totals and simple day-over-day trend.

    Data: CommunityPost.likesCount sum, PostComment counts, posts created
    today vs yesterday (UTC).
    """
    day, start_today, end_today = _utc_today_bounds()
    start_today_dt = datetime.fromisoformat(start_today)
    start_yesterday = (start_today_dt - timedelta(days=1)).isoformat()

    totals = fetch_one(
        """
        SELECT
          (SELECT COUNT(*)::int FROM "CommunityPost") AS posts_total,
          (SELECT COALESCE(SUM("likesCount"), 0)::int FROM "CommunityPost") AS likes_total,
          (SELECT COUNT(*)::int FROM "PostComment") AS comments_total
        """
    ) or {}

    today_row = fetch_one(
        """
        SELECT
          (SELECT COUNT(*)::int FROM "CommunityPost"
             WHERE "createdAt" >= %s::timestamptz AND "createdAt" < %s::timestamptz) AS posts_today,
          (SELECT COALESCE(SUM("likesCount"), 0)::int FROM "CommunityPost"
             WHERE "createdAt" >= %s::timestamptz AND "createdAt" < %s::timestamptz) AS likes_on_posts_created_today,
          (SELECT COUNT(*)::int FROM "PostComment"
             WHERE "createdAt" >= %s::timestamptz AND "createdAt" < %s::timestamptz) AS comments_today
        """,
        [start_today, end_today, start_today, end_today, start_today, end_today],
    ) or {}

    yesterday_row = fetch_one(
        """
        SELECT
          (SELECT COUNT(*)::int FROM "CommunityPost"
             WHERE "createdAt" >= %s::timestamptz AND "createdAt" < %s::timestamptz) AS posts_yesterday,
          (SELECT COUNT(*)::int FROM "PostComment"
             WHERE "createdAt" >= %s::timestamptz AND "createdAt" < %s::timestamptz) AS comments_yesterday
        """,
        [start_yesterday, start_today, start_yesterday, start_today],
    ) or {}

    posts_today = int(today_row.get("posts_today") or 0)
    posts_yesterday = int(yesterday_row.get("posts_yesterday") or 0)
    comments_today = int(today_row.get("comments_today") or 0)
    comments_yesterday = int(yesterday_row.get("comments_yesterday") or 0)

    def _delta(today_v: int, yesterday_v: int) -> dict[str, Any]:
        change = today_v - yesterday_v
        if yesterday_v == 0:
            pct = None if today_v == 0 else 100.0
        else:
            pct = round((change / yesterday_v) * 100.0, 1)
        trend = "flat" if change == 0 else ("up" if change > 0 else "down")
        return {"change": change, "pct_vs_yesterday": pct, "trend": trend}

    return {
        "day_utc": day,
        "totals": {
            "posts": int(totals.get("posts_total") or 0),
            "likes": int(totals.get("likes_total") or 0),
            "comments": int(totals.get("comments_total") or 0),
        },
        "today": {
            "posts_created": posts_today,
            "likes_on_posts_created_today": int(
                today_row.get("likes_on_posts_created_today") or 0
            ),
            "comments_created": comments_today,
        },
        "yesterday": {
            "posts_created": posts_yesterday,
            "comments_created": comments_yesterday,
        },
        "trends": {
            "posts": _delta(posts_today, posts_yesterday),
            "comments": _delta(comments_today, comments_yesterday),
        },
    }

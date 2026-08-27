"""MCP server registration for GlobeTrotter travel tools."""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import MCPServer

from app.services import actions as actions_service
from app.services import activities as activities_service
from app.services import alternatives as alternatives_service
from app.services import analytics as analytics_service
from app.services import budget as budget_service
from app.services import cities as cities_service
from app.services import gemini as gemini_service
from app.services import planning as planning_service

mcp = MCPServer(
    name="globetrotter-mcp",
    instructions=(
        "GlobeTrotter travel planning and admin analytics tools. "
        "Planning: search_cities → generate_itinerary → check_budget → "
        "suggest_alternatives. Admin: get_today_user_count, get_today_trip_count, …"
    ),
)


@mcp.tool(
    name="search_cities",
    description=(
        "Search the GlobeTrotter city catalog by free-text query and optional region. "
        "Returns matching cities (id, name, country, region, and metadata)."
    ),
)
def search_cities(query: str = "", region: str = "") -> dict[str, Any]:
    """MCP tool: search destination cities."""
    results = cities_service.search_cities(query=query, region=region)
    return {
        "count": len(results),
        "query": query or "",
        "region": region or "",
        "cities": results,
    }


@mcp.tool(
    name="generate_itinerary",
    description=(
        "Generate a realistic day-by-day travel itinerary for a destination using Gemini. "
        "Pass dates as {start, end} ISO dates (or startDate/endDate), budget as USD number, "
        "optional interests, and optional constraints (from suggest_alternatives) for re-plans."
    ),
)
async def generate_itinerary(
    destination: str,
    dates: dict[str, Any] | str,
    budget: float,
    interests: str = "",
    constraints: str = "",
) -> dict[str, Any]:
    """MCP tool: generate itinerary via Gemini."""
    return await gemini_service.generate_itinerary(
        destination=destination,
        dates=dates,
        budget=budget,
        interests=interests,
        constraints=constraints,
    )


@mcp.tool(
    name="check_budget",
    description=(
        "Validate an itinerary against max_budget by summing day budget fields. "
        "Returns passed (bool), estimated_total, overage_amount, and per-day totals."
    ),
)
def check_budget(itinerary: list[dict[str, Any]] | dict[str, Any], max_budget: float) -> dict[str, Any]:
    """MCP tool: budget gate for the re-plan loop."""
    return budget_service.check_budget(itinerary=itinerary, max_budget=max_budget)


@mcp.tool(
    name="search_activities",
    description=(
        "Search the activity catalog by city, category, and cost_type "
        "(Free, $, $$, $$$). Mirrors GET /api/activities filters."
    ),
)
def search_activities(
    city: str = "",
    category: str = "",
    cost_type: str = "",
) -> dict[str, Any]:
    """MCP tool: browse/search activities."""
    results = activities_service.search_activities(
        city=city,
        category=category,
        cost_type=cost_type,
    )
    return {
        "count": len(results),
        "city": city or "",
        "category": category or "",
        "cost_type": cost_type or "",
        "activities": results,
    }


@mcp.tool(
    name="suggest_alternatives",
    description=(
        "When check_budget fails, suggest specific cheaper swaps for the itinerary "
        "to recover roughly overage_amount USD. Optional city and max_budget improve grounding."
    ),
)
async def suggest_alternatives(
    itinerary: list[dict[str, Any]] | dict[str, Any],
    overage_amount: float,
    city: str = "",
    max_budget: float | None = None,
) -> dict[str, Any]:
    """MCP tool: cheaper swap suggestions."""
    return await alternatives_service.suggest_alternatives(
        itinerary=itinerary,
        overage_amount=overage_amount,
        city=city,
        max_budget=max_budget,
    )


@mcp.tool(
    name="get_today_user_count",
    description=(
        "Admin analytics: count how many users signed up today (UTC calendar day). "
        "No parameters. Returns count plus the UTC day window used."
    ),
)
def get_today_user_count() -> dict[str, Any]:
    """MCP tool: users created today (UTC)."""
    return analytics_service.get_today_user_count()


@mcp.tool(
    name="get_today_trip_count",
    description=(
        "Admin analytics: count how many trips were created today (UTC calendar day). "
        "No parameters. Returns count plus the UTC day window used."
    ),
)
def get_today_trip_count() -> dict[str, Any]:
    """MCP tool: trips created today (UTC)."""
    return analytics_service.get_today_trip_count()


@mcp.tool(
    name="get_revenue_summary",
    description=(
        "Admin analytics: revenue summary for a period (day|week|month|year). "
        "Returns MOCK revenue (no payment system yet) plus real trip_count in the window. "
        "Flag is_mock=true always until billing exists."
    ),
)
def get_revenue_summary(period: str = "month") -> dict[str, Any]:
    """MCP tool: mock revenue summary for a period."""
    return analytics_service.get_revenue_summary(period=period)


@mcp.tool(
    name="get_popular_destinations",
    description=(
        "Admin analytics: top destinations by trip-stop count (TripStop→City), "
        "same idea as dashboard regional selections. Optional limit (default 5, max 50)."
    ),
)
def get_popular_destinations(limit: int = 5) -> dict[str, Any]:
    """MCP tool: top destinations by trip volume."""
    return analytics_service.get_popular_destinations(limit=limit)


@mcp.tool(
    name="get_disabled_users",
    description=(
        "Admin analytics: list users with status=Disabled "
        "(id, username, email, names, role, timestamps). No parameters."
    ),
)
def get_disabled_users() -> dict[str, Any]:
    """MCP tool: disabled user accounts."""
    return analytics_service.get_disabled_users()


@mcp.tool(
    name="flag_suspicious_activity",
    description=(
        "Admin analytics: simple heuristic — flag users who created many trips "
        "in a short window (default >=5 trips in 24h). NOT a real fraud model. "
        "Optional window_hours and trip_threshold."
    ),
)
def flag_suspicious_activity(window_hours: int = 24, trip_threshold: int = 5) -> dict[str, Any]:
    """MCP tool: burst trip-creation heuristic."""
    return analytics_service.flag_suspicious_activity(
        window_hours=window_hours,
        trip_threshold=trip_threshold,
    )


@mcp.tool(
    name="get_community_engagement_stats",
    description=(
        "Admin analytics: community likes/comments totals plus today vs yesterday "
        "post/comment trends (UTC). No parameters."
    ),
)
def get_community_engagement_stats() -> dict[str, Any]:
    """MCP tool: community engagement totals and trends."""
    return analytics_service.get_community_engagement_stats()


@mcp.tool(
    name="check_weather_for_trip",
    description=(
        "User planning: forecast summary for a destination and date range via Open-Meteo "
        "(no API key). Pass destination string and dates {start,end} or 'YYYY-MM-DD to YYYY-MM-DD'."
    ),
)
async def check_weather_for_trip(destination: str, dates: dict[str, Any] | str) -> dict[str, Any]:
    """MCP tool: Open-Meteo weather summary."""
    return await planning_service.check_weather_for_trip(destination=destination, dates=dates)


@mcp.tool(
    name="compare_destinations",
    description=(
        "User planning: compare two cities for a budget — estimated cost, popular activities, "
        "and near-term weather suitability. Useful for 'Paris or Rome?' questions."
    ),
)
async def compare_destinations(city_a: str, city_b: str, budget: float) -> dict[str, Any]:
    """MCP tool: structured destination comparison."""
    return await planning_service.compare_destinations(
        city_a=city_a, city_b=city_b, budget=budget
    )


@mcp.tool(
    name="optimize_itinerary_order",
    description=(
        "User planning: reorder a day's activities by geographic nearest-neighbor, "
        "or reorder day-section descriptions for arrival→activities→departure flow."
    ),
)
def optimize_itinerary_order(itinerary: list[dict[str, Any]] | dict[str, Any]) -> dict[str, Any]:
    """MCP tool: reorder itinerary for better flow."""
    return planning_service.optimize_itinerary_order(itinerary=itinerary)


@mcp.tool(
    name="find_similar_trips",
    description=(
        "User planning: find other users' trips similar to this user's past destinations/"
        "interests (token Jaccard; no vector DB). Requires user_id; optional limit."
    ),
)
def find_similar_trips(user_id: str, limit: int = 5) -> dict[str, Any]:
    """MCP tool: similar past trips for a user."""
    return planning_service.find_similar_trips(user_id=user_id, limit=limit)


@mcp.tool(
    name="export_trip_pdf",
    description=(
        "Action: generate a PDF of a trip itinerary. Requires trip_id. "
        "Returns local path and download_url under /exports/."
    ),
)
def export_trip_pdf(trip_id: str) -> dict[str, Any]:
    """MCP tool: export itinerary PDF."""
    return actions_service.export_trip_pdf(trip_id=trip_id)


@mcp.tool(
    name="send_trip_reminder_email",
    description=(
        "Action: email the trip owner a reminder with itinerary link. Requires trip_id. "
        "Uses SMTP_* env (same as Node). Pass dry_run=true to preview without sending."
    ),
)
def send_trip_reminder_email(trip_id: str, dry_run: bool = False) -> dict[str, Any]:
    """MCP tool: send trip reminder email."""
    return actions_service.send_trip_reminder_email(trip_id=trip_id, dry_run=dry_run)

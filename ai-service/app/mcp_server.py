"""MCP server registration for GlobeTrotter travel tools."""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import MCPServer

from app.services import activities as activities_service
from app.services import alternatives as alternatives_service
from app.services import budget as budget_service
from app.services import cities as cities_service
from app.services import gemini as gemini_service

mcp = MCPServer(
    name="globetrotter-mcp",
    instructions=(
        "GlobeTrotter travel planning tools. Typical flow: search_cities → "
        "generate_itinerary → check_budget → if over budget, suggest_alternatives "
        "then regenerate with constraints. search_activities helps find cheaper options."
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

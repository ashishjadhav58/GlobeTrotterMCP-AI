"""
FastAPI entrypoint for the GlobeTrotter AI service.

Exposes:
  - GET  /health
  - POST /plan-trip  (agentic re-plan loop + tool-call trace)
  - MCP  /mcp        (all travel tools)
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import __version__
from app.agent.admin_chat import run_admin_chat
from app.agent.replan import plan_trip
from app.auth import require_admin
from app.mcp_server import mcp
from pathlib import Path

# Build the Streamable HTTP ASGI app (MCP endpoint path="/" under the /mcp mount).
mcp_http = mcp.streamable_http_app(
    streamable_http_path="/",
    stateless_http=True,
    json_response=True,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(
    title="GlobeTrotter AI Service",
    description="MCP-based agentic travel planning layer (Python) alongside the Node Express API.",
    version=__version__,
    lifespan=lifespan,
)


class PlanTripRequest(BaseModel):
    """Same conceptual inputs createTrip uses (plus optional agent controls)."""

    name: str = ""
    destination: str = Field(
        default="",
        description="City/country string, e.g. 'London, United Kingdom'",
    )
    location: str = Field(
        default="",
        description="Alias for destination (Node may send location)",
    )
    startDate: str
    endDate: str
    maxBudget: float = Field(..., gt=0)
    description: str = ""
    interests: str = ""
    maxAttempts: int | None = Field(default=None, ge=1, le=5)
    includeExpenses: bool = True


class AdminChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: list[dict[str, str]] = Field(default_factory=list)
    maxRounds: int | None = Field(default=6, ge=1, le=10)


@app.get("/health")
async def health() -> JSONResponse:
    tools = await mcp.list_tools()
    return JSONResponse(
        {
            "status": "ok",
            "service": "globetrotter-ai",
            "version": __version__,
            "mcp_tools": [t.name for t in tools],
        }
    )


@app.post("/plan-trip")
async def plan_trip_endpoint(body: PlanTripRequest) -> dict[str, Any]:
    destination = (body.destination or body.location or "").strip()
    if not destination:
        raise HTTPException(
            status_code=400,
            detail="destination (or location) is required",
        )
    try:
        return await plan_trip(
            destination=destination,
            start_date=body.startDate,
            end_date=body.endDate,
            max_budget=body.maxBudget,
            interests=body.interests,
            name=body.name,
            description=body.description,
            max_attempts=body.maxAttempts,
            include_expenses=body.includeExpenses,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        import logging
        import traceback

        logging.getLogger("uvicorn.error").error(
            "plan-trip failed: %s\n%s", exc, traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/admin/chat")
async def admin_chat_endpoint(
    body: AdminChatRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    LLM-driven admin analytics chat (Gemini function calling → MCP admin tools).
    Requires Bearer JWT for an Active ADMIN user (same rules as Node adminAuth).
    """
    try:
        admin = require_admin(authorization)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    try:
        result = await run_admin_chat(
            body.message,
            history=body.history,
            max_rounds=body.maxRounds or 6,
        )
        result["admin"] = {
            "id": admin["adminUser"]["id"],
            "email": admin["adminUser"].get("email"),
            "firstName": admin["adminUser"].get("firstName"),
        }
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        import logging
        import traceback

        logging.getLogger("uvicorn.error").error(
            "admin-chat failed: %s\n%s", exc, traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


_exports = Path(__file__).resolve().parent.parent / "exports"
_exports.mkdir(parents=True, exist_ok=True)
app.mount("/exports", StaticFiles(directory=str(_exports)), name="exports")

app.mount("/mcp", mcp_http)


def run() -> None:
    import uvicorn

    from app.config import settings

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()

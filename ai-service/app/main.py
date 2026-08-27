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
from app.agent.user_chat import run_user_plan_chat
from app.auth import require_admin, require_user
from app.mcp_server import mcp
from app.services import sessions as session_store
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


class UserPlanChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    sessionId: str | None = None
    maxRounds: int | None = Field(default=8, ge=1, le=12)
    coverImageUrl: str | None = None


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


@app.get("/chat/sessions")
async def list_chat_sessions(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        identity = require_user(authorization)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    sessions = session_store.list_sessions(identity["userId"])
    return {"sessions": sessions}


@app.get("/chat/sessions/{session_id}")
async def get_chat_session(
    session_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        identity = require_user(authorization)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    session = session_store.get_session(session_id, identity["userId"])
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    return {
        "session_id": session["id"],
        "messages": session.get("messages") or [],
        "agent_state": session.get("agent_state") or {},
        "createdAt": session.get("createdAt"),
        "updatedAt": session.get("updatedAt"),
    }


@app.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        identity = require_user(authorization)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    ok = session_store.delete_session(session_id, identity["userId"])
    if not ok:
        raise HTTPException(status_code=404, detail="session not found")
    return {"deleted": True, "session_id": session_id}


@app.post("/chat/plan-trip")
async def user_plan_chat_endpoint(
    body: UserPlanChatRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Multi-turn user planning chat (Gemini function calling + slot filling + ChatSession).
    Requires Bearer JWT for an Active user.
    """
    try:
        identity = require_user(authorization)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    try:
        return await run_user_plan_chat(
            body.message,
            user_id=identity["userId"],
            session_id=body.sessionId,
            max_rounds=body.maxRounds or 8,
            cover_image_url=body.coverImageUrl,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        import logging
        import traceback

        logging.getLogger("uvicorn.error").error(
            "user-plan-chat failed: %s\n%s", exc, traceback.format_exc()
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

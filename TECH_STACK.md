# GlobeTrotterMCP-AI — Technology stack (Q&A)

Interview-style notes for every major technology in this repo. Entries are added as features land. **Pinecone is not used** in this project today (no embeddings/vector DB path yet).

---

## Python

### What is it?
Python is a general-purpose programming language widely used for APIs, data work, and AI tooling. It has a large ecosystem of libraries for HTTP services and for talking to LLM / protocol SDKs.

### Why did we use it here?
The agentic MCP layer is a **separate service** alongside the existing Node Express backend. Python is the primary language of the official MCP SDK ecosystem we are using, so the AI/MCP service lives in `ai-service/` without rewriting trip CRUD in Node.

### How does it work?
CPython runs our FastAPI app and MCP tool functions. We use a virtualenv (`ai-service/.venv`), `requirements.txt` for deps, and `python-dotenv` to load `GEMINI_API_KEY` / `DATABASE_URL` (including fallback load from `backend/.env`).

### Example
```python
# ai-service/app/config.py
load_dotenv(_AI_ROOT / ".env")
if _BACKEND_ENV.exists():
    load_dotenv(_BACKEND_ENV, override=False)
```

### Behavior / gotchas
- Run commands from `ai-service/` so `app` imports resolve (or set `PYTHONPATH=.`).
- Don’t commit `.venv/` or `.env`. On Windows, activate with `.\.venv\Scripts\Activate.ps1`.

---

## FastAPI

### What is it?
FastAPI is a Python web framework for building HTTP APIs. It uses type hints for validation/docs and runs on an ASGI server such as Uvicorn.

### Why did we use it here?
We need a small HTTP surface the Node backend can call later (`POST /plan-trip`) plus a health check, while mounting the MCP Streamable HTTP transport on the same process.

### How does it work?
`app/main.py` creates a FastAPI app with a lifespan that starts the MCP session manager, serves `GET /health`, and mounts the MCP ASGI app at `/mcp`.

### Example
```python
# ai-service/app/main.py
@app.get("/health")
async def health() -> JSONResponse:
    tools = await mcp.list_tools()
    return JSONResponse({
        "status": "ok",
        "mcp_tools": [t.name for t in tools],
    })

app.mount("/mcp", mcp_http)
```

### Behavior / gotchas
- Mounting MCP under `/mcp` with `streamable_http_path="/"` makes the MCP endpoint `http://host:8000/mcp` (avoid double `/mcp/mcp`).
- Lifespan must run `mcp.session_manager.run()` or Streamable HTTP sessions won’t start correctly.

---

## MCP Python SDK (`mcp` / `MCPServer`)

### What is it?
The official Model Context Protocol Python SDK. It lets you expose **tools** (and resources/prompts) to any MCP-compatible client over stdio or Streamable HTTP.

### Why did we use it here?
So itinerary planning steps are real, discoverable tools — not one opaque Gemini prompt — and so an agent can call them in a loop with a clear tool-call trace.

### How does it work?
We create an `MCPServer`, decorate functions with `@mcp.tool()`, and serve them via `streamable_http_app(...)`. In MCP 2.x the old `FastMCP` name is **`MCPServer`** (`from mcp.server.mcpserver import MCPServer`).

### Example
```python
# ai-service/app/mcp_server.py
from mcp.server.mcpserver import MCPServer

mcp = MCPServer(name="globetrotter-mcp", instructions="...")

@mcp.tool(name="search_cities", description="Search the city catalog...")
def search_cities(query: str = "", region: str = "") -> dict:
    ...
```

### Behavior / gotchas
- Pin awareness: `mcp` 2.x renamed FastMCP → MCPServer; tutorials for `mcp.server.fastmcp` need the migration path or `mcp<2`.
- Tool return values should be JSON-serializable; we return `dict` payloads for structured results.
- In-process testing: `await mcp.call_tool("search_cities", {...})` without standing up HTTP.

---

## Google Gemini

### What is it?
Google’s family of large language models, reachable over the Generative Language REST API (`generateContent`).

### Why did we use it here?
The Node backend already generates itineraries/expenses with Gemini. The Python `generate_itinerary` tool reuses the same key (`GEMINI_API_KEY`) and the same “JSON array of days” contract so behavior stays aligned.

### How does it work?
We POST a prompt with `responseMimeType: application/json`, try a primary model then a fallback, parse/repair the JSON array, and normalize fields (`title`, `description`, `startDate`, `endDate`, `budget`).

### Example
```python
# ai-service/app/services/gemini.py
response = await client.post(
    url,
    json={
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    },
)
```

### Behavior / gotchas
- Models and quotas change; we keep an ordered fallback list like the Node controller.
- Always validate/normalize model JSON — LLMs occasionally wrap arrays in objects or markdown fences (`extract_json_array`).
- Never commit `GEMINI_API_KEY`.

---

## PostgreSQL (+ Prisma City catalog)

### What is it?
PostgreSQL is the relational database. Prisma is the Node ORM that owns schema/migrations for GlobeTrotter.

### Why did we use it here?
`search_cities` must wrap the **existing** destination catalog. Reading the `"City"` table with the same `DATABASE_URL` gives the MCP tool the same source of truth as `tripController.getCities` without requiring a user JWT for server-to-server tool calls.

### How does it work?
`psycopg` runs a parameterized `SELECT` with optional `ILIKE` filters on name/country/region, ordered by name, capped at 50 rows.

### Example
```python
# ai-service/app/services/cities.py
cur.execute(sql, params)  # FROM "City" ... ORDER BY name ASC LIMIT 50
```

### Behavior / gotchas
- Prisma model `City` maps to quoted table `"City"` — wrong casing fails silently/empty.
- Prefer HTTP to Node later if city create/update side effects must stay on Express; Step 1 is read-only catalog search.

---

## Agentic re-plan loop (MCP client)

### What is it?
An **agentic loop** is code that repeatedly calls tools (and sometimes an LLM) until a goal is met or a limit is hit. Here the goal is “itinerary whose day budgets pass `check_budget`.”

### Why did we use it here?
Single-shot Gemini often drifts over budget. Separating generate → check → suggest → regenerate makes budget a hard gate and produces an auditable `tool_call_trace` for debugging and interviews.

### How does it work?
`app/agent/replan.py` acts as an MCP **client** against our own `MCPServer` via `mcp.call_tool`. It records every step, stops early on pass, otherwise feeds `constraints_for_regen` into the next `generate_itinerary`. `POST /plan-trip` exposes the loop to Node (Step 3 wiring).

### Example
```python
# ai-service/app/agent/replan.py
generated = await _call_tool("generate_itinerary", gen_args, trace)
budget_result = await _call_tool(
    "check_budget",
    {"itinerary": days, "max_budget": float(max_budget)},
    trace,
)
if budget_result.get("passed"):
    break
alternatives = await _call_tool("suggest_alternatives", {...}, trace)
constraints = alternatives.get("constraints_for_regen")
```

### Behavior / gotchas
- Bound attempts with `MAX_REPLAN_ATTEMPTS` — never unbounded repair.
- First-pass plans often already pass; force a tiny `maxBudget` in tests to exercise `suggest_alternatives`.
- `generate_expenses` is a helper recorded in the trace, not a separate MCP tool (keeps the public tool list aligned with the product prompt).

---

## Activity search (Postgres `"Activity"`)

### What is it?
Catalog of things to do (title, category, cost type, city name) stored alongside trips.

### Why did we use it here?
`search_activities` and `suggest_alternatives` ground cheaper swaps in inventory when rows exist for that city — same filters as Express `GET /api/activities`.

### How does it work?
Parameterized SQL on `"Activity"` with optional city / category / `costType` filters, ordered by popularity and rating.

### Example
```python
# ai-service/app/services/activities.py
search_activities(city="London", category="", cost_type="$")
```

### Behavior / gotchas
- Empty catalog for a city is OK — alternatives fall back to Gemini-only swaps (`catalog_options_considered: 0`).
- `cityName` matching is `ILIKE` contains; inconsistent seed names reduce hits.

---

## Still to document (as we wire them)

Next.js, Prisma (full), JWT auth, Pinecone (only if introduced).

---

## Express (Node backend)

### What is it?
Express is a minimal Node.js HTTP framework for routes, middleware, and JSON APIs.

### Why did we use it here?
It already owns auth, trip CRUD, and Prisma. We keep that surface and only swap itinerary generation to the Python AI service.

### How does it work?
`createTrip` validates input, resolves city/cover image, calls `aiService.planTrip()`, then `prisma.trip.create` + optional `tripStop`.

### Example
```js
// backend/services/aiService.js
const response = await fetch(`${aiServiceBaseUrl()}/plan-trip`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

### Behavior / gotchas
- AI service must be running or createTrip fails with a clear unreachable error.
- Itinerary/expenses are still stored as stringified JSON for frontend compatibility.
- `toolCallTrace` is returned to the client but not persisted (no schema field yet).

---

## Node ↔ Python integration

### What is it?
An internal HTTP boundary: Express (product API) → FastAPI (agentic planner).

### Why did we use it here?
Keeps MCP/Python AI isolated so we did not rewrite the Node backend, while still giving one place (`/plan-trip`) for the re-plan loop and trace.

### How does it work?
`AI_SERVICE_URL` points at the Python service. Timeouts default to 180s because multi-attempt Gemini loops are slow.

### Example
```js
// backend/controllers/tripController.js
const planned = await aiService.planTrip({
  name: name.trim(),
  destination: resolvedLocation,
  startDate, endDate,
  maxBudget: parsedBudget,
  includeExpenses: true,
});
itinerary = planned.itinerary;
expenses = planned.expenses;
```

### Behavior / gotchas
- Run three processes locally: `ai-service`, `backend`, `frontend`.
- `GEMINI_API_KEY` lives with the Python service (and shared via `backend/.env` load); Node no longer calls Gemini for trips.

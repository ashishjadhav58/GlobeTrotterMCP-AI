# MCP_AGENT_GUIDE.md

Theory + implementation guide for the GlobeTrotter MCP server, tools, and chat agents.

> Interview-ready: beginner theory → tool catalog → agents → tradeoffs → setup.

---

## Section 1: Beginner theory

### What is MCP?

**Model Context Protocol (MCP)** is a standard way for an LLM host to discover and call **tools** (and resources/prompts) exposed by a **server**. In GlobeTrotter:

| Role | Who | Job |
|------|-----|-----|
| **MCP server** | Python `ai-service` (`app/mcp_server.py`) | Registers tools (`search_cities`, admin analytics, …) with JSON schemas |
| **MCP client / agent** | Re-plan loop, admin chat, user chat | Asks the model what to call, then runs `mcp.call_tool` |
| **Host app** | Next.js + Express | Auth, trip CRUD UI; proxies chat/`plan-trip` to Python |

Tools are **not** hardcoded if/else trees in the chat agents. The model sees tool schemas and chooses names + arguments (function calling).

### Agent vs single LLM call

| Pattern | Behavior |
|---------|----------|
| **One-shot LLM** | Prompt → text. No DB lookups unless you stuffed data into the prompt. |
| **Tool-using agent** | Prompt + tools → model may request tool calls → you execute → feed results back → model answers (possibly more tools). |
| **Re-plan loop** (`POST /plan-trip`) | Deterministic outer loop: generate → check budget → maybe alternatives → regenerate. Tools are still MCP; the *order* is coded. |
| **Chat agents** | Soft policy in the system prompt + whitelist; Gemini decides which tools and when. |

### Slot filling

**Slot filling** means: do not invent missing trip fields. Required slots before `generate_itinerary`:

1. Destination  
2. Start date  
3. End date  
4. Budget (USD number for tools; ₹ is converted ≈ ÷83)

If any slot is missing, the user planning agent asks a clarifying question and **must not** call `generate_itinerary` yet.

### Why a separate Python service?

- Official MCP SDK and Gemini/Groq tooling fit Python cleanly.  
- Node keeps Prisma CRUD, JWT, and the existing trip API.  
- One process mounts HTTP (`/plan-trip`, `/admin/chat`, `/chat/plan-trip`) and `/mcp`.

---

## Section 2: How each tool works

### Original planning tools (summary)

| Tool | Purpose | Location |
|------|---------|----------|
| `search_cities` | Filter destination catalog | `app/services/cities.py` |
| `generate_itinerary` | Day-by-day plan via LLM | `app/services/gemini.py` |
| `check_budget` | Sum day budgets vs max | `app/services/budget.py` |
| `search_activities` | Filter activity catalog | `app/services/activities.py` |
| `suggest_alternatives` | Cheaper swaps when over budget | `app/services/alternatives.py` |

Full schemas for these are also listed via `GET /health` → `mcp_tools` and MCP `list_tools`.

---

### `get_today_user_count`

**Purpose:** Count users who signed up on the current UTC calendar day (admin analytics).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | None |
| **Returns** | `{ count: int, metric: "users_signed_up_today", day_utc, window_start_utc, window_end_utc }` |

**Data source:** PostgreSQL table `"User"` (Prisma `User.createdAt`). Window is `[UTC midnight today, UTC midnight tomorrow)`.

**Location**

- Service: `ai-service/app/services/analytics.py` → `get_today_user_count()`
- MCP registration: `ai-service/app/mcp_server.py` → `@mcp.tool(name="get_today_user_count")`
- Shared DB helper: `ai-service/app/services/db.py`

**Gotchas:** “Today” is **UTC**, not the admin’s browser timezone. If Neon stores timestamps with TZ, the cast to `timestamptz` bounds keeps the window stable.

---

### `get_today_trip_count`

**Purpose:** Count trips created on the current UTC calendar day (admin analytics).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | None |
| **Returns** | `{ count: int, metric: "trips_created_today", day_utc, window_start_utc, window_end_utc }` |

**Data source:** PostgreSQL table `"Trip"` (Prisma `Trip.createdAt`). Same UTC day window as user count.

**Location**

- Service: `ai-service/app/services/analytics.py` → `get_today_trip_count()`
- MCP registration: `ai-service/app/mcp_server.py` → `@mcp.tool(name="get_today_trip_count")`

**Gotchas:** Counts trip **rows created today**, not trips whose travel `startDate` is today.

---

### `get_revenue_summary`

**Purpose:** Admin revenue summary for a time period (day / week / month / year).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `period: str` — `day` \| `week` \| `month` \| `year` (aliases: `today`, `last_7_days`, `last_30_days`, …) |
| **Returns** | `{ period, currency, is_mock, trip_count, breakdown: { mock_trip_fees, mock_subscriptions }, total_revenue, window_*, mock_note, … }` |

**Data source:** Real `"Trip"` counts/`maxBudget` sum for the window; **mock money** because GlobeTrotter has no payment tables yet (`is_mock: true`). Formula: `trip_count * $12.5 ARPU + fixed subscription base`.

**Location**

- Service: `ai-service/app/services/analytics.py` → `get_revenue_summary()`
- MCP: `app/mcp_server.py` → `get_revenue_summary`

**Gotchas:** Do not present totals as real billing in production demos without calling out `is_mock`. Replace breakdown with Stripe/etc. later without changing the tool name.

---

### `get_popular_destinations`

**Purpose:** Top destinations by how often they appear as trip stops.

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `limit: int` (default 5, max 50) |
| **Returns** | `{ limit, count, destinations: [{ rank, city_id, city, country, region, trip_stop_count, trip_count }] }` |

**Data source:** `"TripStop"` ⋈ `"City"`, ordered by stop count (same idea as Express dashboard regional-selections).

**Location**

- Service: `ai-service/app/services/analytics.py` → `get_popular_destinations()`
- MCP: `app/mcp_server.py` → `get_popular_destinations`

**Gotchas:** Empty catalog / no stops ⇒ empty `destinations` list (not an error).

---

### `get_disabled_users`

**Purpose:** List accounts with `status = Disabled` for admin review.

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | None |
| **Returns** | `{ count, users: [{ id, username, email, firstName, lastName, role, status, createdAt, updatedAt }] }` |

**Data source:** `"User"` where `status = 'Disabled'` (matches admin panel toggle).

**Location:** `analytics.py` → `get_disabled_users()` / MCP `get_disabled_users`

---

### `flag_suspicious_activity`

**Purpose:** Flag users with unusually high trip-creation rate in a short window.

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `window_hours: int` (default 24, max 168), `trip_threshold: int` (default 5) |
| **Returns** | `{ heuristic, window_*, trip_threshold, flagged_count, flagged_users[], disclaimer }` |

**Data source:** `"Trip"` grouped by `"User"` in the time window; `HAVING COUNT(*) >= threshold`.

**Heuristic (documented):** ≥ N trips in H hours ⇒ flagged. **Not a fraud model** — expect false positives on demos/power users (`disclaimer` field).

**Location:** `analytics.py` → `flag_suspicious_activity()` / MCP `flag_suspicious_activity`

---

### `get_community_engagement_stats`

**Purpose:** Community likes/comments totals and today-vs-yesterday trends (UTC).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | None |
| **Returns** | `{ day_utc, totals: { posts, likes, comments }, today, yesterday, trends: { posts, comments } }` |

**Data source:** `"CommunityPost"` (`likesCount`, `createdAt`) and `"PostComment"`.

**Location:** `analytics.py` → `get_community_engagement_stats()` / MCP `get_community_engagement_stats`

**Gotchas:** `likes_on_posts_created_today` sums likes on posts **created** today (not likes clicked today — no like-event table).

---

### `check_weather_for_trip`

**Purpose:** Forecast summary for a destination + date range (user planning).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `destination: str`, `dates: {start,end}` or `'YYYY-MM-DD to YYYY-MM-DD'` |
| **Returns** | `{ resolved, summary: { avg_high_c, avg_low_c, avg_precip_probability, suitability }, daily[], source: "Open-Meteo", … }` |

**Data source:** Open-Meteo Geocoding + Forecast APIs (free, no key).

**Location:** `ai-service/app/services/planning.py` → `check_weather_for_trip` / MCP same name

**Gotchas:** Free forecast horizon ~16 days; farther dates return `available: false`.

---

### `compare_destinations`

**Purpose:** Side-by-side comparison of two cities for a budget (cost / activities / weather).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `city_a`, `city_b`, `budget` (USD number) |
| **Returns** | `{ city_a, city_b, budget_usd, recommendation: { preferred, reason } }` |

**Data source:** `"City"` / `"Activity"` catalogs + Open-Meteo via `check_weather_for_trip`.

**Location:** `planning.py` → `compare_destinations`

---

### `optimize_itinerary_order`

**Purpose:** Reorder activities for geographic proximity or day-section logical flow.

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `itinerary` — activity list **or** day-section list / `{ itinerary: [...] }` |
| **Returns** | `{ mode, activities|itinerary, estimated_path_km?, note }` |

**Data source:** Pure compute (nearest-neighbor / sentence heuristics). No external API.

**Location:** `planning.py` → `optimize_itinerary_order`

---

### `find_similar_trips`

**Purpose:** Retrieve other users’ trips similar to this user’s past destinations/interests.

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `user_id: str`, `limit: int` (default 5) |
| **Returns** | `{ similar_trips: [{ trip_id, similarity, destinations, … }], method: "token_jaccard", … }` |

**Data source:** `"Trip"` + `"TripStop"` + `"City"`. Similarity = bag-of-tokens Jaccard (no Pinecone/embeddings in-repo yet).

**Location:** `planning.py` → `find_similar_trips`

---

### `export_trip_pdf`

**Purpose:** Generate a downloadable PDF of a trip itinerary (side effect: writes a file).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `trip_id: str` |
| **Returns** | `{ trip_id, filename, path, download_url, days_exported }` |

**Data source:** `"Trip"` + `"TripStop"`/`"City"` + itinerary JSON; PDF via `fpdf2` into `ai-service/exports/`, served at `GET /exports/{file}`.

**Location:** `ai-service/app/services/actions.py` → `export_trip_pdf`

**Gotchas:** Treat as a privileged action in chat agents — only call when the user/admin explicitly asks to export.

---

### `send_trip_reminder_email`

**Purpose:** Email the trip owner a reminder with an itinerary link (side effect: SMTP send).

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `trip_id: str`, `dry_run: bool` (default false) |
| **Returns** | `{ sent, dry_run, to, subject, itinerary_link, … }` |

**Data source:** Trip + owner email from `"User"`; SMTP via `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` (same as Node Nodemailer). If SMTP missing or `dry_run=true`, returns preview without sending.

**Location:** `actions.py` → `send_trip_reminder_email`

**Gotchas:** Destructive/noisy — chat agents should require clear user intent; prefer `dry_run` in tests.

---

### `persist_planned_trip`

**Purpose:** Write a finished chat plan into Postgres as a real `Trip` (+ stops) and return an itinerary link.

**Inputs / outputs**

| | |
|--|--|
| **Parameters** | `user_id`, `destination`, `start_date`, `end_date`, `max_budget`, `itinerary[]`, optional `name` / `description` / `expenses` |
| **Returns** | `{ trip_id, itinerary_link, … }` |

**Data source:** Inserts into `"Trip"` / related tables via `ai-service/app/services/trip_persist.py`.

**Location:** MCP `persist_planned_trip`; user chat **forces** authenticated `user_id` (ignores model-supplied id on write).

**Gotchas:** Side effect — only after slots filled and the user is ready (or a solid final itinerary exists). Never invent links; only quote `itinerary_link` from the tool result.

---

## Section 3: Chat agents

### Admin chat (`POST /admin/chat`)

**Purpose:** Natural-language admin analytics. The **LLM chooses tools** (Gemini function calling); our code only executes what Gemini requests.

**Auth:** Bearer JWT must belong to an Active `ADMIN` user (Python `app/auth.py:require_admin`, same rules as Node `adminAuth`). Frontend can call Node `POST /api/admin/chat` (adminAuth → proxies to Python).

**Allowed tools (whitelist):**  
`get_today_user_count`, `get_today_trip_count`, `get_revenue_summary`, `get_popular_destinations`, `get_disabled_users`, `flag_suspicious_activity`, `get_community_engagement_stats`.

#### Request lifecycle

1. Client sends `{ message, history?, maxRounds? }` + `Authorization: Bearer …`.
2. Server verifies ADMIN JWT against Postgres.
3. MCP admin tool schemas are converted to Gemini `functionDeclarations` (schemas sanitized: strip `additionalProperties` / simplify `anyOf`).
4. Gemini receives system instruction + history + user message + tool schemas.
5. If Gemini returns `functionCall` part(s):
   - Execute each via `mcp.call_tool`
   - Append results as `functionResponse` parts
   - Call Gemini again
6. Repeat until Gemini returns plain text (or max rounds).
7. Response: `{ answer, tool_call_trace, tools_available, rounds_used, admin }`.

#### Worked example

**User:** “how many users signed up today and what are the top 3 destinations?”

**Trace (observed):**
1. `get_today_user_count` → `{ count: 0, day_utc: "2026-08-27", … }`
2. `get_popular_destinations` `{ limit: 3 }` → Pune, Dubai, Kabul

**Answer (model):**  
“For today … 0 new user sign-ups. Top 3 destinations: 1. Pune… 2. Dubai… 3. Kabul…”

Both tools were chosen **in one Gemini turn** (multi-tool), not a hardcoded if/else pipeline.

**Code locations**

- Agent loop: `ai-service/app/agent/admin_chat.py`
- Gemini tools helper: `ai-service/app/services/gemini_tools.py`
- HTTP: `ai-service/app/main.py` → `POST /admin/chat`
- Node proxy: `backend/controllers/adminController.js` → `POST /api/admin/chat`

**Test:** `python scripts/test_admin_chat.py`

---

### User planning chat (`POST /chat/plan-trip`)

**Purpose:** Multi-turn trip planning with **slot filling**, session memory, and a planning-tool whitelist. When ready, persists a real trip and returns an itinerary link.

**Auth:** Bearer JWT for an Active user (`require_user`). Prefer Node `POST /api/chat/plan-trip` (auth middleware → proxies JWT to Python).

**Allowed tools:**  
`search_cities`, `generate_itinerary`, `check_budget`, `suggest_alternatives`, `search_activities`, `compare_destinations`, `check_weather_for_trip`, `optimize_itinerary_order`, `find_similar_trips`, `persist_planned_trip`.

**Session memory:** Prisma `ChatSession` (`messages` JSON string). Create / load / append via `app/services/sessions.py`. Pass `sessionId` on later turns.

#### Request lifecycle

1. Client: `{ message, sessionId?, maxRounds? }` + Bearer JWT.  
2. Resolve/create `ChatSession` for `userId`.  
3. Build Gemini contents from prior messages + new user turn.  
4. Function-calling loop (same pattern as admin chat) over the user tool whitelist.  
5. Force `user_id` on `persist_planned_trip` / `find_similar_trips` (never trust model for ownership).  
6. Persist assistant + tool trace into the session.  
7. Response: `{ session_id, answer, tool_call_trace, rounds_used, … }`.

#### Worked examples (smoke-tested)

**Turn 1 — slot fill**  
User: “plan me a trip”  
`trace_tools: []`  
Answer asks for where / when / budget — no `generate_itinerary`.

**Turn 2 — compare under budget**  
User (same `session_id`): “should I go to Paris or Rome for 5 days under ₹40000?”  
`trace_tools: ["compare_destinations"]`  
(`compare_destinations` itself calls Open-Meteo weather for both cities.)  
Answer converts ₹→USD, notes both ~over budget, recommends adjusting duration/budget or a tighter Rome plan.

**Later turns (intended):** fill exact dates → `generate_itinerary` → chat **summary** → user says yes → `persist_planned_trip` → answer includes `itinerary_link`.

**Confirm-before-create:** Initial “create itinerary for …” does **not** save. Code blocks `persist_planned_trip` until `awaiting_confirm` (after a draft generate) and a clear yes/create confirmation. Missing dates → tool returns `missing_dates` so the model must ask.

**Code locations**

- Agent: `ai-service/app/agent/user_chat.py`
- Sessions: `ai-service/app/services/sessions.py`
- Persist: `ai-service/app/services/trip_persist.py`
- HTTP: `POST /chat/plan-trip` in `app/main.py`
- Node: `backend/routes/chatRoutes.js` → `/api/chat/plan-trip`

**Test:** `python scripts/test_user_chat.py`

**Gotcha:** Prisma `ChatSession.updatedAt` is NOT NULL — INSERT must set `"createdAt"` / `"updatedAt"` (or DB defaults). Omitting them causes `NotNullViolation`.

---

## Section 4: Design decisions and tradeoffs

| Decision | Choice | Why / tradeoff |
|----------|--------|----------------|
| MCP in-process vs remote | In-process `mcp.call_tool` | Simple deploy; one uvicorn. Split later if tools grow or need separate scaling. |
| Re-plan vs chat agent | Hardcoded re-plan for trip create; soft policy for chat | Create-trip needs reliable budget pass; chat needs flexibility and clarifications. |
| Admin vs user tool whitelists | Strict separate sets | Least privilege — users never see revenue/disabled-user tools. |
| Ownership on writes | Force JWT `user_id` in code | Models can hallucinate ids; DB writes must ignore that. |
| Revenue tool | Mock `$` with `is_mock` | No payment tables yet; keep the tool name stable for demos. |
| Weather | Open-Meteo (no key) | Free; ~16-day horizon limit. |
| Similar trips | Token Jaccard | No vector DB in-repo; good enough for demos; swap for embeddings later. |
| LLM provider | Gemini + optional Groq (`LLM_PROVIDER=auto`) | Gemini 429s are common; flash-lite / Groq fallback. |
| Schema → Gemini | Sanitize JSON Schema | Gemini rejects `additionalProperties` / some `anyOf`; strip before declarations. |
| Session store | Prisma `ChatSession` in same Postgres | One DB with trips/users; no Redis required for v1. |
| PDF / email | Explicit user intent | Side effects; dry_run for email in tests. |

**Interview angle:** “MCP gives a stable tool contract; agents are thin loops + policy. Security is whitelist + auth + forced user_id, not prompt trust.”

---

## Section 5: Setup and testing walkthrough

### Env

- `ai-service/.env` — `DATABASE_URL`, `GEMINI_API_KEY` (and/or Groq), `JWT_SECRET` matching Node, optional SMTP.  
- `backend/.env` — `AI_SERVICE_URL=http://127.0.0.1:8000`.  
- Never commit real keys; use `.env.example` as the template.

### Register check

```powershell
cd ai-service
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "."
uvicorn app.main:app --host 127.0.0.1 --port 8000
# GET http://127.0.0.1:8000/health  → mcp_tools lists planning + admin + persist tools
```

If port 8000 is stuck, stop the old Python/uvicorn process before restarting (code changes need a restart).

### Tool smokes

```powershell
python scripts/test_admin_tools.py
python scripts/test_planning_tools.py
python scripts/test_action_tools.py
```

### Admin chat

```powershell
python scripts/test_admin_chat.py
# HTTP: POST http://127.0.0.1:8000/admin/chat  (+ admin Bearer)
# Node: POST http://127.0.0.1:5000/api/admin/chat
```

### User planning chat

```powershell
python scripts/test_user_chat.py
# HTTP: POST http://127.0.0.1:8000/chat/plan-trip  (+ user Bearer)
#   { "message": "plan me a trip", "sessionId": null }
# Node: POST http://127.0.0.1:5000/api/chat/plan-trip
```

### Prisma / ChatSession

```powershell
cd backend
npx prisma db push
# ChatSession model in schema.prisma; Python also ensure_chat_sessions_table() as fallback
```

---

## Implementation status

| Item | Status |
|------|--------|
| `get_today_user_count` | ✅ |
| `get_today_trip_count` | ✅ |
| `get_revenue_summary` | ✅ (mock $) |
| `get_popular_destinations` | ✅ |
| `get_disabled_users` | ✅ |
| `flag_suspicious_activity` | ✅ (heuristic) |
| `get_community_engagement_stats` | ✅ |
| `check_weather_for_trip` | ✅ (Open-Meteo) |
| `compare_destinations` | ✅ |
| `optimize_itinerary_order` | ✅ |
| `find_similar_trips` | ✅ (token Jaccard) |
| `export_trip_pdf` | ✅ |
| `send_trip_reminder_email` | ✅ (SMTP / dry_run) |
| `persist_planned_trip` | ✅ |
| Part 1 tools | ✅ |
| Part 2 admin chat | ✅ |
| Part 3 user chat | ✅ |
| Sections 1–5 | ✅ |

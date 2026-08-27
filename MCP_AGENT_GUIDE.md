# MCP_AGENT_GUIDE.md

Theory + implementation guide for the GlobeTrotter MCP server, tools, and (upcoming) chat agents.

> Updated incrementally as tools and agents land. Interview-ready: beginner → implementation → senior tradeoffs.

---

## Section 1: Beginner theory

*(Written after the system stabilizes — see execution plan.)*

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

## Section 3: Chat agents

### Admin chat (`POST /admin/chat`)

**Purpose:** Natural-language admin analytics. The **LLM chooses tools** (Gemini function calling); our code only executes what Gemini requests.

**Auth:** Bearer JWT must belong to an Active `ADMIN` user (Python `app/auth.py:require_admin`, same rules as Node `adminAuth`). Frontend can call Node `POST /api/admin/chat` (adminAuth → proxies to Python).

**Allowed tools (whitelist):**  
`get_today_user_count`, `get_today_trip_count`, `get_revenue_summary`, `get_popular_destinations`, `get_disabled_users`, `flag_suspicious_activity`, `get_community_engagement_stats`.

#### Request lifecycle

1. Client sends `{ message, history?, maxRounds? }` + `Authorization: Bearer …`.
2. Server verifies ADMIN JWT against Postgres.
3. MCP admin tool schemas are converted to Gemini `functionDeclarations`.
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

### User planning chat

*(Part 3 — pending.)*

---

## Section 4: Design decisions and tradeoffs

*(Senior-level — after agents are stable.)*

---

## Section 5: Setup and testing walkthrough

### Register check

```powershell
cd ai-service
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "."
uvicorn app.main:app --host 127.0.0.1 --port 8000
# GET http://127.0.0.1:8000/health  → mcp_tools includes get_today_user_count, get_today_trip_count
```

### Manual tool test (in-process MCP)

```powershell
python scripts/test_admin_tools.py
```

Expected: JSON with `count` and `day_utc` for both tools.

### Admin chat

```powershell
python scripts/test_admin_chat.py
# or HTTP (needs admin JWT):
# POST http://127.0.0.1:8000/admin/chat
# Authorization: Bearer <admin-jwt>
# { "message": "how many users signed up today and top 3 destinations?" }
#
# Via Node (adminAuth):
# POST http://127.0.0.1:5000/api/admin/chat
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
| Part 1 tools | ✅ complete |
| Part 2 admin chat | ✅ |
| Part 3 user chat | Pending |
| Part 2 admin chat | Pending |
| Part 3 user chat | Pending |
| Sections 1, 4, 5 (full) | Partial (testing notes above) |

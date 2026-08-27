# Beginner — What is an LLM?

An **LLM** (Large Language Model) is a neural network trained on huge amounts of text so it can predict the next token (piece of text) given what came before. In practice that prediction skill looks like answering questions, writing plans, or producing structured JSON when you ask for it. It does **not** automatically know your private database or today’s inventory — it only knows what was in its training data plus whatever you put in the current prompt (and whatever tools you give it).

In GlobeTrotter we use Google **Gemini** as the LLM. When you ask for an itinerary, we send a carefully written prompt (“plan only for this city”, “exactly N days”, “return JSON”) and parse the model’s reply into day objects the app can store.

---

# Beginner — What is an embedding?

An **embedding** is a list of numbers (a vector) that represents the *meaning* of a piece of text. Similar meanings land near each other in that vector space (e.g. “budget hostel” near “cheap lodging”). Models produce embeddings so software can compare text by math (cosine similarity) instead of exact keyword match.

GlobeTrotter does **not** use embeddings yet — city/activity search is SQL `ILIKE` / Prisma filters. Embeddings matter once you add semantic search or RAG over trip notes.

---

# Beginner — What is a vector database?

A **vector database** stores embeddings and finds nearest neighbors fast (ANN indexes). Examples: Pinecone, pgvector, Chroma. You insert vectors + metadata, then query “find texts closest to this query vector.”

**Not used in this repo today.** If we added RAG over destination guides, a vector DB (or Postgres `pgvector`) would store chunk embeddings.

---

# Beginner — What is RAG?

**RAG** (Retrieval-Augmented Generation) means: before asking the LLM to answer, retrieve relevant facts from *your* data and put them in the prompt. That reduces hallucinations about private or fresh content.

Pattern: query → embed → nearest chunks from a vector store → LLM prompt with those chunks → answer.

Our agent today is **tool-augmented** (MCP tools + DB + Gemini), not classic RAG. `search_cities` / `search_activities` are structured retrieval; RAG would be the unstructured-document cousin.

---

# Beginner — What is MCP?

**MCP** (Model Context Protocol) is an open standard for connecting AI apps to external capabilities in a consistent way. Think of it as “USB for AI tools”: instead of every product inventing its own plugin format, a server exposes **tools** (and optionally resources/prompts) with names, descriptions, and typed inputs. An MCP **client** (an agent, IDE, or our Python re-plan loop) discovers those tools and calls them.

| Piece | Role in this repo |
|--------|-------------------|
| **MCP server** | `ai-service/app/mcp_server.py` |
| **Tools** | `search_cities`, `generate_itinerary`, `check_budget`, `search_activities`, `suggest_alternatives` |
| **MCP client** | `ai-service/app/agent/replan.py` (`mcp.call_tool` in a loop) |
| **Host app** | Node Express owns trip CRUD; calls `POST /plan-trip` via `aiService.js` |

MCP is **not** the LLM. Gemini runs *inside* some tools; other tools are plain code (SQL, budget arithmetic).

---

# Intermediate — How the agentic re-plan loop works

Implemented in `app/agent/replan.py`, exposed as `POST /plan-trip`.

```
search_cities → search_activities
       ↓
generate_itinerary (optional constraints from prior round)
       ↓
check_budget
       ↓
  passed? ──yes──→ generate_expenses → return itinerary + expenses + tool_call_trace
       │
       no (and attempts left)
       ↓
suggest_alternatives → build constraints_for_regen → loop
```

Step-by-step:

1. **Grounding (optional but traced):** `search_cities` / `search_activities` hit the same Postgres catalogs the Node API uses.
2. **Generate:** `generate_itinerary` calls Gemini with destination, dates, budget, interests, and any **constraints** from a previous failure.
3. **Gate:** `check_budget` sums day `budget` fields (deterministic code — not an LLM). Returns `passed`, `estimated_total`, `overage_amount`.
4. **Repair:** If over budget and attempts remain, `suggest_alternatives` proposes concrete swaps and a `constraints_for_regen` string.
5. **Repeat** up to `MAX_REPLAN_ATTEMPTS` (default 3).
6. **Expenses:** After the loop, `generate_expenses` (helper, recorded in the trace) builds the line items Node already stores on trips.
7. **Trace:** Every tool call is appended as `{step, tool, input, output}` in order.

Why this structure? Budget math must be trustworthy → deterministic gate. Creative planning and swap ideas → LLM tools. The loop is a **fixed policy** (not free-form ReAct), which is easier to test and explain in interviews.

---

# Intermediate — Why tools are shaped this way

| Tool | Deterministic? | Why separate |
|------|----------------|--------------|
| `search_cities` | Yes (SQL) | Ground destination in *our* catalog |
| `search_activities` | Yes (SQL) | Cheaper options from real inventory |
| `generate_itinerary` | No (Gemini) | Creative day plans; accepts `constraints` for re-plans |
| `check_budget` | Yes (parse + sum) | Hard gate the agent cannot “talk past” |
| `suggest_alternatives` | Hybrid | LLM swaps, optionally seeded by catalog rows |

Splitting generate vs check vs suggest means the **trace** shows *why* a plan changed — critical for debugging and for defending the design.

---

# Intermediate — Tool schemas ↔ function calling

`@mcp.tool()` + type hints → JSON Schema the client advertises to an LLM host (or that our loop calls directly via `mcp.call_tool(name, args)`).

Example: `check_budget(itinerary: list|dict, max_budget: float)` becomes a schema requiring those arguments. That is the same idea as Gemini/OpenAI function calling; MCP standardizes discovery and invocation across hosts.

In-process (our agent) we skip the “LLM chooses the next tool” step and use a scripted policy — still real MCP tool calls, still a full trace.

---

# Implementation status

## Step 1 — MCP server + first two tools ✅

| Tool | Backing |
|------|---------|
| `search_cities` | Postgres `"City"` |
| `generate_itinerary` | Gemini |

## Step 2 — Budget tools + re-plan loop ✅

| Tool / API | Backing |
|------------|---------|
| `check_budget` | Sum day budgets vs `max_budget` |
| `search_activities` | Postgres `"Activity"` (same filters as `GET /api/activities`) |
| `suggest_alternatives` | Catalog seed + Gemini swaps |
| `POST /plan-trip` | `plan_trip()` MCP-client loop + expenses + `tool_call_trace` |

## Step 3 — Node Express ↔ Python AI service ✅

| Piece | Role |
|--------|------|
| `backend/services/aiService.js` | `fetch` → `POST {AI_SERVICE_URL}/plan-trip` |
| `createTrip` | Persists trip CRUD in Prisma; itinerary/expenses from AI service |
| `regenerateItinerary` | Same AI path (`includeExpenses: false`) |
| Response extras | `toolCallTrace`, `agentMeta` (also saved to sessionStorage + optional `agentTrace` column) |

Env: `AI_SERVICE_URL` (default `http://127.0.0.1:8000`), `AI_SERVICE_TIMEOUT_MS`.

## UI / demo add-ons ✅

| Surface | Path |
|---------|------|
| MCP tool-call trace panel | `/itinerary/[id]` after Plan Trip or AI Regenerate |
| Agent chat (structured) | `/ai-chat` |
| Eval harness | `ai-service/scripts/eval_replan.py` |

---

# Setup walkthrough

## 0. Prerequisites

- Python 3.11+ (tested with 3.13)
- Postgres via same `DATABASE_URL` as Node
- `GEMINI_API_KEY` (reuse `backend/.env`)

## 1. Install

```powershell
cd "e:\AI Engineer\GlobeTrotterMCP-AI\ai-service"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PYTHONPATH = "."
```

## 2. Environment

```env
GEMINI_API_KEY=...
DATABASE_URL=...
AI_SERVICE_PORT=8000
MAX_REPLAN_ATTEMPTS=3
```

`app/config.py` also loads `backend/.env` if keys are missing locally.

## 3. Test individual tools

```powershell
# Deterministic tools only
python scripts/test_tools.py --skip-gemini

# Expect check_budget failure on the baked-in $750 vs $500 sample
python scripts/test_tools.py --tool check_budget
```

## 4. Trace a full re-plan loop

```powershell
# Fewer Gemini calls: skip expenses, limit attempts
python scripts/test_replan.py --destination "London, United Kingdom" --budget 500 --max-attempts 2 --skip-expenses
```

Watch `trace_tools` in the summary — you should see `search_cities`, `search_activities`, `generate_itinerary`, `check_budget`, and possibly `suggest_alternatives` + another `generate_itinerary`.

## 5. Run HTTP + call `/plan-trip`

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
curl http://127.0.0.1:8000/health
```

```powershell
curl -X POST http://127.0.0.1:8000/plan-trip -H "Content-Type: application/json" -d "{\"destination\":\"London, United Kingdom\",\"startDate\":\"2026-09-10\",\"endDate\":\"2026-09-11\",\"maxBudget\":500,\"interests\":\"museums\",\"includeExpenses\":false,\"maxAttempts\":2}"
```

MCP Streamable HTTP remains at `http://127.0.0.1:8000/mcp`.

## 6. End-to-end with Node (Step 3)

1. Start `ai-service` on `:8000`.
2. Start Express (`backend`) with `AI_SERVICE_URL=http://127.0.0.1:8000`.
3. `POST /api/trips` (JWT) as before — Node resolves city/cover, then calls Python `/plan-trip`, then writes `Trip` + `TripStop`.
4. Response includes `trip` plus `toolCallTrace` / `agentMeta` for debugging the agent loop.

If AI service is down, createTrip returns 500 with `AI service unreachable...`.

---

# Advanced / senior — Design tradeoffs (Step 2)

**Why a fixed loop instead of free-form ReAct?**  
Predictable cost (bounded Gemini calls), easier evaluation, and a budget gate that cannot be skipped because an LLM “forgot” to call it. At scale you might let a planner model choose tools — but you’d still keep `check_budget` as a mandatory verifier.

**What changes at scale?**  
Cache city/activity reads; parallelize independent tools; replace in-process `call_tool` with a remote MCP client if tools split across services; add idempotency keys on `/plan-trip`; move Gemini to batch/queue under load.

**Evaluating agent quality**  
- Budget pass rate within N attempts  
- Overage distribution after final plan  
- Swap usefulness (human or LLM-as-judge on `suggest_alternatives`)  
- Trace completeness (every regenerate must follow a failed `check_budget`)

**Failure modes this code handles / could handle**  
| Failure | Current handling | Next hardening |
|---------|------------------|----------------|
| Gemini 429 / model errors | Model fallback list in `call_gemini_json` | Retries with backoff |
| Over budget after N attempts | Return best effort + `budget_passed: false` | Force clamp day budgets algorithmically |
| Empty activity catalog | Alternatives still use Gemini-only swaps | Seed more activities / widen city match |
| Malformed itinerary JSON | `extract_json_array` + normalize | Schema validation / repair pass |
| Infinite repair | Hard `max_attempts` | Circuit breaker + metrics |

---

# Coming next / optional

- Run `cd backend && npx prisma db push` so `Trip.agentTrace` persists across reloads
- Expand free-form chat beyond structured plan forms
- Wire eval report into CI

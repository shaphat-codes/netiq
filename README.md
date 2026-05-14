# NetIQ

**NetIQ** is a trust-and-decision layer over **Nokia Network as Code** / **GSMA CAMARA** telco APIs. Clients send `phone`, `intent`, and `context`; the platform returns a structured decision (e.g. ALLOW, VERIFY, BLOCK) with confidence, reasons, trace, and cross-sector **phone-number memory**. The same engine is exposed over **REST**, **MCP** (stdio + HTTP), and **A2A**.

**Stack (summary):** Python **Flask** API + **SQLite** + optional **OpenAI**; **Next.js 15** (App Router) + **React 19** + **Tailwind** for the console and marketing site. npm **workspace** at repo root with the app in `web/`.

---

## Architecture

```mermaid
flowchart TB
  subgraph clients [Clients]
    Browser[Browser / Console / Demos]
    Agent[AI agents and MCP clients]
  end

  subgraph frontend [Next.js - web/]
    Pages[App Router pages]
    RHR[Route Handlers /api/netiq/*]
  end

  subgraph api [Flask API - root]
    BP[Blueprints: decision, a2a, mcp, api_v1, consumer, events, ui]
    Auth[request_auth + rate limits]
    Tools[services/mcp - MCP tool dispatch]
    Agents[services/agents - LLM + CAMARA orchestration]
    Policy[services/policy_engine - tenant rules]
    Memory[services/memory_service]
    DB[(SQLite netiq.db)]
  end

  subgraph external [External]
    NaC[Nokia NaC / RapidAPI CAMARA]
    OAI[OpenAI optional]
  end

  Browser --> Pages
  Browser --> RHR
  Agent -->|REST SSE JSON-RPC| BP
  RHR -->|HTTP to NEXT_PUBLIC_NETIQ_API_URL| BP
  BP --> Auth
  BP --> Tools
  BP --> Agents
  BP --> Policy
  Agents --> Memory
  Agents --> NaC
  Agents --> OAI
  Policy --> Memory
  Tools --> Agents
  Memory --> DB
  Auth --> DB
  BP --> DB
```

### Request flow (typical decision)

1. **Ingress** — JSON arrives on `/decision/run`, `/decision/stream`, `/mcp`, `/a2a/*`, or `/consumer/chat/*` (see `routes/`). Optional **Bearer API key** resolves to an account (`services/request_auth.py`, `database/db.py`).
2. **Routing** — Intent is normalized (`services/intent_mapper.py`). **Agent** mode runs the LLM-led pipeline (`services/agents/`); **policy** mode uses tenant rules (`services/policy_engine.py`).
3. **Signals** — CAMARA calls go through the integration layer (`integrations/`) using **RapidAPI** credentials from env (`config.py`).
4. **Memory** — Cross-sector risk memory is read/written per phone (`services/memory_service.py`).
5. **Persistence** — Decisions and audit metadata land in **SQLite** unless configured otherwise (`DATABASE_URL`).

### Protocol surfaces (same core logic)

| Surface | Entry |
|--------|--------|
| REST | `routes/decision.py` — `/decision/run`, `/decision/stream`, `/agent/run` |
| MCP HTTP | `routes/mcp_http.py` — `POST /mcp` (JSON-RPC) |
| MCP stdio | `mcp_server.py` — local process for Claude/Cursor-style hosts |
| A2A | `routes/a2a.py` — Agent Card + task endpoints |
| Console API | `routes/api_v1.py` — sessions, keys, account JSON |

### Frontend ↔ backend (split deploy)

In production the UI often sits on **Vercel** and the API on **Render** (or similar). The browser calls Flask **directly** using `NEXT_PUBLIC_NETIQ_API_URL`. Next **Route Handlers** under `web/app/api/netiq/*` proxy some flows server-side (e.g. demos) using `NETIQ_DEMO_API_KEY` so secrets stay off the client.

**Vercel:** **Root Directory = `web`** is the recommended setup. Vercel runs `next build` from `web/` (see `web/vercel.json`). Do **not** set **`NETIQ_MONOREPO_TRACE_ROOT`**, **`NETIQ_NEXT_STANDALONE`**, or **`NETIQ_DOCKER_IMAGE`** on the Vercel project — those are for **local/repo-root/Docker builds** only. If they are set (or if `outputFileTracingRoot` pointed at `..` on a `web`-root deploy), serverless bundles can miss `.next` and **`/api/*` returns 500** (“Could not find a production build in `/var/task/.next`”). Set **`NEXT_PUBLIC_NETIQ_API_URL`** and **`NETIQ_DEMO_API_KEY`** (if used) on Vercel for demo sign-in.

**Docker / repo-root build:** `Dockerfile` sets **`NETIQ_MONOREPO_TRACE_ROOT`**, **`NETIQ_NEXT_STANDALONE`**, and **`NETIQ_DOCKER_IMAGE`**. Root **`npm run build`** sets **`NETIQ_MONOREPO_TRACE_ROOT=1`** for the workspace Next build plus `scripts/sync-vercel-next-output.js` when `VERCEL_ENV` or `VERCEL` is `1`/`true`.

---

## Repository layout

| Path | Role |
|------|------|
| `app.py` | Flask app factory, CORS, blueprint registration |
| `config.py` | Environment-driven settings |
| `routes/` | HTTP blueprints (REST, MCP, A2A, portal JSON API, consumer) |
| `services/` | Agents, policy engine, memory, MCP tools, rate limiting |
| `database/` | SQLite schema, migrations, API key hashing |
| `integrations/` | CAMARA / NaC client wiring |
| `mcp_server.py` | Stdio MCP server for local IDE integration |
| `web/` | Next.js UI — console, simulator, docs, sector demos |
| `Dockerfile`, `Dockerfile.api`, `render.yaml` | Container / Render deployment |
| `vercel.json` (repo root), `web/vercel.json`, `scripts/sync-vercel-next-output.js` | Root deploy vs **`web`** as Vercel root (sync only for repo-root deploy) |

---

## Running locally

Use **two terminals**: (1) Flask — `python app.py` from the repo root with a `.env` containing at least `RAPIDAPI_KEY` for real CAMARA calls; (2) Next — from root `npm ci && npm run dev` after copying `web/.env.example` to `web/.env.local` with `NEXT_PUBLIC_NETIQ_API_URL=http://localhost:8080`.

More detail: **`web/README.md`** (frontend and demo setup).

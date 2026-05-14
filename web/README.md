# NetIQ — web console

The Next.js (App Router) developer portal and marketing surface for the NetIQ
decision platform.

## What NetIQ is

NetIQ is a horizontal **trust-and-decision orchestration layer** built on top
of Nokia Network as Code / GSMA CAMARA telco APIs. Any startup that needs to
verify "is this person real, present, and safe to act on right now?" sends one
request — `{ phone, intent, context }` — and gets back a structured decision
(`ALLOW | VERIFY | BLOCK | PRIORITIZE | DEGRADE`) with confidence, reason,
trace, and cross-sector memory influence.

Eleven first-class intents ship today — `fraud_prevention`, `onboarding`,
`emergency_response`, `mobility`, `health`, `agri`, `finance`, `insurance`,
`ecommerce`, `logistics`, `education` — and the same pipeline serves all of
them through three protocols: **REST**, **MCP**, and **A2A**.

The console in this folder is where tenants:

- create and revoke API keys
- watch live decision activity and risk-score trends
- author tenant policy rules
- run the simulator against the live CAMARA passthrough
- read the protocol docs (`/console/docs`) for REST, MCP, and A2A

## Setup

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Backend

Run the Flask app (default `http://localhost:8080`). Set Flask:

```bash
export CORS_ORIGINS=http://localhost:3000
```

Use **localhost** for both Next and Flask in development so session cookies
work across ports.

## Sector demo apps (`/demo`)

Four thin sector apps share one NetIQ trust layer:

- `/demo/fintech` — **PawaSend** (mobile-money transfers)
- `/demo/logistics` — **SwiftDrop** (last-mile delivery)
- `/demo/health` — **CareLink** (telehealth consults)
- `/demo/agri` — **FarmRoute** (co-op payouts and field ops)

Each app has a NetIQ sign-in panel and two NetIQ-gated actions. By default they
POST to **`/api/netiq/decide`**, which forwards to Flask **`/decision/run`** with
`NETIQ_DEMO_API_KEY` on the server. That is **one backend decision per action**
(not multiple chained APIs). It feels slower than the **console simulator**
because the simulator calls Flask **directly** from the browser (`NEXT_PUBLIC_NETIQ_API_URL`),
while demos add a **Next hop** (and on Vercel, a **serverless** hop + possible
cold start) before the same `/decision/run` work runs.

### Faster demos (split Vercel + API host)

Set in `web/.env.local` (and Vercel env for the **Next** project):

```bash
NEXT_PUBLIC_NETIQ_DEMO_DIRECT=1
# Optional: same tenant scoping as NETIQ_DEMO_API_KEY; this value is public in the bundle.
# NEXT_PUBLIC_NETIQ_DEMO_BROWSER_API_KEY=ntq_your_demo_key
```

Ensure the Flask **`CORS_ORIGINS`** includes your Next origin (e.g.
`https://your-app.vercel.app`). Sign-in still uses `/api/netiq/session` so the
server-side demo key is not required for every action.

### Faster demo sign-in (phone verification)

`/api/netiq/session` forwards one **`POST /decision/run`** to Flask. By default it
uses **`mode=deterministic`**: the same intent-based agents (e.g. RiskAgent for
onboarding) and fused **DecisionAgent** output as full agent mode, but **without**
the LLM tool loop — much faster for live demos. Override on the **Next** host only:

```bash
# Optional: agent = LLM-led sign-in; policy = tenant rules (requires configured rules).
# NETIQ_DEMO_SIGNIN_MODE=deterministic
```

### One-time setup

1. Sign in to the console at [http://localhost:3000/console](http://localhost:3000/console).
2. Create an API key (the **Keys** page) and copy the raw `ntq_…` value.
3. Add it to `web/.env.local`:

   ```bash
   NETIQ_DEMO_API_KEY=ntq_paste_your_key_here
   # Optional — defaults to NEXT_PUBLIC_NETIQ_API_URL or http://localhost:8080
   # NETIQ_API_URL=http://localhost:8080
   ```

4. Restart `npm run dev` so Next picks up the env var.

The key is read **server-side only** by the Route Handlers. It never reaches
the browser.

### Demo session

Sign-in stores a small httpOnly cookie (`netiq_demo_session`) at path `/` so
the same session carries across `/demo/fintech`, `/demo/logistics`, etc. The
session holds only the verified phone and the most recent sign-in decision —
it is **not** an OIDC token.

### Rehearsal flow (cross-sector memory beat)

1. Open `/demo/fintech` and sign in with `+9999999103` (matches
   `payment_high` in `scenarios/demo_scenarios.json`).
2. Run **High-value send**. Note the decision and reason.
3. Open `/demo/agri` (same browser tab — session persists).
4. Run **Co-op payout**. NetIQ should surface a `memory · finance` pill on
   the result, showing that prior fintech risk influenced this agritech
   decision.
5. Sign out from the top bar to clear the cookie before the next rehearsal.

### Splitting into standalone apps later

The `/demo/*` routes only import from `@/components/demo/*` and
`@/lib/demo/*`. To extract one sector into its own Next.js project, copy:

- `web/components/demo/`
- `web/lib/demo/`
- `web/app/api/netiq/decide/route.ts`
- `web/app/api/netiq/session/route.ts`
- the matching `web/app/demo/<sector>/page.tsx`

…then point `NETIQ_DEMO_API_KEY` at a per-tenant key. No other rewrite needed.

## Production

Build: `npm run build` · Start: `npm start`

Prefer a reverse proxy that serves Next and proxies `/api`, `/decision`,
`/agent`, `/mcp`, and `/a2a` to Flask under one origin to avoid CORS.

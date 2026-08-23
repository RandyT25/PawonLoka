# PawonLoka Telegram + Claude Agent Layer — Architecture Design
> Design document. No code, infrastructure, or database changes have been made as part of this document — see each Part's "DO NOT BUILD YET" section.

PawonLoka has no dedicated backend or API layer today — every one of its five apps (POS, Backoffice, Staff Portal, Owner App, Customer QR ordering) talks directly to Supabase from the browser using a single hardcoded anon key, with permissive RLS (`using(true)`) on every table. This document designs a boundary for a future Telegram + Claude agent layer that sits outside that trust boundary, in two parts:

- **Part I — Management Reporting Layer**: owner/manager asks Telegram a question (sales, P&L, inventory), gets an answer back. Read-only.
- **Part II — Staff Conversational Operations Layer**: staff perform real operational workflows (receiving, stock counts, waste, breakage, maintenance, production, requisition, purchasing intelligence) through Telegram conversations, as an additional entry point alongside the existing web Staff Portal — not a replacement for it.

Both parts share one architectural foundation (Cloudflare Worker, a scoped Supabase credential distinct from the anon key, a reusable confirmation-token model, a dedicated agent audit log) rather than being two unrelated systems. Where Part II's conclusions supersede a Part I section (scope/phasing/first-slice), the **Unified Recommendations** section at the end is authoritative.

---

# PART I — Management Reporting Layer

**Scope note on evidence:** every claim in Sections 1–2 about the *existing* system is traced to a specific file/migration verified this session (paths cited inline). Sections 3 onward describe a *proposed* new layer that does not exist yet — none of it should be read as fact about the current codebase.

---

## 1. Executive Summary

PawonLoka today is a single React 19 SPA (5 path-routed apps: POS, Backoffice, Staff Portal, Owner App, Customer QR) that talks directly to Supabase Postgres over REST using one hardcoded anon key, with `using(true)` RLS on every table. There is no backend layer, no server-side authorization, and almost no audit trail. This document proposes adding a **read-only-first Telegram bot backed by Claude and a thin Cloudflare Worker "agent layer"** that sits *outside* the existing anon-key trust boundary, exposes a small, explicit catalog of reporting capabilities that faithfully reproduce PawonLoka's existing (and occasionally idiosyncratic) financial/reporting formulas, and defers all future write capability behind an explicit, tiered, human-confirmed model that this document also designs but does not authorize building yet.

The core architectural bet: **the agent layer must never simply "have DB access."** It must hold its own scoped credential, distinct from the anon key used by the live POS/Backoffice/Owner apps, so that a prompt-injection bug, a Claude mistake, or a compromised Telegram bot token cannot become a live-POS-destabilizing event. Read capability comes first, is fully specified in Section 5 with exact source tables and gotchas, and is scoped to one single capability for the first implementation slice (Section 16). Nothing here proposes touching the live apps, RLS policies, or database schema.

## 2. Current Architecture Findings

**Topology.** One Vite/React 19 SPA, deployed to Cloudflare Pages by GitHub Actions on push to `main` (`.github/workflows/deploy.yml`), which builds with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` injected as build-time secrets and runs `wrangler pages deploy dist`. `src/App.jsx` does its own path matching against `window.location.pathname` — there is no router library, and by extension no server-side routing layer of any kind to hook an agent into. There is a Capacitor Android wrapper of the same SPA, not a separate backend.

**No backend exists today.** `src/lib/supabase.js` is the entire "backend" — a client instantiated with `createClient(url, anonKey)`, imported by every app. All five apps, all reads and all writes, go through this one client with this one key. Confirmed via repo grep: no Cloudflare Worker, no Pages Function, no Supabase Edge Function, and no service-role key anywhere in the codebase.

**RLS is uniformly permissive, and this is a *known*, previously-patched gap, not an oversight.** `fix_rls_security.sql` (repo root, undated ad hoc script) shows RLS was retroactively enabled on 11 tables (`products, orders, expenses, customers, employees, categories, gl_journals, ar_items, ap_items, kitchen_tickets, shifts`) that had *no* RLS at all, each given `CREATE POLICY allow_all ... FOR ALL USING (true) WITH CHECK (true)` — i.e., the "fix" was to satisfy the Supabase security linter's "RLS disabled" warning while preserving full anon read+write. Every subsequent migration that creates a table follows the same pattern (`create_cash_flows.sql`, `create_reconciliations.sql`, `create_assets.sql`, `fix_stock_opname_production_rls.sql`, `order_anomalies_delete_policy.sql`). The practical result: the single anon key embedded in the client bundle is functionally equivalent to a superuser credential over the whole schema, including `customers` (name, phone, email, address, dob, notes, marketing_opt_in) and `staff` (salary, phone, pin — confirmed live). *(Side note: `gl_journals`, `ar_items`, `ap_items`, `kitchen_tickets`, `employees` appear in this script but weren't otherwise encountered in this session's research — possible legacy/superseded tables from an earlier accounting-module iteration; worth a quick check before assuming the current `ALL TABLES` list in `PAWONLOKA_BRAIN.md` is exhaustive.)*

**The one server-side enforcement point that exists is diagnostic, not corrective.** `supabase/migrations/20260723000000_order_consistency_trigger.sql` installs a `before insert or update on orders` trigger, `enforce_order_subtotal()`, that recomputes `subtotal` from the `items` JSONB array, derives `expected_total = subtotal - discount + tax - refund_amount`, and if `|orders.total - expected_total| > 5` **only inserts a row into a new `order_anomalies` table** — it does not reject, correct, or block the write; `new.total` is written as given. `order_anomalies` has the same `using(true)`/anon-insertable RLS as everything else. This table is read by exactly one screen, `OrderAnomalies.jsx` (a standalone Backoffice admin list) — it is not joined into any P&L, cash flow, dashboard, or sales report query, so a flagged/anomalous order still contributes its full `orders.total` to every revenue figure a human or agent would compute.

**Client-side-only audit trail, and sparse.** `audit_logs` rows are inserted directly by the browser via `dbWrite('audit_logs', 'insert', ...)` (never server-enforced — a client that skips the call simply doesn't get logged). Confirmed call sites: `src/pos/POS.jsx` (payment finalize, ~line 1397; void, ~line 1499), `src/pos/components/VoidModal.jsx` (~line 94), and `src/backoffice/components/Orders.jsx` (~lines 75 and 95, bulk-void and single-void of stale open bills). That is the entire set of logged actions in the repo: `payment` and `void`. Neither Backoffice PIN entry nor Owner App PIN entry nor Staff Portal login writes an audit row.

**Authentication today is three separate, weak, client-only PIN checks with no shared session model — verified directly against source, and this corrects a real inaccuracy in the current `PAWONLOKA_BRAIN.md`:**
- **Backoffice** (`src/backoffice/Backoffice.jsx`, `BackofficeLogin`, ~line 308): queries `staff` by the 4-digit PIN typed (`.eq("pin", code)`), requires `permissions.backoffice === true`, then stores an unsigned session flag + staff object in `sessionStorage`. A real per-staff-member DB check, not a single shared secret — but enforced entirely client-side (anyone with the anon key can query `staff` directly and bypass the UI).
- **Owner App** (`src/owner/OwnerApp.jsx`, line 86): `const OWNER_PIN = "1234"` — a single PIN **hardcoded as a literal string in client bundle source**, compared client-side, no server check, no DB row, no expiry.
- **Correction to `PAWONLOKA_BRAIN.md`**: that file currently states "Backoffice PIN: 1999" as if it's a single shared secret. That's stale/wrong — Backoffice has no hardcoded PIN at all (it's the DB/permission-driven check above); the verified hardcoded literal in the current codebase is Owner App's `"1234"`. Worth fixing in the brain doc in a separate pass — not done here since this task is read-only.
- **Staff Portal** (`src/staff/StaffPortal.jsx`) uses a similar PIN-against-`staff` pattern.

None of these produce a server-verifiable identity token — there is nothing today an agent layer could reuse as "the user is authenticated as staff X." This is why Section 11 proposes a *net-new*, independent identity mapping for Telegram rather than bridging into existing PIN auth.

**"Integrations" is UI-only.** `Integrations.jsx` renders a static disabled ("Coming Soon", `opacity:0.75`) grid for WhatsApp Business, GoFood, GrabFood, ShopeeFood, Xero, Google Sheets — none wired up. The only "WhatsApp" code (`useWhatsApp.js`) opens a client-side `wa.me` deep link, not an API integration. A full-repo grep for `telegram|webhook|claude|anthropic|bot` in `src/` returns zero matches — this design starts from a genuinely blank slate.

**Financial/reporting logic — the highest-value, highest-risk-of-misreplication part of the system for an agent to consume:**

1. **P&L** (`Accounting.jsx`, "Laba Rugi" tab): `grossRevenue = Σ orders.total WHERE status = 'Paid'` (strict equality, excludes null status) → `netRevenue = grossRevenue − Σ orders.discount` → `totalCOGS = Σ orders.cogs` (a *stored* column, computed at sale time via recipe/WAC cost, not recomputed live) → `grossProfit = netRevenue − totalCOGS` → `totalOpex = nonFoodPOTotal + salaryTotal + manualExpenses + wasteTotal + staffMealTotal + max(0, −stockOpnameVariance)` → `netProfit = grossProfit − totalOpex`. Raw-ingredient PO spend is deliberately excluded from opex (it's already inside `orders.cogs` via WAC) — only non-food PO categories, mapped through `SUPPLY_CATEGORY_TO_EXPENSE_CAT`, count as opex. **Git commit `cf50211` shipped exactly this double-count bug historically** (raw-ingredient PO counted both as opex *and* inside COGS), inverting a real profit into a false loss — this is the single most important trap for any agent (or human) re-deriving P&L from raw tables instead of reusing the existing aggregation logic verbatim.
2. **Cash flow** (`Accounting.jsx`, "Arus Kas" tab) is a *different* aggregation, not a reuse of the P&L numbers: `cashIn = Σ orders.total WHERE pay='Cash'`, `cashOut = fullPOTotal (including raw ingredients this time) + salaryTotal + cashManualExpenses`, `netCash = openingBalance + cashIn − cashOut`, with `openingBalance` a manually-edited row in an `opening_balance` table keyed by `YYYY-MM`.
3. **Timezone**: revenue-correct screens (`Accounting`, `Dashboard`, `Rekonsiliasi`, `SalesReport`, `ProductReport`, `TopSlowReport`, `ClosingReport`) filter `orders.created_at` with an explicit hardcoded `+08:00` (WITA) offset string, e.g. `created_at >= '{date}T00:00:00+08:00'`. A separate, still-live bug: `ShiftModal.jsx`/`POS.jsx` compute "today" for the `orders.date` column via `new Date().toISOString().slice(0,10)` (UTC calendar day), so orders placed 00:00–08:00 local can land on the wrong calendar day in that column. Any reporting capability must filter on `created_at` with an explicit `+08:00` boundary and must never use `orders.date` or `.toISOString()` to derive "today."
4. **`shifts.sales` is day-scoped, not cashier-scoped** — `ShiftModal.jsx`'s `closeShift()` sums *all* of that day's Paid orders with no staff/shift filter, so on a two-cashier day both shift rows get the full day's total stamped on them. Any "how much did this shift sell" capability must not read `shifts.sales` at face value.
5. **`explodeOrderPayments(order)`** (`src/shared/orderPricing.js`) is the only correct way to get a per-payment-method breakdown, because `orders.pay` is overwritten to the literal string `"Split"` for any split-bill order. The function reads the true `orders.payments` JSONB array, falling back to `[{method: pay, amount: total}]` for non-split orders. Grouping revenue by raw `orders.pay` silently misclassifies all split-bill revenue.
6. **Status-filter convention is already inconsistent across existing screens**: `Dashboard.jsx`/`SalesAnalysis.jsx`/`OwnerApp.jsx` treat null/missing status as implicitly Paid; `Accounting.jsx`/`SalesReport.jsx`/`ProductReport.jsx`/`TopSlowReport.jsx` use a strict `.eq("status","Paid")`. The reporting agent should follow Accounting.jsx's strict convention, since that's the human-facing source of truth for P&L, and should surface null-status rows as a data-quality signal rather than silently folding them in.
7. **Low-stock**: `ingredients.min_stock` is the only threshold column. Canonical rule (InvOverview/InvIngredients): out = `stock<=0`; low = `min_stock>0 AND 0<stock<=min_stock`; an ingredient with `min_stock` unset/0 can never be "low," only "out." `InvStockCompare.jsx` uses strict `<` instead of `<=` — a minor, low-stakes inconsistency worth normalizing once, not two different definitions surfacing through an agent.
8. **`InvStockCompare.jsx` is not a theoretical-usage reconciliation** — it compares period purchases against current on-hand stock, not recipe-expected-consumption vs actual. An agent capability built on this data must not claim to answer "did we lose stock to waste/theft," only "purchased vs. on-hand."
9. **Offline queue = silent eventual-consistency gap.** `src/lib/offlineStore.js` (IndexedDB) + `src/shared/dbWrite.js` (the single write path for all `orders` inserts/updates from POS — finalize, void, split, merge) queue writes locally when offline or on a 5s timeout/network error. `useOfflineSync.js` drains the queue on `online`, a 30s interval, and mount — but only from that device, once back online. There is no server-side signal of "N orders pending sync somewhere." Any Supabase-backed sales figure is therefore a *lower bound*, and the gap is silent — figures move later without any flag. Any agent answer derived from live data needs a freshness disclaimer, not a blocking condition.

**Staff submission/approval workflow** (`staff_submissions` table, `StaffSubmissions.jsx` "Staff Reports" module): columns `id, type (opname/waste/production/consumption/requisition), status (pending/approved/rejected), submitted_by, submitted_at, reviewed_by, reviewed_at, notes, data (jsonb, shape varies by type)` — confirmed live. Nothing submitted from Staff Portal touches stock until a Backoffice manager approves it. Recent history (commit `419a535`) fixed a real bug where an orphan-approval check silently truncated on large batches, producing false-positive anomaly flags — evidence that even this "safe" human-gated write path has had correctness bugs, reinforcing why a *new* agent-driven write path (Section 8) should start from zero trust, not from assuming the existing pattern is already robust.

## 3. Agent Boundary Proposal (Proposed — not built)

The core design principle: **the agent never talks to the raw database.** It talks to a small, versioned, explicitly-defined *agent data layer* — a set of named capabilities, each backed by one fixed, reviewed query or one fixed, reviewed write path. This is deliberately narrower than "give Claude a Postgres connection and a schema dump," because Section 2 shows the schema alone is not sufficient to answer questions correctly (the P&L double-count trap, the timezone trap, the `shifts.sales` trap, the `orders.pay` trap all show that *correct* answers require encoded business logic, not just raw SQL access).

Five tiers, increasing in what the agent is trusted to do:

1. **Read** — capability returns data, nothing more. No side effects possible even in principle (e.g., `get_today_sales`). Fully covered in Section 5.
2. **Understand** — capability composes multiple reads and applies known domain logic to explain, not just report (e.g., "why was yesterday's profit lower" = pull two days' P&L components and diff them). Still strictly read-only underneath; the "understanding" is Claude's synthesis over Tier-1 reads, not a new database capability.
3. **Propose** — the agent may construct a *draft* of a write (e.g., "record 2kg of chicken waste") and present it back to a human, but the draft is inert until confirmed — nothing is written to Supabase at this tier.
4. **Execute** — the actual write happens, but only for actions in a pre-approved allowlist of reversible, low-blast-radius operations, and only after a Tier-5 confirmation succeeds.
5. **Human-confirm** — a gate, not a capability: any Tier-3 proposal that is allowlisted for real execution must pass through an explicit confirmation step (Section 9) before Tier-4 fires. Tiers 4 and 5 are inseparable in this design — there is no "auto-execute" path proposed anywhere in this document.

Everything this document recommends *building first* (Section 16) lives entirely in Tier 1. Tiers 3–5 are designed here (Sections 8–10) so the boundary is drawn deliberately in advance, not improvised once someone asks "can it also void an order," but they are explicitly out of scope for initial implementation (Section 18).

## 4. Recommended Architecture

**Options considered:**

| Option | Hosting fit | New infra? | Runtime constraints | Fit for this task |
|---|---|---|---|---|
| Cloudflare Worker | Same account already used for Pages (`accountId` present in `deploy.yml`) | No — Workers and Pages share the Cloudflare account/dashboard/`wrangler` toolchain | Standard V8 isolate, `fetch` handler, works well as a Telegram webhook target and as a caller of the Anthropic API and Supabase REST API | **Best fit** |
| Cloudflare Pages Function | Same account, same deploy pipeline (`functions/` directory alongside the SPA, deployed by the *existing* `wrangler pages deploy` step) | No | Same runtime as Workers, but tied to the Pages project's build/deploy lifecycle and routes | Viable, but couples the agent's release cadence to the SPA's |
| Supabase Edge Function | New | Yes — never used by this team; a second deploy tool, secrets store, and log surface | Deno runtime, tied to the Supabase project | Worse fit given the goal of not introducing an unfamiliar platform |
| Long-running Node server (VPS) | New | Yes — new hosting account, new ops burden entirely absent from the current all-static-hosting stack | Full Node runtime, no cold-start/CPU-time limits | Overkill for a low-volume Telegram bot; rejected |

**Recommendation: a dedicated Cloudflare Worker**, not a Pages Function bolted onto the existing SPA project. Reasoning:

- **No new hosting platform.** Cloudflare is already the deploy target (`deploy.yml` already authenticates to the same `accountId`); adding a Worker means one more `wrangler` deploy target under an account that's already provisioned.
- **Independent deploy lifecycle.** A Pages Function ships on every SPA deploy. The agent layer should ship, roll back, and be paused *independently* of the POS/Backoffice/Owner apps — directly serving the "must not risk destabilizing the restaurant" constraint from Section 16.
- **Clean secrets boundary.** A standalone Worker gets its own `wrangler secret` store, distinct from the Pages project's build-time env vars (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, which by Vite convention end up in *client-visible* JS). The agent layer's scoped Supabase credential and Anthropic API key must never be `VITE_`-prefixed or bundled into anything the browser downloads — a separate Worker project makes that structurally obvious rather than a discipline someone has to remember.
- **Rejects Supabase Edge Functions specifically because they'd be net-new infrastructure.** Workers can call the Supabase REST/PostgREST API just as well as a Supabase-hosted function could, since Supabase's Postgres is reachable over HTTPS from anywhere — no offsetting benefit to a second serverless platform.

## 5. Read Capability Catalog (Proposed)

All entries below are **read-only, no side effects**.

### Sales

| Capability | Source | Formula / filter | Sensitivity | Ambiguity/risk |
|---|---|---|---|---|
| `get_today_sales` | `orders` | `Σ orders.total WHERE status='Paid' AND created_at BETWEEN '{today}T00:00:00+08:00' AND '{tomorrow}T00:00:00+08:00'`. MUST use `created_at`+`+08:00` boundary, never `orders.date`/`.toISOString()`. | FINANCIAL | Must decide whether "today" means calendar-so-far or full day; must include the offline-queue freshness caveat in every response. |
| `get_sales_range(start,end)` | `orders` | Same as above, arbitrary date range, strict `status='Paid'` | FINANCIAL | Large ranges may be slow without an index on `(status, created_at)` — confirm one exists before assuming performance. |
| `get_payment_method_breakdown(range)` | `orders.payments` | MUST use `explodeOrderPayments()` logic, not raw `orders.pay` (collapses to `"Split"`) | FINANCIAL | Reimplementing in SQL/JS requires exactly replicating the JSONB-array-with-fallback logic. |
| `get_top_products(range, n)` | `orders.items` (JSONB) | Explode `items[]`, sum `qty`/`price*qty` per item name, over Paid orders in range | INTERNAL | Item names are free-text inside JSONB, not FK'd to `products` — near-duplicate names will silently split one product's total. |
| `get_cashier_closing(shift_id or staff+date)` | `shifts`, `orders` | MUST NOT trust `shifts.sales` directly (day-scoped bug) — must independently recompute Paid-order totals filtered by staff+date, and flag when `shifts.sales` disagrees | FINANCIAL | This capability is a *correction* of an existing broken figure; the response must say so rather than silently presenting a number the app itself doesn't show. |

### Inventory

| Capability | Source | Formula / filter | Sensitivity | Ambiguity/risk |
|---|---|---|---|---|
| `get_low_stock` | `ingredients` | out: `stock<=0`; low: `min_stock>0 AND 0<stock<=min_stock` (inclusive `<=`, InvIngredients convention) | INTERNAL | `InvStockCompare.jsx` uses strict `<` — pick one and state it; ingredients with `min_stock` unset can never surface as "low," only "out." |
| `get_stock_vs_purchases(range)` | `ingredients`, PO tables | Reproduces `InvStockCompare.jsx`'s purchased-vs-on-hand comparison only | INTERNAL | MUST NOT be described as a shrinkage/theft/waste reconciliation — it is not recipe-expected-consumption vs actual. |
| `get_pending_staff_submissions(type?)` | `staff_submissions` | `status='pending'`, optional `type` filter | INTERNAL | `data` JSONB shape varies per `type` — must branch on `type` to render sensibly. |

### Staff

| Capability | Source | Formula / filter | Sensitivity | Ambiguity/risk |
|---|---|---|---|---|
| `get_todays_schedule` | Schedule module's table | Filter to today's date/shift assignments | INTERNAL | Not independently re-verified this session — confirm exact table/columns before building. |
| `get_staff_roster` | `staff` | `id, name, role (jsonb array), permissions` — MUST exclude `salary`, `phone`, `pin` | PII/SENSITIVE for excluded fields, INTERNAL for name+role | `staff.role` is a JSONB array (multi-role) — render as a list. |
| `get_staff_pin_conflicts` | `staff` | Detect duplicate `pin` values across active staff | SENSITIVE (surfaces an auth weakness) | Live snapshot has 2 staff sharing PIN 2222 today — useful, but should probably be owner-only. |

### Finance

| Capability | Source | Formula / filter | Sensitivity | Ambiguity/risk |
|---|---|---|---|---|
| `get_pnl_summary(period)` | `orders`, PO/expense tables | MUST replicate Accounting.jsx's exact chain (Section 2 item 1), excluding raw-ingredient PO from opex | FINANCIAL | Highest-risk capability to get subtly wrong — should port the existing computation, not rederive it. |
| `get_cash_flow_summary(period)` | `orders`, `opening_balance`, PO/expense/salary tables | `cashIn/cashOut/netCash` per Section 2 item 2 | FINANCIAL | A *different* number from `netProfit` over the same period — must always be labeled distinctly. |
| `get_pnl_delta(dayA, dayB)` | derived from `get_pnl_summary` × 2 | Component-by-component diff | FINANCIAL | Tier-2 "Understand" capability — composed entirely from two Tier-1 reads. |
| `get_order_anomalies(range)` | `order_anomalies` | As inserted by `enforce_order_subtotal()` trigger | FINANCIAL/diagnostic | MUST be presented as "flagged, not corrected, not excluded from revenue totals." |

### Operations

| Capability | Source | Formula / filter | Sensitivity | Ambiguity/risk |
|---|---|---|---|---|
| `get_open_tables` | `orders`/`tables` | Orders with an open/unpaid status and an assigned table | INTERNAL | Source of truth not independently re-verified — confirm against `FloorPlan.jsx`/`tables` before build. |
| `get_offline_queue_status` | N/A (device-local only) | — | — | **Cannot exist as a server-side read** — the agent layer has no visibility into any device's local IndexedDB queue. Listed to document a hard limit: this must be a caveat on other answers, never a queryable fact. |

## 6. Capability/Risk Matrix

| Capability | Read/Write | Risk | Data Sources | Agent Allowed? | Human Confirmation? |
|---|---|---|---|---|---|
| `get_today_sales` | Read | Low | `orders` | Yes | No |
| `get_sales_range` | Read | Low | `orders` | Yes | No |
| `get_payment_method_breakdown` | Read | Low | `orders.payments` | Yes | No |
| `get_top_products` | Read | Low | `orders.items` | Yes | No |
| `get_cashier_closing` | Read | Medium (contradicts a UI-shown figure) | `shifts`, `orders` | Yes | No |
| `get_low_stock` | Read | Low | `ingredients` | Yes | No |
| `get_stock_vs_purchases` | Read | Medium (easy to overclaim) | `ingredients`, PO | Yes | No |
| `get_pending_staff_submissions` | Read | Low | `staff_submissions` | Yes | No |
| `get_todays_schedule` | Read | Low | schedule table | Yes | No |
| `get_staff_roster` (name/role only) | Read | Low | `staff` (filtered) | Yes | No |
| `get_staff_roster` (salary/phone/pin) | Read | Critical | `staff` (PII) | **No** | N/A (not exposed) |
| `get_staff_pin_conflicts` | Read | Medium (surfaces security gap) | `staff` | Owner-only | No, but access restricted |
| `get_pnl_summary` | Read | High | `orders`, PO/expense | Yes | No |
| `get_cash_flow_summary` | Read | High | `orders`, `opening_balance` | Yes | No |
| `get_pnl_delta` | Read | High | derived | Yes | No |
| `get_order_anomalies` | Read | Medium | `order_anomalies` | Yes | No |
| `get_open_tables` | Read | Low | `orders`/`tables` | Yes | No |
| `get_offline_queue_status` (server-side) | — | N/A | none exists | Not buildable | N/A |
| *(future)* `submit_staff_waste_report` (draft) | Write, Tier 3 | Medium | `staff_submissions` | Proposal only | Yes — before Tier-4 execution |
| *(future)* create PO draft | Write, Tier 3 | Medium | PO tables | Proposal only | Yes |
| *(future)* edit schedule | Write, Tier 3/4 | Medium-High (real staff attendance impact) | schedule table | Proposal only initially | Yes |
| *(future)* update market price | Write, Tier 4 | Medium (feeds COGS/WAC) | `market_prices` | Only after Tier-3 proven safe | Yes |
| *(future)* void/refund order | Write, Tier 4 | Critical | `orders` | **Excluded indefinitely** | Yes, likely still insufficient |
| *(future)* edit tax/payments config | Write, Tier 4/System | Critical | `app_settings` | **Excluded indefinitely** | N/A — excluded |
| *(future)* edit staff permissions | Write, System | Critical (privilege escalation) | `staff.permissions` | **Excluded indefinitely** | N/A — excluded |
| *(future)* hardware/device config | Write, System | Critical (live POS disruption) | `hardware_devices` | **Excluded indefinitely** | N/A — excluded |

## 7. Data Sensitivity Model (Proposed)

- **PUBLIC/operational** — safe for any authorized Telegram user, no special handling: today's sales figure, top products, table occupancy.
- **INTERNAL** — shouldn't leak outside the business but isn't individually sensitive: low-stock alerts, pending staff submissions, order counts, product mix.
- **SENSITIVE** — reveals something about individuals or internal weaknesses without being classic PII/financial: `staff.role` assignments, `get_staff_pin_conflicts` output, `order_anomalies` (could read as accusatory if misunderstood).
- **FINANCIAL** — money figures and anything feeding them: `orders.total/subtotal/discount/tax/cogs/refund_amount`, P&L/cash-flow outputs, `expenses`, PO totals, `app_settings.payments`.
- **PII** — `customers.name/phone/email/address/dob/notes/marketing_opt_in`; `staff.phone`; `staff.salary` (financial *and* PII).
- **CRITICAL** — exposure or modification can destabilize the system or escalate privilege: `staff.pin` (raw values — currently queryable directly, since Backoffice login itself does a plain `.eq("pin", code)` lookup), `staff.permissions`, `hardware_devices` config, `app_settings.payments`.

**No capability in Section 5 reads `customers` PII fields, `staff.salary`, `staff.pin` values, or `app_settings.payments`/`hardware_devices` contents** — by design, not omission.

## 8. Future Write Model (Proposed — not authorized to build)

**Tier A — Proposal/submission** (lowest risk, mirrors the existing human workflow): draft a `staff_submissions` insert (waste/opname/production/consumption/requisition) with `status='pending'` — identical in effect to the Staff Portal, still gated by the existing Backoffice approval step. Draft a PO as pending/unapproved.

**Tier B — Reversible operational**: schedule edits (reversible in the DB, but a bad output has an immediate real-world consequence — a staff member showing up or not); market price updates (feeds WAC/COGS — "reversible in the DB" doesn't mean "reversible in effect," since a wrong price briefly used gets baked into that order's `cogs` permanently).

**Tier C — Financial**: void/refund orders — **recommend permanent exclusion** (already a source of real bugs in the fully-manual path — the stale-open-bill bulk-void, the orphan-approval truncation bug fixed in `419a535` — and directly changes revenue with no natural undo). Payments/tax config changes — **recommend permanent exclusion** (affects every subsequent transaction system-wide).

**Tier D — Critical/system**: staff permissions edits — **recommend permanent exclusion** (privilege-escalation vector: an agent that can grant `permissions.backoffice=true` can transitively grant itself everything else in this document). Hardware/device configuration — **recommend permanent exclusion** (can disrupt live POS terminals mid-service, no meaningful "confirm before executing" safety net once a printer/scanner misconfigures).

**Recommendation:** only Tier A should ever be reachable by an agent, and even Tier A should launch with a human confirmation gate (Section 9) despite already having a downstream human-approval step — defense in depth, given how many real bugs Section 2 documents even in the fully-manual equivalent. Tiers B, C, D are **permanently excluded** under this design, not "future work" — any later reconsideration should be its own dedicated design review informed by how Tier A performs in production, not pre-approved here.

## 9. Human Confirmation Model (Proposed)

- **Reasoning** happens inside Claude's own turn, not shown unless asked.
- **Proposal** is a plain Telegram message describing the exact action in human terms ("Record 2.0kg chicken waste, reason: spoiled, submitted as [identity]") — never raw JSON.
- **Confirmation UI**: Telegram inline keyboards (`InlineKeyboardMarkup`, `[Confirm] [Cancel]` buttons via `callback_data`) rather than a typed "yes," which is more error-prone in free-flowing conversation.
- **Confirmation token** must encode, at minimum: **action** (exact capability/write name), **parameters** (fully resolved values — not re-derived at confirm time), **requester identity** (Telegram user ID, cross-checked against the identity mapping at confirm time too, not just proposal time), **issued_at/expiry** (short TTL, e.g. 5 minutes), **single-use marker** (consumed on first use — Telegram can redeliver webhook events), **integrity** — recommend a server-held reference (a row in a new `agent_confirmations` table, `callback_data` carries only its ID) over a client-held HMAC blob, since a DB row naturally supports single-use + expiry without the Worker maintaining its own replay cache.

## 10. Audit Model (Proposed)

The existing `audit_logs` table is proven insufficient (client-inserted, sparse, no login events). The agent layer needs its **own** server-side audit log, written unconditionally by the Worker (never skippable by Claude's output or a client), answering for every interaction: who asked (Telegram ID + mapped identity, or "unmapped"); what was accessed (capability + resolved params, for every Tier-1/2 read actually executed); what was proposed (full Tier-3 payload, stored *before* confirmation, so declined proposals are still recorded); was it confirmed (token ID, timestamp, outcome); what executed (the actual write payload — should be byte-identical to what was proposed/confirmed, any divergence is itself a finding); did it succeed (Supabase response/error); human-vs-agent origin.

This should live in a dedicated `agent_audit_log` table, not commingled with the existing `audit_logs` (different shape, and shouldn't retrofit assumptions onto a table the live POS apps depend on).

## 11. Authentication/Security Model (Proposed)

**The existing anon key must never be the agent's credential** — it's a full read/write credential over the entire DB, and a bot is a long-lived, always-on, internet-reachable process, a strictly worse place for that key than a user's own browser tab.

**A Supabase service-role key must never touch Claude, Telegram, or client-facing code** — service-role bypasses RLS entirely, so a prompt-injection surface (a maliciously crafted order note or staff-submission `notes` field later fed back into a Claude prompt) reaching a service-role query would be a full compromise, not a scoped one.

**What should authenticate the agent layer instead**: a scoped credential held only server-side in the Worker, ideally its own Postgres role (distinct from `anon`/`service_role`) with grants narrowed to exactly what Section 5 needs — `SELECT` on `orders`, `ingredients`, `staff_submissions`, no grant on `customers` or on `staff.salary`/`pin`/`phone` columns (via column-level grants or a view), no `INSERT`/`UPDATE`/`DELETE` until Tier-A writes are explicitly authorized. Whether Supabase's plan supports custom Postgres roles beyond `anon`/`authenticated`/`service_role` is open (Section 17) — fallback is a view layer with its own narrower RLS, queried via a role scoped only to those views.

**Telegram identity → authorization**: a small allowlist table, e.g. `telegram_users(telegram_id, staff_id_or_role, active)`, populated manually out-of-band. Every inbound message is checked against it before any capability runs; unmapped senders get a fixed rejection, never a capability response.

**Rate limiting**: needed against both runaway Anthropic API cost and Supabase query volume — a per-Telegram-ID counter in Cloudflare KV/Durable Objects, not Postgres, so a rate-limit check never itself becomes a production DB query.

**Replay protection**: covered in Section 9 — the Worker must always re-validate `callback_data` against server-held state, never trust the token's own claims alone.

## 12. Claude's Responsibilities

**Should**: interpret NL and map to the fixed capability catalog (never write/execute raw SQL); compose Tier-1 reads into Tier-2 answers; draft Tier-3 proposals in plain language with exact executable parameters; proactively surface known caveats (offline-queue lower-bound, `shifts.sales` day-scoping, `order_anomalies` "flagged not corrected"); decline or flag uncertainty for anything outside the capability catalog rather than improvising a raw-table interpretation.

**Should not**: construct/execute arbitrary SQL/PostgREST against Supabase; access any field outside Section 7's boundaries even if explicitly asked (moot if those capabilities simply don't exist); execute a Tier-3/4 write without a validated confirmation token, regardless of confidence; treat a prior turn's proposal as already-confirmed; fabricate a numeric answer when a capability call fails or is ambiguous.

## 13. Telegram Interaction Model (Proposed)

Two entry paths into the same capability layer: **slash commands** for common unambiguous reads (`/sales_today`, `/low_stock`) — 1:1 to a capability, bypass NL interpretation for speed/determinism/auditability; **natural language**, routed through Claude via constrained tool-use, where the capability catalog IS Claude's tool list — it has no other means of getting data. Confirmation UI (Section 9) — proposal message + inline keyboard, `callback_query` → Worker validates server-side → executes → replies with outcome. No write is ever proposed and executed within the same message turn.

## 14. Example Conversations

**1. "What were sales today?"** → `get_today_sales` → `orders WHERE status='Paid' AND created_at BETWEEN today's 00:00+08:00 AND tomorrow's 00:00+08:00`, sum `total` → "Sales so far today: Rp X,XXX,XXX (Y paid orders). Note: this may be a lower bound if any POS device has been offline and hasn't synced yet." → No confirmation.

**2. "Why was yesterday's profit lower than the day before?"** → `get_pnl_delta(2 days ago, yesterday)` → two `get_pnl_summary` calls, each replicating Accounting.jsx's chain → diff each component → "Gross revenue was similar (−2%), but COGS was 8% higher and non-food opex included an extra Rp 400,000 in manual expenses that day — net profit was Rp 350,000 lower, mostly the opex line, not a revenue drop." → No confirmation.

**3. "How much cash do we have from today's sales?"** → `get_cash_flow_summary(today)`, specifically `cashIn` (not `netCash`, since the question is about sales-derived cash, not the full formula including opening balance/outflows) → "Cash-paid sales today: Rp X,XXX,XXX. This differs from the Arus Kas net-cash figure in Accounting, which also nets out today's cash purchases/expenses and the period's opening balance." → No confirmation.

**4. "Which ingredients are running low?"** → `get_low_stock` → out (`stock<=0`) / low (`min_stock>0 AND 0<stock<=min_stock`) → lists separately; flags that ingredients with `min_stock` unset are excluded from "low" by definition. → No confirmation.

**5. "Are there any pending staff reports waiting for approval?"** → `get_pending_staff_submissions()` → grouped by `type` → "3 pending: 1 waste report (X, 2 hours ago), 2 production reports (Y). None reviewed yet — approve in Backoffice > Staff Reports." → No confirmation (agent never approves itself — that stays in Backoffice per Tier-A design).

**6. "Did anything look off with today's orders?"** → `get_order_anomalies(today)` → "2 orders flagged today (diff > Rp 5): order #123 (...), order #456 (...). These are flagged, not auto-corrected — their full stored total is still counted in today's sales figure. Worth a manual look." → No confirmation.

**7. "Record 2kg of chicken waste, spoiled."** → Tier-3 proposal for `submit_staff_waste_report` (ingredient=chicken, qty=2kg, reason=spoiled, submitted_by=mapped identity) → "Proposal: record 2.0kg chicken waste, reason 'spoiled', submitted as [Staff Name] via Telegram. This will appear as a pending staff submission requiring Backoffice approval before it affects stock, same as from the Staff Portal. [Confirm] [Cancel]" → **Confirmation required** — on confirm, Worker validates server-side and inserts into `staff_submissions` with `status='pending'`.

**8. "Who's working the closing shift tonight?"** → `get_todays_schedule` filtered to closing shift → lists assigned staff/roles. → No confirmation.

## 15. Recommended Implementation Phases

1. **Phase 0 — Design finalization**: owner review of this document, resolve Section 17's open questions.
2. **Phase 1 — Single read-only vertical slice** (Section 16): one capability end to end, no confirmation flow, no write path, single owner Telegram ID.
3. **Phase 2 — Full read catalog**: remaining Section 5 capabilities, Telegram-ID→staff mapping table if multi-user is wanted, full server-side agent audit log.
4. **Phase 3 — Tier-2 "understand" capabilities**: composed reads like `get_pnl_delta`, once Tier-1 reads are trusted in production.
5. **Phase 4 — Tier-3 proposal flow + confirmation model**: exactly one Tier-A action first (e.g. staff waste submission), full token/audit machinery.
6. **Phase 5 — Review**: whether any Tier-B action is ever worth enabling, informed by Phase 4's real-world performance — not pre-committed here.

## 16. First Vertical Slice (Proposed)

**Recommendation: `get_today_sales`, end-to-end, single-user (owner only), no confirmation flow needed since it's pure read.**

Telegram webhook → Cloudflare Worker → owner-ID allowlist check → Worker queries Supabase via a scoped read credential for `Σ orders.total WHERE status='Paid' AND created_at` bounded by the `+08:00` day window → Worker hands the result to Claude (via the Claude API) to phrase naturally with the offline-queue freshness caveat attached → reply to Telegram.

**Why this one first:**
- **Fully specified already** — exact formula, exact gotcha (`created_at`+`+08:00`, never `orders.date`), exact caveat (offline queue), all documented above. No ambiguity left to resolve mid-build, unlike `get_pnl_summary` (needs the full opex chain ported faithfully) or `get_low_stock` (needs the `<=`/`<` inconsistency resolved as a judgment call).
- **Read-only by construction** — cannot destabilize the live POS regardless of a bug in the new Worker; a wrong answer is embarrassing, not damaging, and easy to catch by comparing against Dashboard/Accounting directly.
- **High-value** — plausibly the single most commonly-asked owner question, a meaningful test of end-to-end usefulness, not just a tech proof-of-concept.
- **Independent of everything else** — no new tables needed (`agent_confirmations`/`agent_audit_log`/`telegram_users` all deferrable), no write path, no confirmation-token machinery, one allowlisted user. Minimal first-time surface area: one Worker, one scoped read-only credential, one Anthropic API call, one Telegram bot token.
- **Exercises every architectural layer once, cheaply** — proves the Worker-as-webhook pattern, the scoped-credential-vs-anon-key separation, and the Claude-tool-use-over-fixed-capabilities pattern, all reused by every later capability.

## 17. Risks and Open Questions

- **Supabase plan/custom Postgres roles**: not verified whether the current plan supports a role distinct from `anon`/`authenticated`/`service_role` with custom grants, or whether the fallback (view layer + narrower RLS on views) is what's actually available. Confirm before Phase 1 — this decision drives Section 11's credential model.
- **Cloudflare Workers enablement**: Pages is confirmed active on the account; whether Workers is already enabled or needs an opt-in/paid-tier step is unverified.
- **Telegram confirmation UX in practice**: inline keyboards are standard, but double-tap/bot-restart-between-proposal-and-confirmation edge cases need real validation in Phase 4, not just design-time assumption.
- **Single-user vs multi-user Telegram access**: Section 11's allowlist supports both; whether the business wants only the owner or also select managers is an open product question. Phase 1 sidesteps it (single-user); Phase 2 needs an answer.
- **Anthropic API cost/rate behavior at real volumes**: not modeled — instrument from Phase 1 onward, Section 11's rate limit is a placeholder, not a tuned number.
- **`Schedule`/`tables` module schema** (for `get_todays_schedule`/`get_open_tables`) not independently re-verified this session, unlike the tables directly queried above.
- **Whether `staff.salary`/`staff.phone` exist as columns** — stated in the original brief as consistent with prior context, not independently re-confirmed via direct query this session. Worth a direct schema check before Phase 1, since Section 7's PII classification depends on it.
- **Legacy tables in `fix_rls_security.sql`** (`gl_journals`, `ar_items`, `ap_items`, `kitchen_tickets`, `employees`) weren't otherwise encountered this session — possibly superseded by the current accounting/staff tables; worth a quick check so the eventual credential/role design doesn't accidentally grant or ignore something stale.

## 18. Explicit "DO NOT BUILD YET"

Per the project owner's explicit instruction, **nothing in this document authorizes any of the following to happen now**:

- No Telegram bot is created or configured.
- No Cloudflare Worker is deployed.
- No changes to Supabase RLS policies, roles, or grants.
- No new database migrations (no `agent_confirmations`, `agent_audit_log`, `telegram_users`, or any other new table).
- No changes to authentication anywhere in the existing apps (Backoffice PIN lookup, Owner App hardcoded PIN, Staff Portal PIN flow all remain exactly as they are).
- No changes to any existing app (`POS.jsx`, `Accounting.jsx`, `Backoffice.jsx`, `OwnerApp.jsx`, `Integrations.jsx`, etc.) — this is a design document for a wholly separate, additive layer, not a refactor proposal.
- No Anthropic API key, Telegram bot token, or scoped Supabase credential is provisioned or stored as part of this task.

This document's sole output is the design; implementation begins only in a future, explicitly-scoped session.

---

### Part I's original first-slice recommendation (superseded — see Unified Recommendations)

This section is kept for context on how the design evolved: prior to Part II being added, the recommended starting point was simply the Phase 1 vertical slice above — a single Cloudflare Worker that (1) receives a Telegram webhook, (2) checks the sender against a single hardcoded owner Telegram ID (no allowlist table yet), (3) queries Supabase for `get_today_sales` using a newly created, read-only-scoped credential, (4) hands the result to Claude to phrase a natural-language reply including the offline-queue freshness caveat, and (5) replies on Telegram — no write capability, no confirmation-token system, no changes to the existing SPA/RLS/schema. **This is still the literal first slice** (see Unified Recommendations, Section U.2) — Part II adds a second slice immediately after it, rather than replacing it.

---

# PART II — Staff Conversational Operations Layer

**Status: Design document only — same constraints as Part I (Section 18 applies to this Part too, extended below). Builds on Part I's architecture (Cloudflare Worker, scoped credential, confirmation-token model, agent audit log) rather than introducing a second system.**

## P2.1 Why this is a distinct part, not just more capabilities

Part I is read-only and single-audience (owner/manager asking questions). Part II is fundamentally different on three axes that matter architecturally: it **writes** (proposes real operational events), it's **multi-user** (potentially every station's staff, not one owner), and a meaningful chunk of it requires **multimodal input** (photos of invoices and scales, not just text). It reuses Part I's Worker, credential model, and confirmation pattern — it does not reinvent them — but the capability catalog, the interaction model, and the schema-impact story are all new and are documented separately here for that reason.

## P2.2 Additional findings (verified this session, not in Part I)

**PawonLoka has no receiving/discrepancy-reconciliation concept today — this is the single most important finding for this Part.** `InvPO.jsx` conflates "paid" with "received": a PO is created as `status:"Unpaid"` with `items[]` (`ingredient_id, qty, unit, unit_cost, total_cost`), and marking it `Paid` (or `Partial`, which is a *financial* partial-payment concept, not a physical-quantity one) applies the **entire ordered `qty`** to stock via the WAC cascade — there is no `received_qty` field distinct from ordered `qty`, no intermediate "goods arrived, invoice unpaid" state, and no re-entry step at the moment goods physically arrive. **A Telegram "Receiving" workflow is therefore proposing genuinely new functionality PawonLoka doesn't have anywhere today, not a conversational front-end to an existing reconciliation step.** The closest existing analog for "adjust a stock effect after the fact based on a delta" is `reconcileApprovedProduction()` (`StaffSubmissions.jsx`), which computes a new-minus-old delta and applies just that — a pattern worth reusing conceptually for Receiving, but it doesn't exist for POs today.

**The WAC cascade (`InvPO.jsx`'s `computePaidPOChanges`/`cascadeRecalc`, ~140 lines) is intricate, client-side-only JS with built-in price-outlier guards** (blocks a save outright if a new unit cost is >20x or <0.05x the ingredient's existing cost; warns/confirms between 5x–20x and 0.05x–0.2x). There is no server-side (DB function/trigger) equivalent — it only runs when a human clicks through the InvPO.jsx UI. This is a hard constraint on Receiving's design (Section P2.4): a Telegram flow cannot safely trigger this cascade directly from a Worker without either (a) porting ~140 lines of guarded financial logic into the Worker and keeping it in lockstep with the UI's copy forever, or (b) not triggering it at all from Telegram — instead proposing a receiving record that a human finalizes through the existing InvPO.jsx UI, where the guards already live. **(b) is the recommended design.**

**`staff_submissions` approval has no reviewer identity tracking and no station-scoped authorization at all.** `reviewed_by` is a real column but is **never set** by any code path (confirmed via grep) — only `reviewed_at` is written. `approveOne()`/`reject()` have zero permission gating beyond the page-level coarse `permissions.backoffice === true` check; there's no per-module toggle for the Staff Reports screen in `UsersAccess.jsx`'s `bo_modules` list. **Any staff member with generic backoffice access can approve or reject any submission of any type today, regardless of station.** Separately, submission to `/staff` itself has **no authentication at all** — `StaffPortal.jsx` picks `submitted_by` from a plain button list of names filtered by a hardcoded station→department map; anyone who knows a colleague's name and has the URL can submit as them. Two implications for this design: (1) a Telegram-based flow, by binding a Telegram account to a specific staff identity via an allowlist (Section P2.6), is a **strict identity improvement over the status quo**, not just parity; (2) station-scoped workflow routing ("only Kitchen can use Receiving") has to be built from scratch server-side — nothing today enforces `StaffPortal.jsx`'s `STATION_DEPTS`/`MENUS` maps beyond client-side UI convenience.

**Breakage and equipment maintenance tracking do not exist anywhere in the codebase** — confirmed via an exhaustive repo grep (`breakage`, `kerusakan`, `maintenance`, `perbaikan`, `rusak`, plus a full-tree unrestricted pass): zero hits beyond an unrelated npm-package mention. `Assets.jsx` (the closest existing analog) is a pure acquisition/depreciation ledger — `{id, name, category, qty, unit_price, amount, acquired_date, notes}` — with no status, condition, or maintenance-schedule field, and no relation to any waste/damage record. These two workflows are **entirely new schema surface**, unlike Receiving/Stock Count/Waste/Production/Requisition, which all have an existing `staff_submissions` type and approval branch to extend.

**The photo-upload pattern is well-established and directly reusable.** `ClockInOutModal.jsx`'s attendance-photo flow: client-side downscale to 640px longest-side + JPEG-compress via `<canvas>.toDataURL('image/jpeg', 0.82)` → convert to a `Blob` → `supabase.storage.from(<bucket>).upload(filename, blob, {upsert:true, contentType:'image/jpeg'})` (wrapped in a 4s timeout so a bad connection never blocks the action) → `getPublicUrl()` → store the resulting URL as a plain text column on the parent record. Every existing bucket (`attendance-photos`, `product-images`, `logos`) is public with public URLs, no signed-URL/private-bucket pattern in use anywhere. **Any Telegram-sourced photo (invoice, scale, waste, breakage, maintenance) should follow this exact contract** — new single-purpose public buckets (e.g. `receiving-evidence`, `incident-evidence`), not a new pattern.

**`stock_movements` is the shared, append-only ledger every existing write path emits into** (`{id, type, ingredient_id, ingredient_name, qty (signed), unit, ref → points at the originating WST/CSM/OPN/PRD/SS/PO id, note, date, time}`), and it's what the orphan-approval detector (Section 2/Part I, commit `419a535`) cross-references to catch writes that didn't fully apply. **Any new Telegram-originated stock-affecting write must also emit into this table with the same `type`/`ref` conventions**, or it becomes invisible to that existing integrity check.

**Minor but relevant data-quality notes surfaced this session** (not blocking, but should inform capability design so it doesn't silently propagate them): two different ID schemes write into the same tables depending on origin (`"WST-"+Date.now()` from staff-submission approval vs `"WST-"+String(n+1).padStart(3,'0')` from direct manager entry in `InvWaste.jsx` — same for `staff_consumption`); `MarketPrices.jsx` hardcodes `checked_by:"Claudy"` regardless of who's actually logged in (a live bug, not something to inherit); `Departments.jsx` has a live display bug comparing `staff.role` (array) to a department name (string) with `===`, so its "N staff" counts are always wrong — don't use `Departments.jsx`'s own aggregation as a reference for anything.

## P2.3 Workflow Capability Catalog

Every workflow below follows the **same shape**: staff input (text/photo/voice) → deterministic pre-processing where possible → AI extraction/classification only where NL or vision understanding is genuinely required → a plain-language **proposal** (Section 9's model, reused verbatim) → confirmation → **execution = the same insert an existing app would make**, wherever an existing insert path exists.

| # | Workflow | Existing PawonLoka substrate | New schema needed? | Deterministic parts | AI-required parts |
|---|---|---|---|---|---|
| 1 | **Receiving** | None (see P2.2) — closest is `purchase_orders`, but no receiving/discrepancy concept exists | Yes — a `received_qty`-bearing record distinct from the PO; recommend a **new `staff_submissions` type `"receiving"`** (reuses the existing pending/approved scaffold + `StaffSubmissions.jsx` list UI) rather than a bespoke table, with a **new approval branch** (deferred, not built now) that a human finalizes by re-entering the reconciled quantities into the existing `InvPO.jsx` "Bayar Faktur" flow — i.e. Telegram produces a *reviewable record*, the actual WAC-cascade-triggering write still happens through the existing, guarded UI | Matching a photographed invoice's supplier name against `suppliers`; matching invoice line items against `ingredients` by name; diffing invoice qty vs scale-read qty once both are numbers | OCR/vision extraction of invoice line items (supplier, items, qty, unit, cost) from a photo; vision reading of a digital scale display (numeric-only but visually noisy — flag as the lowest-confidence extraction in the whole catalog) |
| 2 | **Stock Count / Opname** | `staff_submissions` type `opname` → `stock_opname` + `stock_movements(Adjustment)` on approval — fully existing, untouched | No | Unit conversion (reuse `toBaseUnit()`/`ingredients.conversions[]` verbatim, ported into the Worker — **never let Claude do this arithmetic**, per the owner's explicit ask); variance calc (`actual − system`) | Resolving a spoken/typed ingredient name to an `ingredients.id` when ambiguous; reading a scale-photo's numeric display |
| 3 | **Waste** | `staff_submissions` type `waste` → `waste_records` + `stock_movements(Waste)` on approval — fully existing, untouched | No | Cost calc (`qty_base × ingredients.cost_per_unit`, **not** estimated by Claude); reason mapped to the existing fixed enum (`Expired/Damaged/Overproduction/Spillage/Other`) | Ingredient name resolution from free text; classifying a free-text reason into the enum (fallback `Other` + verbatim note when it doesn't fit) |
| 4 | **Breakage** | None — net new | Yes — recommend a **new `staff_submissions` type `"breakage"`** (same reasoning as Receiving: reuse the pending/approved scaffold rather than a bespoke table) with a **new approval branch** that, unlike opname/waste/production, has **no stock effect** — approval is acknowledgment/ticket-close, optionally cross-referencing `assets` by name/category for context. "Replacement implications" should surface as a note in the proposal (e.g. "this may need a requisition/PO") — **never auto-create a PO/requisition from a breakage report**; that's a sourcing decision that needs a human | None beyond standard field capture | Item/location resolution from free text; photo evidence classification is optional/cosmetic here (a human reviews the photo directly, no extraction needed) |
| 5 | **Maintenance** | None — net new | Yes, and structurally different from the other 7: equipment repair is a **multi-stage ticket** (reported → acknowledged → in progress → resolved), not a single approve/reject event like everything else in `staff_submissions`. Recommend Phase-1 scope of *only* the initial report (reuse `staff_submissions` type `"maintenance"`, status stays pending/approved/rejected same as everything else — "approved" here just means "manager has seen it and logged it"), and **defer the multi-stage lifecycle question** (a `data.status` sub-field vs. a dedicated `maintenance_tickets` table) to a later design pass once real volume/usage is known — don't over-build a ticket system speculatively | None beyond standard field capture | Equipment/location resolution from free text |
| 6 | **Production** | `staff_submissions` type `production` → `production_batches` + `stock_movements(Production)` on approval — fully existing, untouched | No | The ingredient-expansion math `StaffPortal.jsx` already does client-side (`sub_recipe_ingredients × batch multiplier = ingredients_used[]`) — **port this exact deterministic logic into the Worker**, don't have Claude compute it | Resolving a spoken/typed dish/sub-recipe name to a `sub_recipes.id` when ambiguous |
| 7 | **Requisition** | `staff_submissions` type `requisition` → **no stock effect, no fulfillment tracking** (approval today is a bare status flip + optional manual supplier-tagging + WhatsApp-deep-link convenience UI) — fully existing, untouched, but genuinely thin | No | Date parsing | Ingredient/qty/unit resolution from free text. **Be honest in any staff-facing response that requisition approval doesn't do anything more today than it did before Telegram existed** — this workflow doesn't get any more "acted upon" via Telegram than via the web form; that's a pre-existing product gap, not something this design fixes |
| 8 | **Purchasing intelligence** | Read-only composition over `ingredients` (stock, `min_stock`), `stock_movements` (trailing consumption rate — a deterministic proxy for demand, no sales-forecast feature exists in PawonLoka to draw on instead), `purchase_orders` (`status='Unpaid'` = already on order, must not double-recommend), `suppliers`, `market_prices`/`ingredients.conversions[].last_price` | No, for the read/recommend path. A "draft PO" output is a **Tier-3 proposal only** (same as Section 8/Part I's Tier A) — never auto-creates a live PO | Trailing-consumption-rate math; days-until-stockout projection; cross-checking against open POs | Phrasing the recommendation in natural language; deciding what's worth flagging vs noise when several signals disagree |

## P2.4 Multimodal Ingestion Architecture

- **Photos** (invoice/nota, scale display, waste/breakage/maintenance evidence): Telegram delivers photo messages as file references the Worker downloads via the Bot API, then either (a) forwards to Claude's vision input for extraction (invoice line items, scale numeric reading) or (b) stores as-is via the existing `storage.from(<bucket>).upload()`/`getPublicUrl()` pattern (Section P2.2) with the URL attached to the eventual `staff_submissions.data.photo_url` — no new upload mechanism, just new single-purpose buckets.
- **Voice**: Telegram voice messages can be transcribed (a real Bot API feature — voice notes arrive as an OGG file) before being treated as any other free-text input; recommend transcription happen via the same Claude API call used for NL interpretation rather than a separate ASR step, to avoid adding a second AI vendor/cost line for a first version.
- **Documents** (e.g. a PDF invoice instead of a photo): out of scope for v1 — recommend the bot instructs staff to send a photo instead if a document is received, rather than building a second extraction path (PDF parsing) before the photo path is proven.
- **Video** (maintenance evidence): store only, per the deterministic/AI-cost-minimization principle below — **do not run vision analysis on video frame-by-frame**; a human reviewing a stored video clip directly is both cheaper and more reliable than attempting automated video understanding for an equipment-fault report. This is a deliberate scope cut to control cost and complexity, not a platform limitation.
- **Confidence handling, uniformly across all extraction**: every AI-extracted field must clear a confidence bar (a fuzzy-match score against the canonical `ingredients`/`sub_recipes`/`suppliers` name list for entity resolution; a self-reported or Worker-side plausibility check for vision extraction, e.g. a scale reading with no discernible digits) before it's allowed into a proposal. Below-bar fields trigger a **clarifying question turn first** — the system must never silently guess into a confirmable proposal. For OCR'd invoice data specifically, the proposal itself should echo the full extracted structure back ("Invoice: Supplier X, 3× Lemineral @ Rp46,000 = Rp138,000 — correct?") so confirmation doubles as the human's accuracy check on the OCR, not just an authorization gate.

## P2.5 Deterministic vs. AI — a first-class design principle

Stated once here because it applies to every workflow above, not per-workflow:

- **Always deterministic, never delegated to Claude**: unit conversion (`toBaseUnit()` ported verbatim), variance/diff arithmetic, cost calculations, sub-recipe ingredient expansion, low-stock/consumption-rate math, confirmation-token validation, every database write. The owner's instruction ("calculate variance deterministically") generalizes to all arithmetic in this system — an LLM should never be the thing computing a number that gets written to the database.
- **AI-required**: natural-language intent parsing, fuzzy entity resolution when input is ambiguous (best done as a deterministic string-similarity pre-filter that narrows to a short candidate list, with Claude only breaking ties or confirming — not a raw LLM guess over the full ingredient table), vision/OCR extraction, free-text reason/category classification, drafting human-readable proposals and recommendations, open-ended "why"/analysis answers (Tier 2).
- **Cost minimization**: route unambiguous, rigidly-structured input (Telegram slash commands like `/waste chicken 2kg spoiled`, or a Telegram Mini App form where feasible) through zero-LLM deterministic parsing entirely — reserve a Claude call for free-text or photo input where NL/vision understanding is actually load-bearing. Cache canonical name lists (`ingredients`, `sub_recipes`, `suppliers`) in Worker-side KV rather than re-querying Supabase every message. Reserve larger/slower reasoning calls for the composed Tier-2 "Understand"/purchasing-recommendation capabilities; use a smaller/cheaper model for straightforward single-field extraction and classification.

## P2.6 Telegram Interaction Model — Evaluated

The owner explicitly asked to evaluate this rather than default to one giant group chat. Options considered:

| Option | Description | Assessment |
|---|---|---|
| **A. Separate bot per workflow** | 8 distinct `@bot` accounts/tokens, one per workflow | Maximum UI separation, but 8 bot tokens/webhooks to provision and operate for no real benefit — every bot would hit the same Worker/capability catalog anyway, so the "separation" is cosmetic at the cost of real operational overhead. **Rejected.** |
| **B. One bot, command-routed 1:1 DMs** | Single bot, staff DM it directly, `/receiving`/`/waste`/etc. commands switch context within one linear chat history | Simplest to build, but mixes every workflow into one undifferentiated DM thread per staff member — doesn't give the "focused conversation" feel the owner wants, and a station team can't see each other's submissions in-context (each staffer's DM is private to them and the bot). |
| **C. One bot, one Supergroup, one Topic per workflow** | Telegram's real "Forum/Topics" feature on Supergroups — named sub-threads within one group (e.g. "PawonLoka Receiving", "PawonLoka Stock", "PawonLoka Waste"...) that behave like separate channels while staying one group to administer | Closest fit to the owner's explicit examples. One bot/one webhook/one Worker to build, but staff get genuinely separated, named, focused conversations — and a station team can see relevant recent activity in their topic, which a set of private 1:1 DMs cannot offer. Telegram Topics also support per-topic posting permissions in a Supergroup, which maps naturally onto station-scoped access (Section P2.2's gap) if configured that way. |
| **D. Hybrid — recommended** | **(1)** Staff operations (workflows 1–7 above) via Option C: one Supergroup with Topics, one topic per workflow, all staff joined to the group but scoped by topic-relevant station. **(2)** Management reporting (Part I) stays a **separate 1:1 DM** with the owner/manager(s), never the shared group — financial data (P&L, cash flow) doesn't belong in a shared operational space even a topic-scoped one, and Part I's audience is small, fixed, and different in kind from "all staff." | **Recommended.** This maps the interaction model onto the same audience/sensitivity split the capability design already makes (Part I = owner-only/financial, Part II = staff-wide/operational) rather than forcing one UI to serve both. Whether Part I and Part II end up as one Telegram bot account internally routing by chat type, or two separate bot tokens sharing the same Worker backend, is a minor implementation detail deferred to build time — the Worker's routing should not hardcode a single-bot-token assumption, so that split remains possible without a rewrite later. |

## P2.7 Staff Identity, Permissions, and Workflow-Specific Access

Extends Part I Section 11's Telegram-ID mapping: `telegram_users(telegram_id, staff_id, active, stations[])` — the `stations[]` addition is new, needed because (per P2.2) **no server-side station-scoped authorization exists anywhere in PawonLoka today**; `StaffPortal.jsx`'s station→menu mapping is hardcoded client-side JS with zero enforcement. The Worker should check `stations[]` (or reuse `staff.role`, the existing jsonb department array, read server-side rather than trusted from a client) before allowing a message in a given Topic to route to that workflow's capability — this is a **net-new, stronger** enforcement point than exists today, not merely parity. Because `/staff` currently has no authentication at all (anyone who knows a name can submit as them), binding a Telegram account to a specific staff identity via this allowlist is a genuine security improvement, worth stating plainly rather than treating this Part as pure risk addition.

## P2.8 Backoffice Integration & Schema Impact Summary

- **Zero Backoffice code changes required** for Stock Count, Waste, Production, and Requisition (workflow rows 2, 3, 6, 7) — a Telegram-originated submission is byte-for-byte the same shape as a Staff-Portal-originated one (`staff_submissions` insert, `status:'pending'`), so it appears in the existing `StaffSubmissions.jsx` "Staff Reports" queue and goes through the existing approval branches untouched. This is the single biggest reason those four workflows are safer and cheaper to build first.
- **New Backoffice work required, deferred, not built now**: Receiving and Breakage need new `type` values recognized by `StaffSubmissions.jsx` plus new approval branches (Receiving's branch specifically should hand off to the existing `InvPO.jsx` "Bayar Faktur" UI rather than trigger the WAC cascade itself, per P2.2). Maintenance needs, at minimum, a way to see/acknowledge reports in that same screen, and possibly its own lifecycle UI later if ticket volume justifies it.
- **No changes to any existing approval branch's current behavior** — every extension here is additive (new `type` values, new `if` branches), never a modification of how opname/waste/consumption/production/requisition are approved today.

## P2.9 Staff Portal — Coexistence, Not Replacement

Recommend explicitly **against** planning a Staff Portal replacement. The Portal is a proven, zero-inference-cost interface that is likely still faster for bulk structured entry (a staff member standing at a screen tapping through a 50-ingredient opname count) than a conversational flow would ever be. Telegram's real advantage is for the moments a phone conversation beats a workstation: reporting waste while walking past a spoiled item, capturing a delivery while physically unloading it, flagging equipment damage in the moment. Position this Part as an **additional entry point into the same `staff_submissions` substrate**, evaluated for actual replacement only if real usage data later shows staff strongly prefer it — not decided here.

## P2.10 Cross-Workflow Intelligence (Phase 3+, not v1)

Concrete, schema-grounded examples of Tier-2 "Understand" composition across workflows, once each individual read/write capability is trusted in production: (a) Receiving discrepancies, aggregated by supplier over time, become a supplier-reliability signal for Purchasing Intelligence — nothing like this exists today (`InvSuppliers.jsx` has no price-history or reliability field); (b) waste rate by ingredient should temper Purchasing Intelligence's consumption-rate-only projection — high spoilage-waste on an ingredient may mean "buy less, more often," not "buy more"; (c) production's ingredient consumption (`production_batches.ingredients_used`) should count toward the same trailing-consumption-rate calculation as sales-driven `stock_movements`, not be treated as a separate signal; (d) an ingredient with a pattern of large negative Stock Count variances is itself worth proactively flagging (a shrinkage signal), conceptually adjacent to Part I's `order_anomalies` — "things that are flagged, not corrected, and worth a human look." None of this requires new write capability, only capabilities that read across tables already covered individually above.

---

# Unified Recommendations (supersedes Part I Sections 15/16/18)

## U.1 Revised Implementation Phases

1. **Phase 0 — Design finalization**: owner review of both Parts; resolve Part I Section 17's open questions (Supabase custom-role support, Cloudflare Workers enablement) plus this Part's open questions below.
2. **Phase 1 — Single read-only vertical slice**: `get_today_sales` (Part I, unchanged from before) — proves the foundational Worker/credential/Telegram/Claude pattern with zero write risk. See U.2.
3. **Phase 2 — First write-capable slice**: staff **Waste** submission via Telegram (Part II) — the lowest-complexity, highest-reuse write workflow (existing schema, existing approval path, no OCR, single-item, deterministic cost calc). Proves the confirmation-token/proposal pattern that every other write in this document depends on. See U.2.
4. **Phase 3 — Remaining zero-new-schema workflows**: Stock Count, Production, Requisition (Section P2.3 rows 2, 6, 7) — same pattern as Phase 2, increasing input complexity (multi-item counts, sub-recipe resolution) but no new Backoffice work.
5. **Phase 4 — Full Part I read catalog + agent audit log buildout**: remaining Section 5/Part I capabilities, multi-user Telegram-ID mapping if wanted for management reporting.
6. **Phase 5 — New-schema workflows**: Receiving and Breakage (new `staff_submissions` types + new Backoffice approval branches — real, scoped Backoffice code changes, reviewed on their own before building); Maintenance's initial-report-only scope.
7. **Phase 6 — Purchasing Intelligence** (Tier-2 read/recommend) and **Phase 7 — cross-workflow intelligence** (Section P2.10) — once Phases 1–5 have real production data to reason over.

## U.2 The First Vertical Slice(s)

Two, deliberately, because Part II's addition means "read" and "write" are genuinely different risk classes that shouldn't be collapsed into one slice:

**Literal first slice — `get_today_sales` (unchanged from Part I Section 16).** Still the right true starting point: pure read, cannot destabilize anything, fully specified formula, proves the Worker/credential/webhook/Claude pattern that every later capability — in both Parts — depends on.

**Immediately following it — staff Waste submission via Telegram (Part II's first write).** Recommended over the other 7 workflows because: it has a fully existing schema and approval path (`staff_submissions` type `waste` → `waste_records` + `stock_movements`, untouched by this design); it needs no vision/OCR (unlike Receiving/Stock Count's scale-photo option); it's single-item per submission (unlike Stock Count's potentially-large item list or Receiving's multi-line invoice); its cost calculation is a one-line deterministic multiply (`qty_base × ingredients.cost_per_unit`), giving a simple, verifiable "did this work" check by watching `ingredients.stock` actually decrement after approval. It exercises the full proposal→confirm→execute→audit chain (Sections 8–10/Part I) that Receiving, Breakage, and Purchasing-Intelligence's draft-PO action will all reuse later, at the lowest possible complexity.

## U.3 Revised Risks and Open Questions (adds to Part I Section 17)

- **Vision/OCR accuracy on real supplier notas**: Indonesian small-supplier invoices are often handwritten or low-quality printed receipts — untested how reliably Claude's vision extracts structured line items from these in practice; Receiving's design (P2.3 row 1) assumes confirmation-as-accuracy-check compensates, but this needs real-world validation before Phase 5, not just design-time assumption.
- **Digital scale photo reading**: reading a 7-segment LCD/LED display from a phone photo is a narrower, noisier vision task than document OCR — flagged in P2.3 as the lowest-confidence extraction in the whole catalog; may need a manual-entry fallback offered proactively rather than only on request.
- **Telegram Topics API maturity/permissions in practice**: Topics/Forums is a real, shipped Telegram feature, but per-topic posting permissions and Bot API support for creating/managing topics programmatically should be validated hands-on before committing Phase 2+'s UI to it — a design-time read of the Bot API docs is not the same as confirming it behaves as expected with real staff accounts.
- **Video storage cost/retention**: maintenance video evidence (P2.4) is store-only by design, but Supabase Storage cost/retention limits for video specifically (larger than photos) aren't sized here — worth a rough volume estimate before Phase 5.
- **Whether `track_stock` (a real `ingredients` column, confirmed live) is respected everywhere it should be**: not verified this session whether Stock Count/Waste/Production's existing approval logic already skips stock effects for ingredients with `track_stock:false` — a Telegram-driven write path must check this the same way the existing approval code does (or, if the existing code doesn't check it either, that's a pre-existing gap worth flagging separately, not silently inherited).
- **Two ID schemes writing into the same tables** (`Date.now()`-based vs sequential, per origin) — a Telegram writer should pick one (recommend the timestamp-based scheme, matching the approval-path convention) rather than adding a third.

## U.4 Explicit "DO NOT BUILD YET" (extends Part I Section 18 to Part II)

In addition to everything Part I Section 18 already excludes: no Telegram Supergroup, Topics, or bot commands are created; no new Supabase Storage buckets (`receiving-evidence`, `incident-evidence`, etc.) are created; no new `staff_submissions` type values or new `StaffSubmissions.jsx` approval branches are added to the codebase; no `telegram_users` (or `stations[]`-extended) table is created; no vision/OCR provider integration is wired up. This Part, like Part I, is design only.

---

## Key Files Referenced

- `src/lib/supabase.js` — the anon-key client pattern the new scoped credential must NOT replicate
- `src/backoffice/components/Accounting.jsx` — canonical P&L/cash-flow formulas
- `src/shared/orderPricing.js` — canonical `explodeOrderPayments`/`computeOrderTotals`/`impliedDiscountPct`
- `supabase/migrations/20260723000000_order_consistency_trigger.sql` — the one existing server-side enforcement point and `order_anomalies` schema
- `.github/workflows/deploy.yml` — existing Cloudflare deploy pipeline the new Worker should sit alongside
- `fix_rls_security.sql` — the permissive-RLS baseline to deliberately narrow away from
- `src/backoffice/Backoffice.jsx` / `src/owner/OwnerApp.jsx` — actual PIN auth mechanisms (corrects a `PAWONLOKA_BRAIN.md` inaccuracy, noted in Part I Section 2)
- `src/backoffice/components/StaffSubmissions.jsx` — the approval-branch pattern (opname/waste/consumption/production) every new Part II workflow type extends
- `src/backoffice/components/inventory/InvPO.jsx` — the WAC cascade + price-outlier guards Receiving must hand off to, not replicate
- `src/staff/StaffPortal.jsx` — the existing submission-creation pattern (`submit()`, `STATION_DEPTS`/`MENUS`) and the client-side-only station routing Part II's Telegram routing must reimplement server-side
- `src/pos/components/ClockInOutModal.jsx` — the photo-upload pattern (compress → bucket → public URL) every Part II evidence photo reuses
- `src/shared/unitConversion.js` — `toBaseUnit()`, to be ported verbatim for deterministic Stock Count/Waste/Receiving math

# CLAUDE.md — Industrial Exhaust Fan Ecommerce Platform (exhaustfan.xyz)

This file is read by Claude Code (or any AI coding agent) before touching this codebase.
If anything here conflicts with a one-off instruction in chat, this file wins unless the
project owner explicitly says otherwise.

---

## 0. What this project is

A B2B/B2C hybrid ecommerce site for **exhaustfan.xyz** selling industrial exhaust
fans in Bangladesh. It is NOT a normal retail store — it must support online purchase,
request-for-quotation, and sales-lead generation simultaneously, because industrial buyers
often need a quote/consultation, not a checkout button.

Full requirements, architecture, and schema were defined in `PROJECT_REQUIREMENTS.md`,
`SYSTEM_ARCHITECTURE.md`, and `DATABASE_SCHEMA.md` (source docs — read these before any
non-trivial task; this file is the operative summary + rulebook).

---

## 1. Stack (do not change without approval — see Rule 4)

| Layer          | Choice                                                      |
| -------------- | ----------------------------------------------------------- |
| Frontend       | Next.js + TypeScript + React + Tailwind + shadcn/ui         |
| Backend        | Next.js Server Components + Server Actions / Route Handlers |
| Database       | PostgreSQL via Supabase                                     |
| Auth           | Supabase Auth                                               |
| Storage        | Supabase Storage                                            |
| Hosting        | Vercel                                                      |
| Source control | GitHub                                                      |
| Monitoring     | Sentry (or equivalent)                                      |
| Analytics      | Google Analytics + Search Console                           |

No separate Express backend, no microservices, no Kafka/Kubernetes/Redis cluster/
Elasticsearch unless a real requirement proves it's needed. Keep it boring.

---

## 2. Non-negotiable trust boundary

The browser is NEVER the source of truth for: **price, discount, payment status, admin
role/permission, inventory, shipping cost, order totals.** The server recalculates and
verifies all of these independently every time. If you find yourself trusting a value that
came from `req.body` or client state for any of these, stop and fix it.

Concretely this means:

- Cart/checkout totals are recalculated server-side from the DB at order-creation time.
- Payment is only marked `PAID` after gateway/webhook verification — never from a client
  redirect or success-page visit.
- Every admin action re-checks permissions server-side, even if the button was hidden on
  the frontend for that role.

---

## 3. Core data model (logical — see DATABASE_SCHEMA.md for full field lists)

```
Category → Product → Product Images / Product Specifications / Product Variants
                                            → Inventory
                                            → Inventory Movements
                                            → Cart Items
                                            → Order Items
                                            → Quotation Items

Customer → Addresses / Orders / Quotations / Leads

Order → Order Items / Order Address / Status History / Payments / Shipments
```

Key rules baked into this schema:

- **Products have variants** (e.g. 24"–54" fan sizes), each with its own SKU, price,
  stock, and technical specs. Never model this as flat products.
- **Order items are historical snapshots** (name, SKU, unit price at time of sale) —
  never recompute a past order from current product data.
- **order_status** and **payment_status** are separate state machines. Never conflate them.
- **Inventory movements are append-only transactions**, not a single editable stock number.
- Money uses `numeric`/`decimal` or integer minor units — never JS floats as the authority.
- Prefer soft states (`ARCHIVED`, `CANCELLED`, `INACTIVE`) over hard deletes for orders,
  payments, inventory movements, and audit logs.

Human-readable IDs: orders `MPE-2026-000001`, quotations `QT-2026-000001`. Never expose
raw internal UUIDs as customer-facing order numbers.

---

## 4. Admin roles

`SUPER_ADMIN`, `ADMIN`, `SALES`, `ORDER_MANAGER`, `CONTENT_MANAGER`. Permissions are
enforced via a `roles` / `permissions` / `role_permissions` table, checked server-side on
every sensitive action. Hiding a button is not security — say this to yourself before
every admin feature you ship.

---

## 5. How to work on this codebase — required workflow

For every non-trivial task, follow: **READ → ANALYZE → PLAN → IMPLEMENT → TEST → REVIEW →
DOCUMENT → REPORT.**

### Before writing code

1. Read `PROJECT_REQUIREMENTS.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, and this
   file. Don't assume architecture from memory or from a similar project you've seen before.
2. Inspect existing code relevant to the task.
3. State a short plan: objective, files expected to change, database impact, security
   impact, implementation steps, tests required. For architectural changes (swapping DB,
   auth, hosting, payment architecture, folder structure), stop and get explicit approval
   before implementing — explain current architecture, the problem, the proposed change,
   benefits, risks, and migration impact first.

### Scope discipline

- **Implement only the requested phase/feature.** "Build product category management"
  is a valid task. "Build the entire ecommerce website" is not — break it down first.
- Don't touch unrelated features (e.g. a search task shouldn't touch auth or checkout).
- Don't add a dependency, framework, or infra piece (Redis, GraphQL, Docker Swarm, a new
  UI framework, a new DB) unless the task explicitly requires it. Check if the existing
  stack already solves the problem first.

### Code quality bar

- TypeScript, avoid `any` unless unavoidable (and say why in a comment).
- Validate every external input (forms, query params, route params, API payloads, webhook
  payloads) — Zod if the project has standardized on it.
- Centralize business logic (order totals, inventory reservation, order-number generation,
  status transitions) — don't duplicate it across routes/components.
- Clear names (`calculateOrderTotal()`, not `handleStuff()`).
- No giant files mixing UI + DB + auth + payment + email in one place.
- Comments explain _why_, not _what_.
- Never swallow errors silently (`catch {}`). Log internally, return a safe message to
  the user, never leak stack traces / SQL / env vars / file paths to the client.

### Money / inventory / payments specifics

- Webhook handlers must be idempotent (use provider event IDs) — a duplicate webhook must
  not double-create payments, orders, or inventory adjustments.
- Inventory changes need transactions/atomic operations to avoid race conditions
  (available = on_hand − reserved).
- Never mark an order PAID from client JS, a URL query param, or a bare redirect —
  only from verified gateway/webhook response.

### After writing code

- Run type-check, lint, tests, and build where available. Don't claim success if any fail.
- Explicitly state what was **Tested** vs **Reviewed** vs **Not Tested** vs **Unable to
  Test** — never claim a test passed that wasn't actually run.
- If something fails: say what failed, where, the likely reason, whether the feature is
  safe to use as-is, and the recommended next step. Don't hide failures.

### Reporting back (every completed task)

Use this shape:

```
TASK COMPLETED
Feature: [name]
Implemented: [bullets]
Files Created: [list]
Files Modified: [list]
Database Changes: none / [details — tables/columns/constraints/indexes/migration file/
                   rollback risk]
Environment Variables: none / [details, and confirm .env.example was updated]
Tests Performed: [list, or "not run — reason"]
Build Status: PASS / FAIL
Known Issues: [list]
Security Notes: [list]
Recommended Next Step: [one thing]
```

Plus a plain-language explanation for a non-coder: what was built, why, how to test it,
what changed, and known limitations. The project owner is a non-coder — write for that.

---

## 6. Hard stops — ask before proceeding

Ask the project owner (don't silently decide) when a choice materially affects business
behavior, customer experience, security, cost, architecture, database, or an external
service. Don't invent business rules that have real money/policy consequences — delivery
pricing, return period, warranty length, COD limits, dealer discounts, minimum order
value. Use a configurable placeholder and document the assumption instead of guessing.

Never do these without explicit approval:

- `DROP DATABASE`, `DROP TABLE`, `TRUNCATE`, bulk `DELETE`, resetting prod data.
- Hard-deleting orders, payments, inventory movements, or audit logs.
- Changing DB engine, auth provider, hosting, state management, payment architecture,
  or folder structure.
- Manually altering the production database schema outside a migration.
- Creating fake/seed/demo data anywhere near production.

Git safety: check `git status` before large changes; don't clobber uncommitted work;
keep commits focused.

---

## 7. Security checklist (applies to every feature, not just a final pass)

HTTPS, server-side auth + authorization, input validation, output encoding, SQL
injection prevention, XSS protection, CSRF-aware design, rate limiting, secure cookies,
secure password handling, no secrets in client bundles, webhook signature verification,
payment verification, upload validation (type/MIME/size/extension, no executable uploads,
don't trust filenames), audit logging on admin actions (price changes, inventory
adjustments, order cancellations, refunds, permission changes), error monitoring.

Never log passwords, tokens, payment secrets, or API keys.

---

## 8. Performance / SEO / accessibility baseline

- Paginate, index, cache — never load full tables into the browser.
- Optimize + lazy-load images, prefer WebP/AVIF.
- Product URLs are slug-based (`/products/48-inch-industrial-exhaust-fan`), never
  `?id=12345`. Product pages stay server-rendered/indexable — don't accidentally make
  them client-only.
- Mobile-first. Every feature must work on small mobile before it's considered done.
- Semantic HTML, labeled forms, keyboard navigation, visible focus states, alt text.

---

## 9. MVP scope (v1) — build this, not more

Responsive site, homepage, categories, products + variants + specs + images, search,
filters, cart, guest checkout, Cash on Delivery, order management, inventory, order
tracking, quotation requests, lead management, admin dashboard, product admin, customer
management, contact/WhatsApp/phone CTAs, SEO, analytics, security, audit logging.

Explicitly **not** in MVP: online payment gateway, courier API, PDF quote/invoice,
customer accounts, coupons, reviews, Bangla/English toggle, SMS, advanced reports,
mobile app, microservices, multi-vendor, loyalty programs, recommendation AI, chatbots,
multiple warehouses, advanced accounting. If a task starts drifting into these, flag it
rather than quietly building it.

---

## 10. Source-of-truth docs in this repo

- `PROJECT_REQUIREMENTS.md` — full functional requirements (this file's Section 0–15 origin)
- `SYSTEM_ARCHITECTURE.md` — full architecture detail (Section 16–24 origin)
- `DATABASE_SCHEMA.md` — full table-by-table schema (Section 25–63 origin)
- `PHASE_SEQUENCE.md` — the part-by-part build order with one prompt per phase
- `CLAUDE.md` — this file

Keep code and docs in sync: if behavior or architecture changes, update the relevant doc
in the same task.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

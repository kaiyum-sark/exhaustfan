# SYSTEM_ARCHITECTURE.md — Industrial Exhaust Fan Ecommerce Platform (exhaustfan.xyz)

Derived from `PROJECT_REQUIREMENTS.md` and `CLAUDE.md`. Describes structure only — no
code in this document. If a later phase needs to deviate from anything here (different
folder layout, added infra), that's an architectural change and needs the same
stop-and-approve treatment as CLAUDE.md Section 5 describes, not a silent drift.

---

## 1. Stack

| Layer          | Choice                                                      | Why (no alternative needed)                                                                                                                                      |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Next.js (App Router) + TypeScript + React                   | Server-rendered product pages for SEO (`PROJECT_REQUIREMENTS.md` §4.2), one codebase for public site + admin                                                     |
| Styling / UI   | Tailwind CSS + shadcn/ui                                    | Fast, consistent component layer; no separate design-system build needed at this scale                                                                           |
| Backend        | Next.js Server Components + Server Actions + Route Handlers | Business logic and public site live in one deployable; route handlers reserved for cases that need a stable HTTP contract (webhooks, external callbacks)         |
| Database       | PostgreSQL via Supabase                                     | Relational model fits the order/product/variant schema (`PROJECT_REQUIREMENTS.md` §3) exactly; transactions needed for checkout (`PROJECT_REQUIREMENTS.md` §4.5) |
| Auth           | Supabase Auth                                               | Admin-only in MVP (no customer accounts — `PROJECT_REQUIREMENTS.md` §2.1); avoids building a second auth system                                                  |
| Storage        | Supabase Storage                                            | Product images; same platform as DB/Auth, one set of credentials to secure                                                                                       |
| Hosting        | Vercel                                                      | Native Next.js support, preview deployments per branch/PR                                                                                                        |
| Source control | GitHub                                                      | —                                                                                                                                                                |
| Monitoring     | Sentry (or equivalent)                                      | Error visibility in production, per CLAUDE.md §1                                                                                                                 |
| Analytics      | Google Analytics + Search Console                           | Per `PROJECT_REQUIREMENTS.md` Phase 16 event list                                                                                                                |

**Explicitly not used, and why:** no separate Express/Fastify backend (Next.js server
runtime covers it); no microservices (single bounded domain — one store, not a
platform); no Kafka/message queue (no async event volume that needs one — inventory
reservation happens inside a DB transaction, not an event pipeline); no Redis (Postgres

- Next.js caching covers session/catalog needs at this traffic scale); no
  Elasticsearch (Postgres full-text/`ILIKE`/trigram search is sufficient for a
  single-category product catalog of this size); no GraphQL (server actions + typed data
  access already give end-to-end type safety without a second query layer). If real usage
  ever outgrows one of these, that is a future architectural-change decision, not a
  default to build against now (CLAUDE.md §1).

---

## 2. Layering

```
Presentation  →  Business logic  →  Validation  →  Data access  →  Database
```

Request flow is always top-to-bottom; a layer only talks to the layer directly below
it. Nothing in Presentation queries the database directly, and nothing in Data Access
contains business rules.

### 2.1 Presentation

- Public pages (`app/(public)/...`) and admin pages (`app/admin/...`).
- React Server Components fetch data by calling Business Logic functions — never by
  importing a Supabase client directly into a page/component.
- Client Components (cart UI, variant selector, admin forms) call Server Actions; they
  never call the database or trust their own local state as authoritative (cart price
  shown client-side is display-only, per `PROJECT_REQUIREMENTS.md` §4.4).

### 2.2 Business logic

- Where the rules from CLAUDE.md §2 and `PROJECT_REQUIREMENTS.md` §7 actually live:
  `calculateOrderTotal()`, inventory reservation/release, order-number and quotation-
  number generation, order/payment/quotation/lead status transitions, permission
  checks.
- Centralized per domain (one module owns order-total math; nothing else recomputes it)
  so a rule is never duplicated across a route handler and a server action (CLAUDE.md
  §5, code quality bar).
- Pure-ish functions where possible: given validated input + current DB state, produce
  a result or a set of writes. Makes the money/inventory logic testable in isolation.

### 2.3 Validation

- Every external input — form submission, server action argument, route handler body,
  webhook payload, query/route param — is parsed through a schema (Zod, matching
  CLAUDE.md's standardization) before business logic ever sees it.
- Validation rejects malformed/out-of-range input before it reaches business logic; it
  does not itself decide business rules (e.g. "is this price correct" is business
  logic, not validation).

### 2.4 Data access

- Thin repository-style functions per entity (products, variants, orders, quotations,
  leads, inventory movements, etc.) that wrap Supabase queries.
- This is the **only** layer allowed to import a Supabase client for reads/writes.
  Business logic calls these functions; it never builds raw queries inline.
- Server-side Supabase client used for all authoritative reads/writes (price, stock,
  order state). A separate limited client may be used from the browser only for things
  that are safe to be public (e.g. reading already-public product/catalog data), never
  for anything in the trust boundary (Section 3).

### 2.5 Database

- PostgreSQL (Supabase), schema per `DATABASE_SCHEMA.md` (Phase 2 — not yet written).
- Row Level Security (RLS) is enabled as defense-in-depth on every table, but it is
  **not** a substitute for the application-layer checks in Sections 2.2/2.3/3 — both
  exist, because CLAUDE.md's rule is "hiding a button is not security," and the same
  reasoning applies to relying on RLS alone if the application layer ever has a bug.
- Multi-step writes that must be atomic (checkout: recompute total → create order →
  snapshot order items → reserve inventory) run inside a single database transaction,
  per `PROJECT_REQUIREMENTS.md` §4.5.

---

## 3. Server-trust boundary

Restated from CLAUDE.md §2 as an architectural rule, with the enforcement point named
for each:

| Value                          | Never trusted from                                   | Recomputed / verified at                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price / discount               | Client cart state, form fields, hidden inputs        | Business logic layer, re-reading current variant price from DB at order-creation time (`PROJECT_REQUIREMENTS.md` §4.4–4.5, test case "Manipulated Price")                                                                             |
| Payment status                 | Client redirect, success-page visit, URL query param | Only set to `PAID` by a server-verified gateway/webhook event or an explicit authenticated staff action (COD) — never by the checkout flow itself (test case "Fake Payment Success")                                                  |
| Admin role / permission        | Client-hidden UI, cached session claim on the client | Server Action / Route Handler re-checks role/permission against the DB on every sensitive call (test case "Unauthorized Admin")                                                                                                       |
| Inventory / stock availability | Client-displayed "in stock" badge, cart contents     | Business logic layer recomputes `on_hand − reserved` from DB inside the same transaction that creates the order (test case "Out of Stock")                                                                                            |
| Shipping cost / order totals   | Any client-supplied total                            | Business logic layer sums server-verified line items + server-configured shipping rule (`PROJECT_REQUIREMENTS.md` §11 — shipping pricing model is still an open business decision, but wherever it lands, it is computed server-side) |

Concretely: a Server Action or Route Handler that touches any row in this table must
call into Business Logic (Section 2.2) to get the authoritative value — it must never
read that value out of the request payload and use it directly.

---

## 4. Top-level folder structure

```
/
├─ app/
│  ├─ (public)/                     # public site route group
│  │  ├─ page.tsx                   # homepage
│  │  ├─ products/
│  │  │  ├─ page.tsx                # catalogue + filters/search
│  │  │  └─ [slug]/page.tsx         # product detail (server-rendered)
│  │  ├─ cart/page.tsx
│  │  ├─ checkout/page.tsx
│  │  ├─ track-order/page.tsx       # order number + phone lookup
│  │  ├─ quotation/page.tsx         # RFQ form
│  │  ├─ consultation/page.tsx      # "Find the Right Fan" lead form
│  │  └─ contact/page.tsx
│  ├─ admin/
│  │  ├─ login/page.tsx
│  │  ├─ layout.tsx                 # protected layout: redirects unauthenticated
│  │  ├─ dashboard/page.tsx
│  │  ├─ products/...
│  │  ├─ inventory/...
│  │  ├─ orders/...
│  │  ├─ quotations/...
│  │  ├─ leads/...
│  │  ├─ customers/...
│  │  ├─ content/...                # pages/FAQs, SEO fields
│  │  └─ settings/...               # roles/permissions, COD config, etc.
│  └─ api/
│     └─ webhooks/...               # route handlers for verified external callbacks (payment gateway, once added)
│
├─ actions/                         # Server Actions, grouped by domain
│  ├─ products.ts
│  ├─ cart.ts
│  ├─ checkout.ts
│  ├─ orders.ts
│  ├─ quotations.ts
│  ├─ leads.ts
│  └─ admin-auth.ts
│
├─ lib/
│  ├─ business/                     # Section 2.2 — the only place business rules live
│  │  ├─ pricing.ts                 # calculateOrderTotal(), variant price lookup
│  │  ├─ inventory.ts               # reserve/release/adjust, movement recording
│  │  ├─ order-numbering.ts         # MPE-YYYY-NNNNNN generation (prefix per PROJECT_REQUIREMENTS.md §0)
│  │  ├─ quotation-numbering.ts     # QT-YYYY-NNNNNN generation
│  │  ├─ status-transitions.ts      # allowed order/payment/quotation/lead status moves
│  │  └─ permissions.ts             # role/permission evaluation
│  ├─ validation/                   # Section 2.3 — Zod schemas per form/action
│  ├─ data/                         # Section 2.4 — Supabase-backed repositories
│  │  ├─ products.ts
│  │  ├─ inventory.ts
│  │  ├─ orders.ts
│  │  ├─ quotations.ts
│  │  ├─ leads.ts
│  │  └─ admin-users.ts
│  ├─ supabase/
│  │  ├─ server.ts                  # server-side client (service role / authenticated server context)
│  │  └─ client.ts                  # browser client, public-data-only usage
│  └─ auth/
│     └─ require-role.ts            # server-side guard used by admin actions/pages
│
├─ components/
│  ├─ ui/                           # shadcn primitives
│  ├─ public/                       # product cards, variant selector, cart, checkout form, etc.
│  └─ admin/                        # admin tables, forms, dashboards
│
├─ types/                           # shared TypeScript types (entity shapes, enums for statuses)
│
├─ supabase/                        # migrations + config (populated from Phase 2 onward)
│
├─ public/                          # static assets (favicon, static images)
│
├─ .env.example                     # DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.
├─ CLAUDE.md
├─ PROJECT_REQUIREMENTS.md
├─ SYSTEM_ARCHITECTURE.md
├─ DATABASE_SCHEMA.md               # Phase 2, not yet written
└─ PHASE_SEQUENCE.md
```

Notes:

- `(public)` is a route group so the public site can have its own layout (header/nav/
  footer) separate from `admin`'s protected layout, without affecting URLs.
- `app/api/` stays reserved for things that genuinely need a raw HTTP contract
  (payment-gateway webhooks in a later phase). Everything else — including admin
  mutations and checkout — goes through Server Actions in `actions/`, so it shares the
  same Validation → Business Logic → Data Access path as the rest of the app rather
  than becoming a second, differently-secured API surface.
- No `pages/` (Pages Router) directory — App Router only, per the stack in Section 1.

---

## 5. Admin authentication & authorization flow

1. Admin visits `/admin/*` → `admin/layout.tsx` checks for a valid Supabase session
   server-side. No session → redirect to `/admin/login`. (Test case: "Unauthorized
   Admin.")
2. On a sensitive Server Action (e.g. change order status, edit price, delete a
   product), the action itself calls `lib/auth/require-role.ts` before doing anything
   else — independent of whether the calling page already gated the UI. This is what
   makes "hiding a button is not security" (CLAUDE.md §4) actually true in this
   codebase.
3. Roles/permissions (`SUPER_ADMIN`, `ADMIN`, `SALES`, `ORDER_MANAGER`,
   `CONTENT_MANAGER` — `PROJECT_REQUIREMENTS.md` §2.2) are stored in
   `roles`/`permissions`/`role_permissions` tables (schema detail in
   `DATABASE_SCHEMA.md`, Phase 2), not hardcoded role-name string checks scattered
   through the codebase — one permission-check function, reused everywhere.

Customers are **not** Supabase Auth users in MVP — guest checkout and order tracking
(order number + phone) are handled entirely through Data Access + Business Logic, with
no session/login concept for buyers (`PROJECT_REQUIREMENTS.md` §2.1, §9).

---

## 6. Checkout transaction flow (illustrates the layering end-to-end)

1. **Presentation:** customer submits checkout form (cart contents are just item
   references + quantities, not trusted prices).
2. **Validation:** Zod schema checks shape (valid address fields, phone format,
   non-empty cart, quantities are positive integers).
3. **Business logic:** for each item, re-fetch the variant's current price and stock
   from Data Access; recompute the order total server-side; determine order number;
   determine required inventory reservation.
4. **Data access / Database:** inside one transaction — insert order, insert order
   items as historical snapshots (name/SKU/price at this moment), insert inventory
   movement(s) of type `RESERVATION`, decrement available stock. If stock is
   insufficient for any line, the whole transaction is rejected (test case "Out of
   Stock") and nothing partially commits.
5. Response back to Presentation only after the transaction has committed — the order
   number shown to the customer always corresponds to a real, committed order row.

This same shape (Presentation → Validation → Business Logic → Data Access → DB, one
transaction for multi-row writes) is the pattern for every other mutating flow: admin
price/inventory edits, quotation-to-order conversion, order/payment status changes.

---

## 7. Deployment & environments

- **Hosting:** Vercel. Production deployment from `main`; preview deployments per
  branch/PR (useful for reviewing each phase in `PHASE_SEQUENCE.md` before merging).
- **Environment variables:** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` at minimum (Phase 3 will finalize the full list in
  `.env.example`). Service-role key is server-only — never exposed to the client
  bundle (CLAUDE.md §7).
- **Monitoring:** Sentry (or equivalent) wired for server and client error capture in
  production.
- **Analytics:** Google Analytics + Search Console, events per
  `PROJECT_REQUIREMENTS.md` Phase 16 list (`product_view`, `add_to_cart`,
  `begin_checkout`, `purchase`, `quotation_submitted`, etc.).
- **Backups:** production Supabase project has automated backups configured before go-
  live (Phase 18) — not an MVP-build-time concern, but the schema/data model
  (`DATABASE_SCHEMA.md`) should not assume backups are someone else's problem later.

---

## 8. Traceability

This document implements the stack/security/data-model constraints already fixed in
`CLAUDE.md` §1–§3 and answers the "how is it built" question for every functional
requirement in `PROJECT_REQUIREMENTS.md` §4–§5. The next phase, `DATABASE_SCHEMA.md`,
should treat Section 4's `lib/data/` repository boundaries and Section 3's trust-
boundary table as fixed inputs — the physical table design comes next, not a
reconsideration of this layering.

# PHASE_SEQUENCE.md — Part-by-Part Build Order

How to use this: work top to bottom, one phase at a time. Don't start phase N+1 until
phase N is reviewed and working. Each phase has a **copy-paste prompt** — hand it to
Claude Code (or paste in chat) as-is, in a fresh or focused session. Claude Code will read
`CLAUDE.md` automatically if it's at the repo root.

Do not skip ahead and ask for "the whole site" — that's the one thing this whole plan
exists to prevent (see CLAUDE.md Rule 2).

---

## Phase 0 — Requirements doc

**Goal:** Lock the business requirements before any code exists.
**Prompt:**

> Using the attached spec, write `PROJECT_REQUIREMENTS.md` for the Industrial Exhaust
> Fan Ecommerce Platform (exhaustfan.xyz). Cover business objectives, target
> users, product model (products + variants), functional requirements for public site
> and admin, order/payment/quotation/lead statuses, and MVP vs Phase 2 vs future-feature
> scope. Don't write any code yet.

**Done when:** you've read it and it accurately reflects what MPE needs.

---

## Phase 1 — Architecture doc

**Prompt:**

> Using `PROJECT_REQUIREMENTS.md`, write `SYSTEM_ARCHITECTURE.md`. Specify the stack
> (Next.js/TypeScript/Tailwind/shadcn, Supabase Postgres/Auth/Storage, Vercel), the
> layering (presentation → business logic → validation → data access → DB), the
> server-trust boundary (price/discount/payment/role/inventory never trusted from the
> browser), and the top-level folder structure. No microservices, no extra infra unless
> justified. No code yet.

**Done when:** the doc matches CLAUDE.md Section 1–2 and you agree with the folder layout.

---

## Phase 2 — Database schema doc

**Prompt:**

> Using `SYSTEM_ARCHITECTURE.md`, write `DATABASE_SCHEMA.md` with the full logical table
> design: profiles, admin_users, roles, permissions, role_permissions, customers,
> customer_addresses, categories, products, product_variants, product_specifications,
> product_images, inventory, inventory_movements, carts, cart_items, orders, order_items,
> order_addresses, order_status_history, payments, payment_events, shipments,
> shipment_events, quotations, quotation_items, leads, lead_notes, coupons, reviews,
> pages, faqs, settings, audit_logs. Include field lists, key constraints, indexes, and
> the money/deletion/timestamp rules from CLAUDE.md. No SQL migration files yet — logical
> design only.

**Done when:** every relationship in CLAUDE.md Section 3 is represented and nothing here
surprises you.

---

## Phase 3 — Project foundation

**Prompt:**

> Scaffold the Next.js + TypeScript + Tailwind + shadcn/ui project per
> `SYSTEM_ARCHITECTURE.md`. Set up environment variable structure (`.env.example` with
> DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY placeholders),
> Supabase connection, linting, formatting, and the base folder structure from
> `SYSTEM_ARCHITECTURE.md`. No product/order features yet — just a working empty shell
> that builds and deploys.

**Done when:** `npm run build` passes and you can deploy an empty shell to Vercel.

---

## Phase 4 — Admin authentication

**Prompt:**

> Implement admin authentication at `/admin` using Supabase Auth: login, logout, a
> protected admin layout that redirects unauthenticated users, and the `roles` /
> `permissions` / `role_permissions` tables with server-side authorization checks (not
> just hidden UI). Seed one SUPER_ADMIN user. Follow the "Unauthorized Admin" test case
> in the spec.

**Done when:** an unauthenticated visit to `/admin` is blocked, and role checks happen
server-side, verified by a test.

---

## Phase 5 — Product administration

**Prompt:**

> Implement admin CRUD for categories, products, variants, specifications, and images
> per `DATABASE_SCHEMA.md`. Support product status (DRAFT/ACTIVE/ARCHIVED — only ACTIVE
> shows publicly), image upload with validation (type/MIME/size, safe storage paths, no
> executable uploads), and SEO fields (title, meta description, slug). No public pages
> yet — admin-only.

**Done when:** you can create a product with 3+ variants and specs without touching code.

---

## Phase 6 — Inventory

**Prompt:**

> Implement inventory tracking: `inventory` (on_hand, reserved, low_stock_threshold) and
> append-only `inventory_movements` (PURCHASE, SALE, RESERVATION, RESERVATION_RELEASE,
> RETURN, DAMAGE, ADJUSTMENT). Available stock = on_hand − reserved, always derived, never
> hand-edited directly. Add a low-stock view in admin.

**Done when:** every stock change produces a movement record, and available stock is
never a single editable number.

---

## Phase 7 — Public product website

**Prompt:**

> Build the public site: homepage (per the structure in CLAUDE.md — hero, sizes, key
> features, applications, how ordering works, quotation CTA, FAQ), product catalogue,
> product detail pages (slug URLs, images, specs table, variant selector), search
> (name/SKU/size/category/spec/tags), and filters (category/size/price/HP/voltage/phase/
> availability). Server-rendered and indexable — no client-only product pages.

**Done when:** a real product with variants is browsable, searchable, and filterable
publicly, and the URL is `/products/<slug>`.

---

## Phase 8 — Responsive review

**Prompt:**

> Audit everything built in Phases 3–7 across small mobile, large mobile, tablet, and
> desktop. Fix any broken navigation, product detail, or spec-table layouts. Report what
> was changed and what's still rough.

**Done when:** nothing built so far is desktop-only.

---

## Phase 9 — Cart

**Prompt:**

> Implement `carts`/`cart_items`: add, remove, update quantity, subtotal. Cart-displayed
> prices are for convenience only — checkout in Phase 10 must recompute from the DB, not
> trust the cart's stored price.

**Done when:** the "Manipulated Price" test case in the spec passes — a tampered client
price is ignored at checkout time.

---

## Phase 10 — Checkout

**Prompt:**

> Implement guest checkout (name/phone/address only, no mandatory account) and full
> checkout form (customer info, Bangladesh address model — district/thana/area/detailed
> address, order notes, payment method selection). On order creation: recompute pricing
> server-side, generate a human-readable order number (`MPE-2026-000001`), create
> order_items as historical snapshots, and reserve inventory — all inside a single
> database transaction.

**Done when:** the "Out of Stock" test case passes (can't order more than available), and
canceling mid-checkout doesn't leave inventory incorrectly reserved.

---

## Phase 11 — Order administration

**Prompt:**

> Build admin order management: list/search/filter orders (by number, customer, phone,
> company, product, SKU), view items and customer, update order_status and payment_status
> independently, add internal notes, record status history, cancel/mark-delivered/print.

**Done when:** order_status and payment_status can be changed independently and every
change is recorded in order_status_history.

---

## Phase 12 — Quotation system

**Prompt:**

> Implement the public quotation request form (customer/company/product/variant/
> quantity/district/installation/message) and admin quotation management (statuses NEW →
> CONTACTED → PREPARING → SENT → ACCEPTED/REJECTED/EXPIRED → CONVERTED_TO_ORDER, set
> prices, convert to order). Quotation number format `QT-2026-000001`. Also implement the
> "Find the Right Fan" consultation form as a lead-generating form only (no automated
> engineering calculations).

**Done when:** a submitted quotation can be priced by admin and converted into a real
order without manual re-entry.

---

## Phase 13 — Payments (COD first)

**Prompt:**

> Implement Cash on Delivery as the first payment method, with admin-configurable COD
> enabled/max-amount/advance-required/district-restriction settings (not hardcoded).
> Structure the payments table and payment flow so an online gateway can be added later
> without a rearchitect: order → payment record → (future) gateway redirect → verification
> → payment update → order update. Do NOT implement a live gateway yet — just the
> COD path and the extensible structure. Confirm the "Fake Payment Success" test case:
> visiting a success URL manually must not mark an order paid.

**Done when:** COD orders work end-to-end and no code path marks PAID without server-side
verification.

---

## Phase 14 — Shipping (manual)

**Prompt:**

> Implement manual shipping tracking: `shipments`/`shipment_events`, admin can set
> tracking number and status, and this feeds the customer-facing order tracking page
> (Order Number + Phone Number lookup, showing Confirmed/Processing/Ready to
> Ship/Shipped/Delivered without exposing sensitive customer data). No courier API
> integration yet.

**Done when:** a customer can track an order with just their order number and phone,
and sees no other customer's data.

---

## Phase 15 — SEO

**Prompt:**

> Implement metadata (SEO title/meta description/canonical URL per product and category),
> sitemap.xml, robots.txt, structured data (Product schema), and alt text enforcement on
> product images. Target the keyword patterns in the spec (e.g. "industrial exhaust fan
> Bangladesh", "48 inch exhaust fan").

**Done when:** Search Console can crawl and validate structured data on a sample product
page with no errors.

---

## Phase 16 — Analytics

**Prompt:**

> Wire up Google Analytics and Search Console. Track events: product_view,
> variant_selected, add_to_cart, begin_checkout, purchase, quotation_started,
> quotation_submitted, phone_click, whatsapp_click, contact_form_submit.

**Done when:** each event fires correctly in GA's real-time view during a manual walkthrough.

---

## Phase 17 — QA + security audit

**Prompt:**

> Run a full audit pass across functional, security, authorization, payment, database,
> SEO, performance, and accessibility, using the critical test cases in the spec
> (Unauthorized Admin, Manipulated Price, Fake Payment Success, Out of Stock) plus the
> full security checklist in CLAUDE.md Section 7. Report pass/fail per area with no
> claims of "tested" unless actually run.

**Done when:** every critical test case passes and you have a written list of any
remaining known issues before launch.

---

## Phase 18 — Production deployment

**Prompt:**

> Prepare production deployment: production Supabase project, production environment
> variables, domain, Vercel production settings, automated database backups, monitoring
> (Sentry or equivalent), analytics confirmed live, and a documented rollback plan. Do
> not run any destructive command against production without my explicit go-ahead.

**Done when:** the site is live on the real domain with backups and monitoring confirmed
working, not just configured.

---

## Notes on using this with Claude Code

- Put `CLAUDE.md`, `PROJECT_REQUIREMENTS.md`, `SYSTEM_ARCHITECTURE.md`, and
  `DATABASE_SCHEMA.md` at the repo root once Phases 0–2 are done — Claude Code reads
  `CLAUDE.md` automatically at the start of every session in that repo.
- Start a **new session per phase** where practical. Long single sessions drift; fresh
  sessions force a re-read of the plan and reduce scope creep.
- If a phase prompt produces something that touches a phase you haven't reached yet
  (e.g. Phase 5 starts wiring payment logic), that's the "do not build the whole website
  at once" rule getting violated — push back and re-scope.

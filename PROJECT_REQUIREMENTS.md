# PROJECT_REQUIREMENTS.md — Industrial Exhaust Fan Ecommerce Platform (exhaustfan.xyz)

## 0. Document status

No separate spec document exists in this repository. This document was derived from
`CLAUDE.md` (the operative rulebook) and `PHASE_SEQUENCE.md` (the phase-by-phase build
plan), both already agreed. Everywhere a real business decision was implied but not
explicitly stated (pricing, limits, thresholds, exact status labels not already named in
those two files), it is marked **ASSUMPTION** below with a placeholder value. Per
CLAUDE.md Section 6, these are not to be treated as final — confirm or correct each one
before the feature that depends on it is built.

One naming inconsistency to resolve: `CLAUDE.md`'s original draft and the acceptance
criteria in `PHASE_SEQUENCE.md` use the order-number prefix `MPE-` (e.g.
`MPE-2026-000001`), implying a company name abbreviation. The current brand is
`exhaustfan.xyz`. **ASSUMPTION:** keep `MPE-` if the registered business entity behind
the site is still "Meghna Power Engineering" (domain and legal/trading name can differ);
otherwise confirm a new prefix (e.g. `EF-`). This document uses `MPE-` as a placeholder
and flags it again in Section 7.

---

## 1. Business objectives

1. Generate direct online revenue for industrial exhaust fans sold in Bangladesh, via
   guest checkout with Cash on Delivery (MVP) — no forced account creation.
2. Capture and convert buyers who are not ready to check out — because industrial
   purchases often need a quote, technical consultation, or company-to-company
   negotiation — via a request-for-quotation flow and a "find the right fan" lead form.
3. Replace informal, offline sales processes (phone calls, WhatsApp, walk-ins) with a
   trackable pipeline: lead → quotation → order → payment → shipment, all visible to
   staff in one admin system.
4. Rank for local commercial-intent search terms (e.g. "industrial exhaust fan
   Bangladesh", "48 inch exhaust fan") to reduce dependence on paid channels over time.
5. Give the business owner (non-technical) a self-service admin panel for products,
   inventory, orders, quotations, and leads — without needing a developer for routine
   operations.
6. Do this without over-building: ship a working MVP quickly (Section 9), and treat
   payment gateways, courier integration, and customer accounts as deliberate Phase 2+
   decisions, not MVP requirements.

---

## 2. Target users

### 2.1 Public / customer-facing

| Persona                                  | Description                                                                                                                                                 | Primary path                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Retail / small buyer**                 | Homeowner, small shop, small workshop needing 1 fan or a small quantity                                                                                     | Browse → variant select → add to cart → guest checkout → COD                                                                        |
| **Industrial / commercial buyer**        | Factory, garment unit, warehouse, restaurant, or contractor needing bulk quantities, technical specs (CFM, HP, voltage, phase, size), or negotiated pricing | Browse or search → request quotation (with company/product/qty/district/installation details) → admin prices it → converts to order |
| **Undecided buyer**                      | Knows they need ventilation but not which fan size/spec fits their space                                                                                    | "Find the Right Fan" consultation form → becomes a lead → sales follow-up (human, not automated engineering calculation)            |
| **Returning customer tracking an order** | Already ordered, wants status                                                                                                                               | Order-tracking page via order number + phone (no account required)                                                                  |

No customer accounts in MVP (Section 9) — every public flow above must work for a
guest.

### 2.2 Internal / admin

Defined in CLAUDE.md Section 4, enforced server-side via `roles` /
`permissions` / `role_permissions`:

| Role              | Typical responsibility                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `SUPER_ADMIN`     | Full system access, including role/permission management                                              |
| `ADMIN`           | Full operational access (products, orders, inventory, quotations, leads)                              |
| `SALES`           | Quotations, leads, customer contact — not necessarily inventory/product edits                         |
| `ORDER_MANAGER`   | Order lifecycle, payment status, shipment tracking                                                    |
| `CONTENT_MANAGER` | Product content, images, SEO fields, pages/FAQs — not pricing/inventory authority unless also granted |

Exact permission-to-role mapping is a configuration decision, not something to hardcode
into page components — "hiding a button is not security" (CLAUDE.md Section 4).

---

## 3. Product model

```
Category
  └─ Product (name, description, category, SEO fields, status: DRAFT/ACTIVE/ARCHIVED)
       ├─ Product Images
       ├─ Product Specifications (spec attributes common to the product line)
       └─ Product Variant (e.g. 24" / 30" / 36" / 42" / 48" / 54")
            ├─ SKU (unique)
            ├─ Price (server-authoritative, numeric/decimal — never a client-trusted float)
            ├─ Variant-level technical specs (CFM, HP, voltage, phase, RPM, noise level, etc. — exact spec fields to be finalized against real supplier datasheets)
            ├─ Inventory (on_hand, reserved; available = on_hand − reserved, always derived)
            ├─ Inventory Movements (append-only: PURCHASE, SALE, RESERVATION, RESERVATION_RELEASE, RETURN, DAMAGE, ADJUSTMENT)
            ├─ Cart Items (reference this variant + quantity)
            ├─ Order Items (historical snapshot: name/SKU/unit price *at time of sale* — never recomputed from current product data)
            └─ Quotation Items (reference this variant + requested quantity)
```

Rules that follow directly from this model (CLAUDE.md Section 3):

- A "product" is never sold directly — a **variant** is what has price, stock, and SKU.
  A product with only one size still has exactly one variant.
- Only `ACTIVE` products/variants are visible on the public site; `DRAFT` and `ARCHIVED`
  are admin-only.
- Order items freeze the name/SKU/price at purchase time — a later price or spec change
  on the product must never alter historical orders.
- Inventory is never a single editable number — every change is a movement record, and
  "available stock" is always computed, never hand-set.

---

## 4. Functional requirements — public site

### 4.1 Homepage

Hero, fan sizes overview, key features, applications/use-cases, "how ordering works"
explainer, quotation CTA, FAQ. (Structure per CLAUDE.md; exact copy/imagery is a design
task, not a requirements decision.)

### 4.2 Catalogue & product detail

- Category browsing and a catalogue/listing view.
- Product detail page at `/products/<slug>` (never `?id=`), server-rendered and
  indexable — no client-only rendering of product content.
- Images, full specs table, variant selector (size/spec picker that updates price and
  stock display).

### 4.3 Search & filtering

- Search across name, SKU, size, category, spec values, and tags.
- Filters: category, size, price range, HP, voltage, phase, availability (in stock /
  out of stock).

### 4.4 Cart

- Add / remove / update quantity, subtotal display.
- Cart-displayed prices are for user convenience only — **not** the source of truth.
  Checkout must always recompute from the database.

### 4.5 Checkout

- Guest checkout only in MVP: name, phone, Bangladesh address (district / thana / area /
  detailed address), order notes, payment method selection.
- Server recalculates pricing, availability, and totals independently of anything sent
  from the client at order-creation time.
- Human-readable order number generated server-side (format: Section 7).
- Order creation, order-item snapshotting, and inventory reservation happen inside a
  single atomic transaction — a failed/abandoned checkout must not leave inventory
  incorrectly reserved.

### 4.6 Payment (MVP: COD only)

- Cash on Delivery, with admin-configurable settings (Section 7.4) rather than hardcoded
  business rules.
- No order is ever marked `PAID` from client-side redirect, URL query param, or bare
  success-page visit — only from a server-verified event. (This applies even to COD:
  "paid" means staff/courier confirmed collection, not that the customer reached a
  thank-you page.)

### 4.7 Order tracking

- Lookup by order number + phone number (no login).
- Shows customer-facing status only (Section 7.1) — never another customer's data, and
  never internal notes/margins/supplier info.

### 4.8 Quotation request

- Public form: customer name/contact, company (optional), product/variant, quantity,
  district, installation context, message.
- Produces a `Quotation` in status `NEW` (Section 7.2), visible to Sales/Admin.

### 4.9 "Find the Right Fan" consultation

- A **lead-generating form only** — collects space/use-case details for a human sales
  follow-up. Explicitly **not** an automated CFM/airflow engineering calculator in MVP
  (CLAUDE.md Section 9 excludes "recommendation AI"; doing real HVAC sizing math without
  qualified review would also be a liability risk to flag, not silently build).

### 4.10 Contact / conversion CTAs

- Phone, WhatsApp, and contact-form CTAs available throughout key pages (product pages,
  quotation flow, homepage).

---

## 5. Functional requirements — admin

### 5.1 Authentication & authorization

- Admin login/logout at `/admin`, Supabase Auth-backed.
- Unauthenticated visits to any `/admin` route are blocked server-side.
- Every sensitive action re-checks role/permission server-side regardless of what the
  UI shows.

### 5.2 Product administration

- CRUD for categories, products, variants, specifications, images.
- Product status workflow: `DRAFT` → `ACTIVE` → `ARCHIVED` (only `ACTIVE` is public).
- Image upload with validation: type/MIME/size limits, safe storage paths, no executable
  uploads, filenames never trusted.
- SEO fields per product: title, meta description, slug.

### 5.3 Inventory administration

- View on-hand/reserved/available per variant, low-stock alerts (threshold configurable
  per variant), full movement history (append-only, audit-friendly).

### 5.4 Order administration

- List/search/filter by order number, customer, phone, company, product, SKU.
- View items, customer, and address detail.
- Update `order_status` and `payment_status` **independently** (they are separate state
  machines — CLAUDE.md Section 3).
- Internal notes, full status-change history, cancel / mark-delivered / print.

### 5.5 Quotation administration

- Manage quotations through their status pipeline (Section 7.2), set/adjust pricing,
  convert an accepted quotation directly into an order without manual re-entry of
  customer/product data.

### 5.6 Lead administration

- View/manage leads generated from the consultation form (and any other lead source),
  add notes, track outcome. Status pipeline: see Section 7.3 (**ASSUMPTION** — no
  pipeline was specified; confirm before building Phase-12 lead management UI).

### 5.7 Customer management

- View customers derived from orders/quotations/leads (no explicit "customer account"
  concept in MVP — records exist from checkout/quotation/lead submission, not from
  registration).

### 5.8 Roles & permissions

- Manage which roles (Section 2.2) can perform which actions, enforced server-side.

### 5.9 Content

- Manage static pages/FAQs and product SEO content (CONTENT_MANAGER scope).

### 5.10 Audit logging

- Price changes, inventory adjustments, order cancellations, refunds, and permission
  changes are all logged with actor, timestamp, and before/after where applicable
  (CLAUDE.md Section 7).

---

## 6. Non-functional requirements (summary — full detail belongs in `SYSTEM_ARCHITECTURE.md`)

- **Security:** HTTPS, server-side auth/authz on every sensitive action, input
  validation on all external input, output encoding, SQL-injection/XSS prevention,
  webhook signature verification (once a gateway exists), no secrets in the client
  bundle, no stack traces/SQL/env values leaked to users.
- **Performance:** paginate/index/cache — never load full tables to the browser;
  optimize and lazy-load images (WebP/AVIF preferred).
- **SEO:** slug-based indexable product/category URLs, sitemap, robots.txt, structured
  data, alt text on all product images.
- **Accessibility & responsiveness:** mobile-first; every MVP feature must work on small
  mobile before being considered done; semantic HTML, labeled forms, keyboard nav,
  visible focus states.
- **Data integrity:** money as `numeric`/decimal or integer minor units, never JS floats
  as authority; soft-delete/soft-state (`ARCHIVED`, `CANCELLED`, `INACTIVE`) preferred
  over hard deletes for orders, payments, inventory movements, audit logs.

---

## 7. Status machines & identifiers

### 7.1 Order status (`order_status`)

Customer-facing labels are named directly in `PHASE_SEQUENCE.md` Phase 14 (order
tracking page); internal-only states are added around them:

`PENDING_CONFIRMATION` _(internal)_ → `CONFIRMED` → `PROCESSING` → `READY_TO_SHIP` →
`SHIPPED` → `DELIVERED`, with `CANCELLED` and `RETURNED` reachable from earlier states.

**ASSUMPTION:** the exact internal-only vs. customer-visible split, and whether
`RETURNED` is in MVP scope at all (no returns/refund policy has been defined — see
Section 10), needs confirmation before Phase 11.

### 7.2 Payment status (`payment_status`)

`PENDING` → `PAID` (only via server/gateway verification, never client-trusted) →
`REFUNDED` (or `PARTIALLY_REFUNDED` if partial refunds are needed later); `FAILED` as a
terminal non-success state. Independent from `order_status` at all times.

### 7.3 Quotation status (`quotation_status`)

Given explicitly in `PHASE_SEQUENCE.md` Phase 12:

`NEW` → `CONTACTED` → `PREPARING` → `SENT` → `ACCEPTED` | `REJECTED` | `EXPIRED` →
`CONVERTED_TO_ORDER` (from `ACCEPTED`).

### 7.4 Lead status (`lead_status`) — **ASSUMPTION, needs confirmation**

No pipeline was specified anywhere in the source files. Proposed placeholder, mirroring
the quotation pattern: `NEW` → `CONTACTED` → `QUALIFIED` → `CONVERTED` | `LOST`.

### 7.5 Inventory movement types

Given explicitly in `PHASE_SEQUENCE.md` Phase 6: `PURCHASE`, `SALE`, `RESERVATION`,
`RESERVATION_RELEASE`, `RETURN`, `DAMAGE`, `ADJUSTMENT`.

### 7.6 Human-readable identifiers

- Order number: `MPE-2026-000001` pattern — **prefix is an open naming question**, see
  Section 0.
- Quotation number: `QT-2026-000001`.
- Raw internal UUIDs are never exposed as customer-facing order/quotation numbers.

---

## 8. Critical acceptance / test scenarios

These are referenced by name across `PHASE_SEQUENCE.md` (Phases 4, 9, 13, 17) as
required checks, so they are restated here as explicit acceptance criteria:

1. **Unauthorized Admin** — an unauthenticated (or under-permissioned) request to any
   admin action must be rejected server-side, even if it targets an API/server-action
   route directly and not just a hidden UI element.
2. **Manipulated Price** — a checkout request with a tampered/forged price (via
   modified client state or a direct API call) must be ignored; the server recomputes
   price from the database every time.
3. **Fake Payment Success** — manually visiting a payment "success" URL/redirect must
   **not** mark an order as `PAID`; only a verified gateway/webhook event (or, for COD,
   an explicit staff/courier-confirmed action) can do that.
4. **Out of Stock** — a customer cannot complete checkout for a quantity exceeding
   available stock (`on_hand − reserved`), even under concurrent orders for the same
   variant.

---

## 9. MVP scope (v1)

Per CLAUDE.md Section 9 — build this, not more:

Responsive public site; homepage; categories; products with variants, specs, and
images; search; filters; cart; guest checkout; Cash on Delivery; order management;
inventory (on-hand/reserved, movement log); order tracking (number + phone); quotation
requests and admin quotation management; lead capture and management; admin dashboard;
product admin; customer records (from orders/quotations/leads, not accounts); contact /
WhatsApp / phone CTAs; SEO basics; analytics; core security controls; audit logging on
admin actions.

## 10. Explicitly out of MVP (Phase 2+ or later)

Online payment gateway integration, courier/shipping API integration, PDF
quote/invoice generation, customer accounts/login for buyers, coupons/discount codes,
product reviews, Bangla/English language toggle, SMS notifications, advanced
reporting/analytics beyond GA + Search Console, mobile app, microservices, multi-vendor
support, loyalty programs, AI-driven recommendations, chatbots, multi-warehouse
inventory, advanced accounting integration, returns/refund workflow (undefined — see
Section 7.1), and any real HVAC/CFM sizing calculator (the "Find the Right Fan" form
stays a lead form only).

If any in-progress task starts drifting into this list, it should be flagged and
rescoped rather than quietly built (CLAUDE.md Section 9).

---

## 11. Open business decisions requiring owner input

Per CLAUDE.md Section 6, none of the following should be invented — each needs an
explicit answer (a configurable placeholder is fine to unblock development, but must be
tracked here until confirmed):

- Order-number prefix (`MPE-` vs. something reflecting `exhaustfan.xyz` — Section 0).
- Delivery/shipping pricing model (flat, per-district, free-over-threshold, etc.).
- COD limits: max order value for COD, whether an advance payment is required above
  some threshold, and any district-level COD restrictions.
- Warranty length and terms per product/category.
- Return/refund policy and period (currently undefined — Section 7.1 flags this).
- Minimum order value, if any.
- Dealer/bulk/company discount structure, if any (none exists in MVP — all pricing is
  variant-level list price unless a quotation is negotiated).
- Lead status pipeline (Section 7.4 placeholder).
- Exact technical specification fields to capture per variant (CFM, HP, voltage, phase,
  RPM, noise level, blade material, etc.) — should be finalized against real supplier
  datasheets before Phase 2 (database schema) is locked.

---

## 12. Traceability

This document should stay in sync with `CLAUDE.md` (the standing rulebook) and feed
directly into `SYSTEM_ARCHITECTURE.md` (Phase 1) and `DATABASE_SCHEMA.md` (Phase 2). If
a future decision changes anything in Sections 7 or 11, update this file and the
downstream docs in the same task, per CLAUDE.md's "keep code and docs in sync" rule.

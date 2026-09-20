# DATABASE_SCHEMA.md — Industrial Exhaust Fan Ecommerce Platform (exhaustfan.xyz)

Logical table design only — no SQL migrations yet. Derived from `SYSTEM_ARCHITECTURE.md`
§4 (Data Access layer owns these tables) and `PROJECT_REQUIREMENTS.md` §3/§7. Field
names here are the logical contract Phase 3+ migrations should implement; exact SQL
types/migration syntax are a Phase 3 concern.

Two tables in this list — `coupons` and `reviews` — are **out of MVP scope**
(`PROJECT_REQUIREMENTS.md` §10). They're defined here so the schema is complete and
forward-compatible, but no MVP-phase code should read/write them yet.

---

## 0. Rules applied to every table below

From CLAUDE.md §2–§3, applied uniformly rather than repeated per table:

- **Money** is `numeric(12,2)` (or equivalent fixed-point decimal) everywhere — never a
  float, never JS-computed-and-trusted. Currency defaults to `BDT`.
- **Timestamps:** mutable tables get `created_at` + `updated_at` (`timestamptz`,
  default `now()`). Append-only tables (movements, events, history, notes, audit logs)
  get `created_at` only — no `updated_at`, no update/delete path at all.
- **Deletion:** no hard deletes for orders, payments, inventory movements, audit logs,
  or anything historical. These use status fields (`CANCELLED`, `ARCHIVED`, `INACTIVE`,
  `SUSPENDED`) instead. Hard deletes are acceptable only for genuinely disposable rows
  (e.g. an unconverted empty cart) — called out explicitly where that applies.
- **IDs:** `uuid` primary keys on all tables unless noted. Human-readable identifiers
  (`order_number`, `quotation_number`) are separate, unique, indexed text columns —
  never the primary key, never exposed instead of validated.
- **Snapshots:** anything historical (`order_items`, `order_addresses`) copies data at
  the time of the transaction and is never recomputed from current product/customer
  data later, even if the source row changes or is archived.
- **Audit trail:** admin-mutable tables that affect price, inventory, or permissions
  carry `created_by`/`updated_by` references to `admin_users`, in addition to being
  logged in `audit_logs` (Section 9).

---

## 1. Identity & access

### `profiles`

1:1 with Supabase `auth.users`. Generic profile data for any authenticated principal
(in MVP, that's admins only — customers are never `auth.users` rows, per
`PROJECT_REQUIREMENTS.md` §2.1/§9).

| Field                      | Type           | Notes                                                                               |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `id`                       | uuid, PK       | = `auth.users.id`                                                                   |
| `full_name`                | text           |                                                                                     |
| `email`                    | text           | mirror of `auth.users.email` for display; auth itself is never re-derived from this |
| `phone`                    | text, nullable |                                                                                     |
| `avatar_url`               | text, nullable |                                                                                     |
| `created_at`, `updated_at` | timestamptz    |                                                                                     |

### `admin_users`

Staff accounts. One row per admin, one role each (simplest model matching the named
`roles`/`permissions`/`role_permissions` set — no multi-role join table needed unless a
real case for it shows up later).

| Field                      | Type                                  | Notes                      |
| -------------------------- | ------------------------------------- | -------------------------- |
| `id`                       | uuid, PK                              | = `profiles.id`            |
| `role_id`                  | uuid, FK → `roles.id`, not null       |                            |
| `status`                   | enum: `ACTIVE`, `SUSPENDED`           | suspend instead of delete  |
| `created_by`               | uuid, FK → `admin_users.id`, nullable | who provisioned this admin |
| `created_at`, `updated_at` | timestamptz                           |                            |

**Constraints:** `role_id` required — no admin without a role. Index on `role_id`,
`status`.

### `roles`

| Field                      | Type           | Notes                                                               |
| -------------------------- | -------------- | ------------------------------------------------------------------- |
| `id`                       | uuid, PK       |                                                                     |
| `name`                     | text, unique   | `SUPER_ADMIN`, `ADMIN`, `SALES`, `ORDER_MANAGER`, `CONTENT_MANAGER` |
| `description`              | text, nullable |                                                                     |
| `created_at`, `updated_at` | timestamptz    |                                                                     |

### `permissions`

| Field         | Type           | Notes                                                                                                                   |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid, PK       |                                                                                                                         |
| `key`         | text, unique   | e.g. `products.edit`, `orders.update_status`, `inventory.adjust`, `quotations.price`, `settings.manage`, `roles.manage` |
| `description` | text, nullable |                                                                                                                         |
| `created_at`  | timestamptz    |                                                                                                                         |

### `role_permissions`

| Field           | Type                        | Notes |
| --------------- | --------------------------- | ----- |
| `role_id`       | uuid, FK → `roles.id`       |       |
| `permission_id` | uuid, FK → `permissions.id` |       |
| `created_at`    | timestamptz                 |       |

**Constraints:** composite PK (`role_id`, `permission_id`) — a role either has a
permission or doesn't, no duplicates.

### `customers`

Not `auth.users` — created implicitly from checkout, quotation, or lead submission
(`PROJECT_REQUIREMENTS.md` §5.7). No login.

| Field                      | Type           | Notes                                           |
| -------------------------- | -------------- | ----------------------------------------------- |
| `id`                       | uuid, PK       |                                                 |
| `full_name`                | text, not null |                                                 |
| `phone`                    | text, not null | indexed — primary lookup key for order tracking |
| `email`                    | text, nullable |                                                 |
| `company_name`             | text, nullable | B2B buyers                                      |
| `created_at`, `updated_at` | timestamptz    |                                                 |

**Constraints:** `phone` indexed but **not** unique — guest data is messy (shared
numbers, typos); dedup/merge is a business-logic concern, not a DB constraint.

### `customer_addresses`

| Field                                           | Type                                | Notes                                                       |
| ----------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `id`                                            | uuid, PK                            |                                                             |
| `customer_id`                                   | uuid, FK → `customers.id`, not null | indexed                                                     |
| `label`                                         | text, nullable                      | e.g. "Factory", "Office"                                    |
| `district`, `thana`, `area`, `detailed_address` | text                                | Bangladesh address model per `PROJECT_REQUIREMENTS.md` §4.5 |
| `is_default`                                    | boolean, default false              |                                                             |
| `created_at`, `updated_at`                      | timestamptz                         |                                                             |

---

## 2. Catalog

### `categories`

| Field                      | Type                                 | Notes                        |
| -------------------------- | ------------------------------------ | ---------------------------- |
| `id`                       | uuid, PK                             |                              |
| `name`                     | text, not null                       |                              |
| `slug`                     | text, unique, not null               | indexed                      |
| `description`              | text, nullable                       |                              |
| `parent_category_id`       | uuid, FK → `categories.id`, nullable | optional subcategory support |
| `display_order`            | integer, default 0                   |                              |
| `status`                   | enum: `ACTIVE`, `INACTIVE`           |                              |
| `created_at`, `updated_at` | timestamptz                          |                              |

### `products`

| Field                               | Type                                  | Notes                                   |
| ----------------------------------- | ------------------------------------- | --------------------------------------- |
| `id`                                | uuid, PK                              |                                         |
| `category_id`                       | uuid, FK → `categories.id`, not null  |                                         |
| `name`                              | text, not null                        |                                         |
| `slug`                              | text, unique, not null                | indexed — public URL `/products/<slug>` |
| `description`                       | text, nullable                        |                                         |
| `status`                            | enum: `DRAFT`, `ACTIVE`, `ARCHIVED`   | only `ACTIVE` shown publicly            |
| `seo_title`, `seo_meta_description` | text, nullable                        |                                         |
| `created_by`, `updated_by`          | uuid, FK → `admin_users.id`, nullable |                                         |
| `created_at`, `updated_at`          | timestamptz                           |                                         |

**Constraints:** `ON DELETE RESTRICT` from `products.category_id` — a category with
products can't be deleted, only deactivated.

### `product_variants`

The sellable unit — every price/stock/SKU lives here, never on `products` directly
(`PROJECT_REQUIREMENTS.md` §3).

| Field                                                                 | Type                               | Notes                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                  | uuid, PK                           |                                                                                                                                           |
| `product_id`                                                          | uuid, FK → `products.id`, not null | indexed                                                                                                                                   |
| `sku`                                                                 | text, unique, not null             | indexed                                                                                                                                   |
| `variant_name`                                                        | text, not null                     | e.g. `48 inch`                                                                                                                            |
| `size_value`                                                          | numeric, nullable                  | for numeric filtering/sorting by size                                                                                                     |
| `size_unit`                                                           | text, nullable                     | e.g. `inch`                                                                                                                               |
| `price`                                                               | numeric(12,2), not null            | server-authoritative                                                                                                                      |
| `compare_at_price`                                                    | numeric(12,2), nullable            | optional strike-through price                                                                                                             |
| `cfm`, `hp`, `voltage`, `phase`, `rpm`, `noise_level_db`, `weight_kg` | numeric/text, nullable             | **ASSUMPTION** — placeholder technical fields; finalize against real supplier datasheets before migration (`PROJECT_REQUIREMENTS.md` §11) |
| `status`                                                              | enum: `ACTIVE`, `ARCHIVED`         |                                                                                                                                           |
| `created_at`, `updated_at`                                            | timestamptz                        |                                                                                                                                           |

**Constraints:** `price >= 0`. These specific columns (`size`, `price`, `hp`,
`voltage`, `phase`) exist as real columns — not buried in a key/value table — because
`PROJECT_REQUIREMENTS.md` §4.3 requires filtering/sorting by them; a generic
attribute table can't be indexed/filtered as cleanly.

### `product_specifications`

Flexible key/value specs for everything that doesn't need to be filterable — materials,
certifications, warranty text, etc. Can apply to a whole product or to one variant.

| Field                      | Type                                       | Notes                                                |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `id`                       | uuid, PK                                   |                                                      |
| `product_id`               | uuid, FK → `products.id`, not null         | indexed                                              |
| `variant_id`               | uuid, FK → `product_variants.id`, nullable | null = applies to all variants of the product        |
| `spec_key`                 | text, not null                             | e.g. `Motor Type`, `Blade Material`, `Certification` |
| `spec_value`               | text, not null                             |                                                      |
| `display_order`            | integer, default 0                         |                                                      |
| `created_at`, `updated_at` | timestamptz                                |                                                      |

### `product_images`

| Field                      | Type                                       | Notes                                                                                             |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `id`                       | uuid, PK                                   |                                                                                                   |
| `product_id`               | uuid, FK → `products.id`, not null         | indexed                                                                                           |
| `variant_id`               | uuid, FK → `product_variants.id`, nullable | null = shared across variants                                                                     |
| `storage_path`             | text, not null                             | Supabase Storage path, server-generated — never derived from the uploaded filename (CLAUDE.md §7) |
| `alt_text`                 | text, not null                             | accessibility requirement, enforced not-null (`PROJECT_REQUIREMENTS.md` §6)                       |
| `display_order`            | integer, default 0                         |                                                                                                   |
| `is_primary`               | boolean, default false                     |                                                                                                   |
| `created_at`, `updated_at` | timestamptz                                |                                                                                                   |

---

## 3. Inventory

### `inventory`

One row per variant. `available` is **never stored** — always computed as
`on_hand − reserved` (CLAUDE.md §3).

| Field                 | Type                                                             | Notes            |
| --------------------- | ---------------------------------------------------------------- | ---------------- |
| `id`                  | uuid, PK                                                         |                  |
| `variant_id`          | uuid, FK → `product_variants.id`, unique, not null               | 1:1 with variant |
| `on_hand`             | integer, not null, default 0                                     | check `>= 0`     |
| `reserved`            | integer, not null, default 0                                     | check `>= 0`     |
| `low_stock_threshold` | integer, not null, default (configurable — Section 8 `settings`) |                  |
| `updated_at`          | timestamptz                                                      |                  |

### `inventory_movements`

Append-only. Every stock change is a row here; `inventory.on_hand`/`reserved` are
derived totals maintained by applying these movements, never hand-edited directly.

| Field            | Type                                                                                             | Notes                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `id`             | uuid, PK                                                                                         |                                                                                           |
| `variant_id`     | uuid, FK → `product_variants.id`, not null                                                       | indexed                                                                                   |
| `movement_type`  | enum: `PURCHASE`, `SALE`, `RESERVATION`, `RESERVATION_RELEASE`, `RETURN`, `DAMAGE`, `ADJUSTMENT` |                                                                                           |
| `quantity_delta` | integer, not null                                                                                | signed; sign/bucket (on_hand vs reserved) determined by `movement_type` in business logic |
| `reference_type` | text, nullable                                                                                   | e.g. `ORDER`, `MANUAL`                                                                    |
| `reference_id`   | uuid, nullable                                                                                   | e.g. the order that triggered a `RESERVATION`                                             |
| `notes`          | text, nullable                                                                                   |                                                                                           |
| `created_by`     | uuid, FK → `admin_users.id`, nullable                                                            | null = system-generated (e.g. checkout reservation)                                       |
| `created_at`     | timestamptz                                                                                      | append-only, no update/delete                                                             |

---

## 4. Cart

### `carts`

No accounts, so carts are identified by session, optionally linked to a customer once
known at checkout.

| Field                      | Type                                     | Notes                |
| -------------------------- | ---------------------------------------- | -------------------- |
| `id`                       | uuid, PK                                 |                      |
| `session_token`            | text, unique, not null                   | indexed              |
| `customer_id`              | uuid, FK → `customers.id`, nullable      | set at checkout time |
| `status`                   | enum: `ACTIVE`, `CONVERTED`, `ABANDONED` |                      |
| `created_at`, `updated_at` | timestamptz                              |                      |

**Deletion exception:** abandoned/converted carts are disposable — periodic hard
deletion of old `ABANDONED` carts is acceptable (not historical/financial data), unlike
every other "no hard delete" table in this document.

### `cart_items`

| Field                      | Type                                       | Notes                                                                                                                                                    |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid, PK                                   |                                                                                                                                                          |
| `cart_id`                  | uuid, FK → `carts.id`, not null            | indexed                                                                                                                                                  |
| `variant_id`               | uuid, FK → `product_variants.id`, not null |                                                                                                                                                          |
| `quantity`                 | integer, not null                          | check `> 0`                                                                                                                                              |
| `unit_price_snapshot`      | numeric(12,2)                              | **display convenience only** — checkout always recomputes from `product_variants.price`, never trusts this (CLAUDE.md §2, test case "Manipulated Price") |
| `created_at`, `updated_at` | timestamptz                                |                                                                                                                                                          |

**Constraints:** unique (`cart_id`, `variant_id`) — quantity updates merge into the
existing line, no duplicate rows for the same variant.

---

## 5. Orders & fulfillment

### `orders`

| Field                                                                   | Type                                                                                                                      | Notes                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `id`                                                                    | uuid, PK                                                                                                                  |                                                                                         |
| `order_number`                                                          | text, unique, not null                                                                                                    | indexed; format `MPE-2026-000001` (prefix open question — `PROJECT_REQUIREMENTS.md` §0) |
| `customer_id`                                                           | uuid, FK → `customers.id`, not null                                                                                       | indexed                                                                                 |
| `order_status`                                                          | enum: `PENDING_CONFIRMATION`, `CONFIRMED`, `PROCESSING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURNED` | independent of `payment_status`                                                         |
| `payment_status`                                                        | enum: `PENDING`, `PAID`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`                                                       | independent of `order_status`                                                           |
| `payment_method`                                                        | text                                                                                                                      | `COD` in MVP                                                                            |
| `subtotal_amount`, `shipping_amount`, `discount_amount`, `total_amount` | numeric(12,2)                                                                                                             | all server-computed at creation, never client-supplied                                  |
| `currency`                                                              | text, default `BDT`                                                                                                       |                                                                                         |
| `customer_notes`                                                        | text, nullable                                                                                                            |                                                                                         |
| `internal_notes`                                                        | text, nullable                                                                                                            | admin-only, never rendered on customer-facing tracking page                             |
| `created_at`, `updated_at`                                              | timestamptz                                                                                                               |                                                                                         |

**Constraints:** never hard-deleted; cancellation is `order_status = CANCELLED`, not a
row removal (CLAUDE.md §2/§6). Indexes on `order_status`, `payment_status`,
`customer_id` for admin filtering (`PROJECT_REQUIREMENTS.md` §5.4).

### `order_items`

Historical snapshot — frozen at the moment of purchase (CLAUDE.md §3).

| Field                   | Type                                                             | Notes                                                                       |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`                    | uuid, PK                                                         |                                                                             |
| `order_id`              | uuid, FK → `orders.id`, not null                                 | indexed                                                                     |
| `variant_id`            | uuid, FK → `product_variants.id`, nullable, `ON DELETE SET NULL` | traceability only — never the source of truth for this row's price/name     |
| `product_name_snapshot` | text, not null                                                   |                                                                             |
| `variant_name_snapshot` | text, not null                                                   |                                                                             |
| `sku_snapshot`          | text, not null                                                   |                                                                             |
| `unit_price_snapshot`   | numeric(12,2), not null                                          | authoritative historical price — never recomputed from current product data |
| `quantity`              | integer, not null                                                |                                                                             |
| `line_total`            | numeric(12,2), not null                                          |                                                                             |
| `created_at`            | timestamptz                                                      | append-only                                                                 |

### `order_addresses`

Snapshot, not a live reference to `customer_addresses` (the customer's saved address
could change or be deleted later; the order must keep what was true at order time).

| Field                                           | Type                                     | Notes |
| ----------------------------------------------- | ---------------------------------------- | ----- |
| `id`                                            | uuid, PK                                 |       |
| `order_id`                                      | uuid, FK → `orders.id`, unique, not null | 1:1   |
| `recipient_name`, `phone`                       | text, not null                           |       |
| `district`, `thana`, `area`, `detailed_address` | text, not null                           |       |
| `created_at`                                    | timestamptz                              |       |

### `order_status_history`

Append-only log covering changes to **either** state machine (CLAUDE.md §3 — they're
independent but both need a change history per `PHASE_SEQUENCE.md` Phase 11).

| Field                    | Type                                   | Notes                                              |
| ------------------------ | -------------------------------------- | -------------------------------------------------- |
| `id`                     | uuid, PK                               |                                                    |
| `order_id`               | uuid, FK → `orders.id`, not null       | indexed                                            |
| `status_type`            | enum: `ORDER_STATUS`, `PAYMENT_STATUS` | which state machine changed                        |
| `old_value`, `new_value` | text, not null                         |                                                    |
| `changed_by`             | uuid, FK → `admin_users.id`, nullable  | null = system (e.g. webhook-driven payment update) |
| `note`                   | text, nullable                         |                                                    |
| `created_at`             | timestamptz                            | append-only                                        |

---

## 6. Payments

### `payments`

| Field                      | Type                                                                | Notes                                                                                          |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                       | uuid, PK                                                            |                                                                                                |
| `order_id`                 | uuid, FK → `orders.id`, not null                                    | indexed                                                                                        |
| `method`                   | text                                                                | `COD` in MVP; gateway name once added                                                          |
| `amount`                   | numeric(12,2), not null                                             |                                                                                                |
| `status`                   | enum: `PENDING`, `PAID`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED` | mirrors/drives `orders.payment_status`                                                         |
| `gateway_reference`        | text, nullable, unique when present                                 | future gateway transaction ID                                                                  |
| `paid_at`                  | timestamptz, nullable                                               | set only on server-verified confirmation, never on redirect (test case "Fake Payment Success") |
| `created_at`, `updated_at` | timestamptz                                                         |                                                                                                |

### `payment_events`

Append-only. Every inbound payment confirmation (gateway webhook, or COD-collected
confirmation) lands here first.

| Field               | Type                               | Notes                                                                        |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `id`                | uuid, PK                           |                                                                              |
| `payment_id`        | uuid, FK → `payments.id`, not null | indexed                                                                      |
| `provider_event_id` | text, unique, not null             | idempotency key — a duplicate webhook must not double-process (CLAUDE.md §5) |
| `event_type`        | text                               | e.g. `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`, `REFUND_ISSUED`, `COD_COLLECTED` |
| `raw_payload`       | jsonb, nullable                    | verbatim provider payload for audit — never store secrets/API keys within it |
| `created_at`        | timestamptz                        | append-only                                                                  |

---

## 7. Shipping (manual, MVP)

### `shipments`

| Field                      | Type                                                                     | Notes                                                                     |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `id`                       | uuid, PK                                                                 |                                                                           |
| `order_id`                 | uuid, FK → `orders.id`, not null                                         | indexed                                                                   |
| `tracking_number`          | text, nullable                                                           | manually entered, no courier API in MVP                                   |
| `carrier`                  | text, nullable                                                           |                                                                           |
| `status`                   | enum: `CONFIRMED`, `PROCESSING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED` | drives the customer-facing tracking page (`PROJECT_REQUIREMENTS.md` §7.1) |
| `created_at`, `updated_at` | timestamptz                                                              |                                                                           |

### `shipment_events`

| Field         | Type                                  | Notes       |
| ------------- | ------------------------------------- | ----------- |
| `id`          | uuid, PK                              |             |
| `shipment_id` | uuid, FK → `shipments.id`, not null   | indexed     |
| `status`      | text, not null                        |             |
| `note`        | text, nullable                        |             |
| `created_by`  | uuid, FK → `admin_users.id`, nullable |             |
| `created_at`  | timestamptz                           | append-only |

---

## 8. Quotations & leads

### `quotations`

| Field                      | Type                                                                                                   | Notes                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `id`                       | uuid, PK                                                                                               |                                                                |
| `quotation_number`         | text, unique, not null                                                                                 | indexed; format `QT-2026-000001`                               |
| `customer_id`              | uuid, FK → `customers.id`, not null                                                                    | indexed                                                        |
| `status`                   | enum: `NEW`, `CONTACTED`, `PREPARING`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONVERTED_TO_ORDER` | per `PROJECT_REQUIREMENTS.md` §7.3                             |
| `company_name`             | text, nullable                                                                                         |                                                                |
| `district`                 | text, nullable                                                                                         |                                                                |
| `installation_context`     | text, nullable                                                                                         |                                                                |
| `message`                  | text, nullable                                                                                         |                                                                |
| `quoted_total_amount`      | numeric(12,2), nullable                                                                                | set once admin prices it                                       |
| `converted_order_id`       | uuid, FK → `orders.id`, nullable                                                                       | set on conversion, no manual re-entry of customer/product data |
| `assigned_to`              | uuid, FK → `admin_users.id`, nullable                                                                  | sales owner                                                    |
| `created_at`, `updated_at` | timestamptz                                                                                            |                                                                |

### `quotation_items`

| Field                      | Type                                       | Notes              |
| -------------------------- | ------------------------------------------ | ------------------ |
| `id`                       | uuid, PK                                   |                    |
| `quotation_id`             | uuid, FK → `quotations.id`, not null       | indexed            |
| `variant_id`               | uuid, FK → `product_variants.id`, not null |                    |
| `quantity_requested`       | integer, not null                          | check `> 0`        |
| `unit_price_quoted`        | numeric(12,2), nullable                    | filled once priced |
| `created_at`, `updated_at` | timestamptz                                |                    |

### `leads`

Covers both the "Find the Right Fan" consultation form and general contact-form leads
(`PROJECT_REQUIREMENTS.md` §4.9).

| Field                      | Type                                                       | Notes                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid, PK                                                   |                                                                                                                                             |
| `customer_id`              | uuid, FK → `customers.id`, nullable                        | may not resolve immediately                                                                                                                 |
| `source`                   | enum: `CONSULTATION_FORM`, `CONTACT_FORM`, `OTHER`         |                                                                                                                                             |
| `full_name`, `phone`       | text, not null                                             |                                                                                                                                             |
| `email`                    | text, nullable                                             |                                                                                                                                             |
| `space_details`            | text, nullable                                             | free-form use-case input from the consultation form; explicitly **not** run through any sizing calculation (`PROJECT_REQUIREMENTS.md` §4.9) |
| `status`                   | enum: `NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST` | **ASSUMPTION** — no pipeline was specified; confirm before building (`PROJECT_REQUIREMENTS.md` §7.4)                                        |
| `assigned_to`              | uuid, FK → `admin_users.id`, nullable                      |                                                                                                                                             |
| `created_at`, `updated_at` | timestamptz                                                |                                                                                                                                             |

### `lead_notes`

Append-only — sales notes are added, never edited/deleted, so the follow-up history
stays intact.

| Field        | Type                                  | Notes       |
| ------------ | ------------------------------------- | ----------- |
| `id`         | uuid, PK                              |             |
| `lead_id`    | uuid, FK → `leads.id`, not null       | indexed     |
| `note`       | text, not null                        |             |
| `created_by` | uuid, FK → `admin_users.id`, not null |             |
| `created_at` | timestamptz                           | append-only |

---

## 9. Marketing, content & system (includes two Phase-2+ tables)

### `coupons` — **Phase 2+, not MVP**

Defined now for schema completeness; no MVP code path reads or writes this table
(`PROJECT_REQUIREMENTS.md` §10).

| Field                      | Type                               | Notes |
| -------------------------- | ---------------------------------- | ----- |
| `id`                       | uuid, PK                           |       |
| `code`                     | text, unique, not null             |       |
| `discount_type`            | enum: `PERCENTAGE`, `FIXED_AMOUNT` |       |
| `discount_value`           | numeric(12,2), not null            |       |
| `min_order_amount`         | numeric(12,2), nullable            |       |
| `starts_at`, `expires_at`  | timestamptz, nullable              |       |
| `usage_limit`              | integer, nullable                  |       |
| `usage_count`              | integer, default 0                 |       |
| `status`                   | enum: `ACTIVE`, `INACTIVE`         |       |
| `created_at`, `updated_at` | timestamptz                        |       |

### `reviews` — **Phase 2+, not MVP**

Same status as `coupons` — schema only, no MVP usage (`PROJECT_REQUIREMENTS.md` §10).

| Field                      | Type                                    | Notes                                     |
| -------------------------- | --------------------------------------- | ----------------------------------------- |
| `id`                       | uuid, PK                                |                                           |
| `product_id`               | uuid, FK → `products.id`, not null      | indexed                                   |
| `customer_id`              | uuid, FK → `customers.id`, nullable     |                                           |
| `rating`                   | integer, not null                       | check between 1 and 5                     |
| `title`, `body`            | text, nullable                          |                                           |
| `status`                   | enum: `PENDING`, `APPROVED`, `REJECTED` | moderation required before public display |
| `created_at`, `updated_at` | timestamptz                             |                                           |

### `pages`

Static content, `CONTENT_MANAGER` scope (`PROJECT_REQUIREMENTS.md` §5.9).

| Field                               | Type                       | Notes   |
| ----------------------------------- | -------------------------- | ------- |
| `id`                                | uuid, PK                   |         |
| `slug`                              | text, unique, not null     | indexed |
| `title`                             | text, not null             |         |
| `body`                              | text, not null             |         |
| `seo_title`, `seo_meta_description` | text, nullable             |         |
| `status`                            | enum: `DRAFT`, `PUBLISHED` |         |
| `created_at`, `updated_at`          | timestamptz                |         |

### `faqs`

| Field                      | Type                       | Notes                                |
| -------------------------- | -------------------------- | ------------------------------------ |
| `id`                       | uuid, PK                   |                                      |
| `question`, `answer`       | text, not null             |                                      |
| `category`                 | text, nullable             | grouping on the homepage FAQ section |
| `display_order`            | integer, default 0         |                                      |
| `status`                   | enum: `ACTIVE`, `INACTIVE` |                                      |
| `created_at`, `updated_at` | timestamptz                |                                      |

### `settings`

Key/value store for admin-configurable business rules that CLAUDE.md §6 says must not
be hardcoded (COD max amount, COD enabled/district restrictions, default low-stock
threshold, shipping pricing config, etc. — see `PROJECT_REQUIREMENTS.md` §11 for the
full list of values still needing a business decision).

| Field         | Type                                  | Notes |
| ------------- | ------------------------------------- | ----- |
| `key`         | text, PK                              |       |
| `value`       | jsonb, not null                       |       |
| `description` | text, nullable                        |       |
| `updated_by`  | uuid, FK → `admin_users.id`, nullable |       |
| `updated_at`  | timestamptz                           |       |

### `audit_logs`

Append-only, immutable, never deleted. Covers price changes, inventory adjustments,
order cancellations, refunds, and permission changes at minimum (CLAUDE.md §7).

| Field                         | Type                                  | Notes                                                                                                |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                          | uuid, PK                              |                                                                                                      |
| `actor_id`                    | uuid, FK → `admin_users.id`, nullable | null = system-initiated                                                                              |
| `action`                      | text, not null                        | e.g. `PRICE_CHANGED`, `INVENTORY_ADJUSTED`, `ORDER_CANCELLED`, `REFUND_ISSUED`, `PERMISSION_CHANGED` |
| `entity_type`                 | text, not null                        | e.g. `product_variant`, `order`, `role_permissions`                                                  |
| `entity_id`                   | text, not null                        |                                                                                                      |
| `before_value`, `after_value` | jsonb, nullable                       |                                                                                                      |
| `created_at`                  | timestamptz                           | append-only                                                                                          |

**Never logged here or anywhere else:** passwords, tokens, payment secrets, API keys
(CLAUDE.md §7) — `raw_payload` in `payment_events` and `before_value`/`after_value`
here must be scrubbed of these before write, not after.

---

## 10. Index summary

In addition to every PK and FK noted above, these indexes matter for the query
patterns `PROJECT_REQUIREMENTS.md` requires:

- `products.slug`, `categories.slug`, `pages.slug` — unique, public URL lookups.
- `product_variants.sku` — unique, used in admin search (§5.4) and order snapshots.
- `product_variants(product_id, status)` — catalogue/variant-selector queries.
- `orders.order_number` — unique, customer tracking lookup + admin search.
- `orders(customer_id)`, `orders(order_status)`, `orders(payment_status)` — admin
  filtering (§5.4).
- `customers.phone` — order-tracking lookup (paired with `order_number`).
- `quotations.quotation_number` — unique.
- `inventory.variant_id` — unique, 1:1.
- `inventory_movements(variant_id, created_at)` — movement history per variant.
- `payment_events.provider_event_id` — unique, webhook idempotency.
- `audit_logs(entity_type, entity_id)` — "show me the history of this record."

---

## 11. Traceability

This schema implements the entity list in CLAUDE.md §3's logical model and the status
machines fixed in `PROJECT_REQUIREMENTS.md` §7, using the layering boundaries from
`SYSTEM_ARCHITECTURE.md` §2.4 (only the Data Access layer touches these tables
directly). Open items that affect this schema before it becomes real migrations:

- Order-number prefix (`PROJECT_REQUIREMENTS.md` §0/§11).
- Exact `product_variants` technical spec columns, pending supplier datasheets
  (§11).
- `leads.status` pipeline — placeholder, needs confirmation (§7.4/§11).
- Whether `RETURNED` order status / a refund workflow is actually in scope (§7.1) —
  affects whether `payments.status = REFUNDED`/`PARTIALLY_REFUNDED` ever gets used pre-
  Phase 2 business features.

Phase 3 (project foundation) should not silently resolve these by picking values —
confirm them, then write the migrations.

-- Reference-data seed for roles/permissions/role_permissions (PROJECT_REQUIREMENTS.md
-- §2.2). This is catalog/config data, not customer or test data, so it ships as a
-- migration (applies in every environment) rather than supabase/seed.sql (local-only).
--
-- ASSUMPTION (CLAUDE.md §6 — flag, don't guess): the permission keys and the
-- role→permission mapping below are a starting placeholder derived from the
-- responsibility summaries in PROJECT_REQUIREMENTS.md §2.2/§5. "Exact
-- permission-to-role mapping is a configuration decision" per that doc — confirm
-- with the project owner before Phase 5+ admin features start depending on it,
-- and adjust here (or via a future admin Settings > Roles UI, §5.8) rather than
-- hardcoding role-name checks elsewhere.

insert into public.roles (name, description) values
  ('SUPER_ADMIN', 'Full system access, including role/permission management'),
  ('ADMIN', 'Full operational access (products, orders, inventory, quotations, leads)'),
  ('SALES', 'Quotations, leads, customer contact'),
  ('ORDER_MANAGER', 'Order lifecycle, payment status, shipment tracking'),
  ('CONTENT_MANAGER', 'Product content, images, SEO fields, pages/FAQs')
on conflict (name) do nothing;

insert into public.permissions (key, description) values
  ('products.manage', 'Create/edit/archive categories, products, variants, specs, images, pricing'),
  ('content.manage', 'Manage static pages/FAQs and product SEO content'),
  ('inventory.view', 'View on-hand/reserved/available stock and movement history'),
  ('inventory.adjust', 'Record inventory movements/adjustments'),
  ('orders.view', 'List/search orders and view order detail'),
  ('orders.update_status', 'Update order_status / payment_status'),
  ('quotations.manage', 'Manage quotations through their status pipeline'),
  ('quotations.price', 'Set/adjust quotation pricing'),
  ('leads.manage', 'View/manage leads and their status'),
  ('customers.view', 'View customer records derived from orders/quotations/leads'),
  ('roles.manage', 'Manage roles, permissions, and admin user provisioning'),
  ('settings.manage', 'Manage site-wide settings (delivery, COD limits, etc.)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on true
where
  (r.name = 'SUPER_ADMIN')
  or (r.name = 'ADMIN' and p.key in (
    'products.manage', 'content.manage', 'inventory.view', 'inventory.adjust',
    'orders.view', 'orders.update_status', 'quotations.manage', 'quotations.price',
    'leads.manage', 'customers.view'
  ))
  or (r.name = 'SALES' and p.key in (
    'orders.view', 'quotations.manage', 'quotations.price', 'leads.manage', 'customers.view'
  ))
  or (r.name = 'ORDER_MANAGER' and p.key in (
    'orders.view', 'orders.update_status'
  ))
  or (r.name = 'CONTENT_MANAGER' and p.key in (
    'content.manage'
  ))
on conflict (role_id, permission_id) do nothing;

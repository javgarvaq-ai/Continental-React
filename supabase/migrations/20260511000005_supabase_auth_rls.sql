-- ============================================================
-- Supabase Auth Migration
--
-- Moves authentication from custom PIN/bcrypt to Supabase Auth.
-- Every staff member gets a Supabase Auth account.
-- Email format: {user_id}@continental.bar (internal, staff never see it)
--
-- Key changes:
--   1. Add email column to users (needed to sign in via Supabase Auth)
--   2. Make pin_hash nullable (Supabase Auth owns passwords now)
--   3. Drop failed_pin_attempts + locked_until (Supabase Auth has built-in rate limiting)
--   4. Drop verify_pin, create_user, reset_user_pin, update_user_active RPCs
--   5. Rewrite ALL RLS policies:
--        - users SELECT: stays open to anon (login screen needs employee list pre-auth)
--        - everything else: requires authenticated session
-- ============================================================


-- ─────────────────────────────────────────────
-- 1. Schema changes on users table
-- ─────────────────────────────────────────────

-- Add email column (populated below for existing rows)
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS email text;

-- Make pin_hash nullable — Supabase Auth owns passwords now
ALTER TABLE public.users
    ALTER COLUMN pin_hash DROP NOT NULL;

-- Drop rate-limit columns added in 20260511000003
-- Supabase Auth has built-in rate limiting; these are now orphaned
ALTER TABLE public.users
    DROP COLUMN IF EXISTS failed_pin_attempts,
    DROP COLUMN IF EXISTS locked_until;

-- Populate email for all existing users: {id}@continental.bar
UPDATE public.users
SET    email = id::text || '@continental.bar'
WHERE  email IS NULL;

-- Now enforce NOT NULL on email
ALTER TABLE public.users
    ALTER COLUMN email SET NOT NULL;

-- Unique constraint on email (Supabase Auth requires unique emails)
ALTER TABLE public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


-- ─────────────────────────────────────────────
-- 2. Drop RPCs replaced by Supabase Auth + Edge Functions
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.verify_pin(uuid, text);
DROP FUNCTION IF EXISTS public.create_user(text, text, text);
DROP FUNCTION IF EXISTS public.reset_user_pin(uuid, text);
DROP FUNCTION IF EXISTS public.update_user_active(uuid, boolean);


-- ─────────────────────────────────────────────
-- 3. RLS policy rewrite
--
-- Strategy:
--   - users SELECT: anon allowed (employee list shown on login screen before any session)
--   - ALL other tables/operations: require authenticated role
--
-- Pattern for each table:
--   DROP old policy → CREATE new policy TO authenticated
-- ─────────────────────────────────────────────

-- ── users ────────────────────────────────────
-- Keep SELECT open to anon (login screen reads employee names/IDs before auth)
-- INSERT and UPDATE are already dropped (from 20260510000001_user_management_rpcs.sql)
-- No changes needed on users — existing users_select policy is correct for anon read

-- ── cash_movements ───────────────────────────
DROP POLICY IF EXISTS "cash_movements_insert" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_movements_select" ON public.cash_movements;

CREATE POLICY "cash_movements_insert" ON public.cash_movements
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "cash_movements_select" ON public.cash_movements
    FOR SELECT TO authenticated USING (true);

-- ── categories ───────────────────────────────
DROP POLICY IF EXISTS "categories_delete" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;

CREATE POLICY "categories_delete" ON public.categories
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "categories_insert" ON public.categories
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "categories_select" ON public.categories
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "categories_update" ON public.categories
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── comanda_events ────────────────────────────
DROP POLICY IF EXISTS "comanda_events_insert" ON public.comanda_events;
DROP POLICY IF EXISTS "comanda_events_select" ON public.comanda_events;

CREATE POLICY "comanda_events_insert" ON public.comanda_events
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "comanda_events_select" ON public.comanda_events
    FOR SELECT TO authenticated USING (true);

-- ── comanda_items ─────────────────────────────
DROP POLICY IF EXISTS "comanda_items_delete" ON public.comanda_items;
DROP POLICY IF EXISTS "comanda_items_insert" ON public.comanda_items;
DROP POLICY IF EXISTS "comanda_items_select" ON public.comanda_items;
DROP POLICY IF EXISTS "comanda_items_update" ON public.comanda_items;

CREATE POLICY "comanda_items_delete" ON public.comanda_items
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "comanda_items_insert" ON public.comanda_items
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "comanda_items_select" ON public.comanda_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "comanda_items_update" ON public.comanda_items
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── comandas ──────────────────────────────────
DROP POLICY IF EXISTS "comandas_insert" ON public.comandas;
DROP POLICY IF EXISTS "comandas_select" ON public.comandas;
DROP POLICY IF EXISTS "comandas_update" ON public.comandas;

CREATE POLICY "comandas_insert" ON public.comandas
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "comandas_select" ON public.comandas
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "comandas_update" ON public.comandas
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── customer_memberships ──────────────────────
DROP POLICY IF EXISTS "memberships_insert" ON public.customer_memberships;
DROP POLICY IF EXISTS "memberships_select" ON public.customer_memberships;
DROP POLICY IF EXISTS "memberships_update" ON public.customer_memberships;

CREATE POLICY "memberships_insert" ON public.customer_memberships
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "memberships_select" ON public.customer_memberships
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "memberships_update" ON public.customer_memberships
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── customers ─────────────────────────────────
DROP POLICY IF EXISTS "customers_insert" ON public.customers;
DROP POLICY IF EXISTS "customers_select" ON public.customers;
DROP POLICY IF EXISTS "customers_update" ON public.customers;

CREATE POLICY "customers_insert" ON public.customers
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "customers_select" ON public.customers
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "customers_update" ON public.customers
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── employees ─────────────────────────────────
DROP POLICY IF EXISTS "allow_all_employees" ON public.employees;

CREATE POLICY "allow_all_employees" ON public.employees
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── employee_schedule_shifts ──────────────────
DROP POLICY IF EXISTS "allow_all_schedule_shifts" ON public.employee_schedule_shifts;

CREATE POLICY "allow_all_schedule_shifts" ON public.employee_schedule_shifts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── employee_time_logs ────────────────────────
DROP POLICY IF EXISTS "allow_all_employee_time_logs" ON public.employee_time_logs;

CREATE POLICY "allow_all_employee_time_logs" ON public.employee_time_logs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── inventory_items ───────────────────────────
DROP POLICY IF EXISTS "inventory_items_insert" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_select" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_update" ON public.inventory_items;

CREATE POLICY "inventory_items_insert" ON public.inventory_items
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "inventory_items_select" ON public.inventory_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "inventory_items_update" ON public.inventory_items
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── inventory_movements ───────────────────────
DROP POLICY IF EXISTS "inventory_movements_insert" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_select" ON public.inventory_movements;

CREATE POLICY "inventory_movements_insert" ON public.inventory_movements
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "inventory_movements_select" ON public.inventory_movements
    FOR SELECT TO authenticated USING (true);

-- ── membership_benefit_products ───────────────
DROP POLICY IF EXISTS "benefit_products_delete" ON public.membership_benefit_products;
DROP POLICY IF EXISTS "benefit_products_insert" ON public.membership_benefit_products;
DROP POLICY IF EXISTS "benefit_products_select" ON public.membership_benefit_products;

CREATE POLICY "benefit_products_delete" ON public.membership_benefit_products
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "benefit_products_insert" ON public.membership_benefit_products
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "benefit_products_select" ON public.membership_benefit_products
    FOR SELECT TO authenticated USING (true);

-- ── membership_benefit_usage ──────────────────
DROP POLICY IF EXISTS "benefit_usage_insert" ON public.membership_benefit_usage;
DROP POLICY IF EXISTS "benefit_usage_select" ON public.membership_benefit_usage;

CREATE POLICY "benefit_usage_insert" ON public.membership_benefit_usage
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "benefit_usage_select" ON public.membership_benefit_usage
    FOR SELECT TO authenticated USING (true);

-- ── membership_plan_benefits ──────────────────
DROP POLICY IF EXISTS "plan_benefits_delete" ON public.membership_plan_benefits;
DROP POLICY IF EXISTS "plan_benefits_insert" ON public.membership_plan_benefits;
DROP POLICY IF EXISTS "plan_benefits_select" ON public.membership_plan_benefits;
DROP POLICY IF EXISTS "plan_benefits_update" ON public.membership_plan_benefits;

CREATE POLICY "plan_benefits_delete" ON public.membership_plan_benefits
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "plan_benefits_insert" ON public.membership_plan_benefits
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "plan_benefits_select" ON public.membership_plan_benefits
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "plan_benefits_update" ON public.membership_plan_benefits
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── membership_plans ──────────────────────────
DROP POLICY IF EXISTS "plans_insert" ON public.membership_plans;
DROP POLICY IF EXISTS "plans_select" ON public.membership_plans;
DROP POLICY IF EXISTS "plans_update" ON public.membership_plans;

CREATE POLICY "plans_insert" ON public.membership_plans
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "plans_select" ON public.membership_plans
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "plans_update" ON public.membership_plans
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── product_allowed_mixers ────────────────────
DROP POLICY IF EXISTS "mixers_delete" ON public.product_allowed_mixers;
DROP POLICY IF EXISTS "mixers_insert" ON public.product_allowed_mixers;
DROP POLICY IF EXISTS "mixers_select" ON public.product_allowed_mixers;
DROP POLICY IF EXISTS "mixers_update" ON public.product_allowed_mixers;

CREATE POLICY "mixers_delete" ON public.product_allowed_mixers
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "mixers_insert" ON public.product_allowed_mixers
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "mixers_select" ON public.product_allowed_mixers
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "mixers_update" ON public.product_allowed_mixers
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── product_recipes ───────────────────────────
DROP POLICY IF EXISTS "recipes_delete" ON public.product_recipes;
DROP POLICY IF EXISTS "recipes_insert" ON public.product_recipes;
DROP POLICY IF EXISTS "recipes_select" ON public.product_recipes;
DROP POLICY IF EXISTS "recipes_update" ON public.product_recipes;

CREATE POLICY "recipes_delete" ON public.product_recipes
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "recipes_insert" ON public.product_recipes
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "recipes_select" ON public.product_recipes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "recipes_update" ON public.product_recipes
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── products ──────────────────────────────────
DROP POLICY IF EXISTS "products_delete" ON public.products;
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;

CREATE POLICY "products_delete" ON public.products
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "products_insert" ON public.products
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "products_select" ON public.products
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "products_update" ON public.products
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── shifts ────────────────────────────────────
DROP POLICY IF EXISTS "shifts_insert" ON public.shifts;
DROP POLICY IF EXISTS "shifts_select" ON public.shifts;
DROP POLICY IF EXISTS "shifts_update" ON public.shifts;

CREATE POLICY "shifts_insert" ON public.shifts
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "shifts_select" ON public.shifts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "shifts_update" ON public.shifts
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── units ─────────────────────────────────────
DROP POLICY IF EXISTS "units_delete" ON public.units;
DROP POLICY IF EXISTS "units_insert" ON public.units;
DROP POLICY IF EXISTS "units_select" ON public.units;
DROP POLICY IF EXISTS "units_update" ON public.units;

CREATE POLICY "units_delete" ON public.units
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "units_insert" ON public.units
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "units_select" ON public.units
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "units_update" ON public.units
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────
-- 4. Grant EXECUTE on RPCs that the app still uses (via anon/authenticated)
--    activate_membership and process_membership_on_payment are called
--    from authenticated sessions now, so update their grants.
-- ─────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.activate_membership(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_membership_on_payment(uuid, uuid, uuid, numeric, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.present_bill_atomic(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, numeric, text, uuid, text) TO authenticated;

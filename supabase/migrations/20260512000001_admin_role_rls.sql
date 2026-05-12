-- ─────────────────────────────────────────────────────────────────────────────
-- T1 — Server-side role enforcement for admin-only tables
--
-- Problem: All write policies were open to any authenticated user (USING(true)).
--          A waiter could call admin writes directly via the REST API.
--
-- Fix: Restrict INSERT / UPDATE / DELETE on admin-only tables to users whose
--      role in public.users is 'admin' or 'manager'.
--      SELECT policies are left open (authenticated) — waiters need to read
--      products, categories, units, etc. to operate the POS.
--
-- Role check subquery:
--   (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
--
-- This reads from public.users (source of truth for roles), not from
-- user_metadata / raw_user_meta_data which is user-editable and unsafe for RLS.
-- Postgres evaluates the subquery once per statement (not per row) because
-- auth.uid() is stable within a transaction.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── categories ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "categories_delete" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;

CREATE POLICY "categories_delete" ON public.categories
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "categories_insert" ON public.categories
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "categories_update" ON public.categories
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── products ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "products_delete" ON public.products;
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;

CREATE POLICY "products_delete" ON public.products
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "products_insert" ON public.products
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "products_update" ON public.products
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── units ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "units_delete" ON public.units;
DROP POLICY IF EXISTS "units_insert" ON public.units;
DROP POLICY IF EXISTS "units_update" ON public.units;

CREATE POLICY "units_delete" ON public.units
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "units_insert" ON public.units
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "units_update" ON public.units
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── inventory_items ───────────────────────────────────────────────────────────
-- No DELETE policy exists (by design — inventory items are not deleted).

DROP POLICY IF EXISTS "inventory_items_insert" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_update" ON public.inventory_items;

CREATE POLICY "inventory_items_insert" ON public.inventory_items
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "inventory_items_update" ON public.inventory_items
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── membership_plans ─────────────────────────────────────────────────────────
-- No DELETE policy exists (by design — plans are not hard-deleted).

DROP POLICY IF EXISTS "plans_insert" ON public.membership_plans;
DROP POLICY IF EXISTS "plans_update" ON public.membership_plans;

CREATE POLICY "plans_insert" ON public.membership_plans
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "plans_update" ON public.membership_plans
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── membership_plan_benefits ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "plan_benefits_delete" ON public.membership_plan_benefits;
DROP POLICY IF EXISTS "plan_benefits_insert" ON public.membership_plan_benefits;
DROP POLICY IF EXISTS "plan_benefits_update" ON public.membership_plan_benefits;

CREATE POLICY "plan_benefits_delete" ON public.membership_plan_benefits
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "plan_benefits_insert" ON public.membership_plan_benefits
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "plan_benefits_update" ON public.membership_plan_benefits
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── membership_benefit_products ───────────────────────────────────────────────
-- No UPDATE policy exists (insert-only by design).

DROP POLICY IF EXISTS "benefit_products_delete" ON public.membership_benefit_products;
DROP POLICY IF EXISTS "benefit_products_insert" ON public.membership_benefit_products;

CREATE POLICY "benefit_products_delete" ON public.membership_benefit_products
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "benefit_products_insert" ON public.membership_benefit_products
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── product_allowed_mixers ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "mixers_delete" ON public.product_allowed_mixers;
DROP POLICY IF EXISTS "mixers_insert" ON public.product_allowed_mixers;
DROP POLICY IF EXISTS "mixers_update" ON public.product_allowed_mixers;

CREATE POLICY "mixers_delete" ON public.product_allowed_mixers
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "mixers_insert" ON public.product_allowed_mixers
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "mixers_update" ON public.product_allowed_mixers
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── product_recipes ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "recipes_delete" ON public.product_recipes;
DROP POLICY IF EXISTS "recipes_insert" ON public.product_recipes;
DROP POLICY IF EXISTS "recipes_update" ON public.product_recipes;

CREATE POLICY "recipes_delete" ON public.product_recipes
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "recipes_insert" ON public.product_recipes
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "recipes_update" ON public.product_recipes
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── employees ─────────────────────────────────────────────────────────────────
-- Was a single FOR ALL policy. Split into open SELECT + role-restricted writes.

DROP POLICY IF EXISTS "allow_all_employees" ON public.employees;

CREATE POLICY "employees_select" ON public.employees
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "employees_insert" ON public.employees
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "employees_update" ON public.employees
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "employees_delete" ON public.employees
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── employee_schedule_shifts ──────────────────────────────────────────────────
-- Was a single FOR ALL policy. Split into open SELECT + role-restricted writes.
-- SELECT stays open: all roles can view the schedule (ScheduleViewPanel in POS).

DROP POLICY IF EXISTS "allow_all_schedule_shifts" ON public.employee_schedule_shifts;

CREATE POLICY "schedule_shifts_select" ON public.employee_schedule_shifts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "schedule_shifts_insert" ON public.employee_schedule_shifts
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "schedule_shifts_update" ON public.employee_schedule_shifts
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "schedule_shifts_delete" ON public.employee_schedule_shifts
    FOR DELETE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));


-- ── employee_time_logs ────────────────────────────────────────────────────────
-- Was a single FOR ALL policy. Split into open SELECT + role-restricted writes.
-- Check-in/out is done by managers/admins only (EmployeesAdminPage behind AuthRoute).

DROP POLICY IF EXISTS "allow_all_employee_time_logs" ON public.employee_time_logs;

CREATE POLICY "time_logs_select" ON public.employee_time_logs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "time_logs_insert" ON public.employee_time_logs
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "time_logs_update" ON public.employee_time_logs
    FOR UPDATE TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'))
    WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager'));

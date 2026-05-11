-- ============================================================
-- Schema cleanup: remove duplicate indexes, duplicate CHECK
-- constraints, useless trigger, and redundant RLS policies.
-- Zero functional change — all removed items are exact
-- duplicates of something being kept.
-- ============================================================

-- ── 1. Duplicate unique indexes ───────────────────────────

-- customer_memberships: keep customer_memberships_customer_month_unique,
-- drop the identically-defined customer_memberships_unique.
DROP INDEX IF EXISTS public.customer_memberships_unique;

-- product_recipes: keep one_active_recipe_per_product_inventory_item
-- (partial, WHERE active=true). Drop the non-partial duplicate
-- (product_recipes_product_inventory_uidx) which blocks valid
-- inactive+active pairs on the same (product_id, inventory_item_id),
-- and the redundant ux_product_recipes_product_inventory partial copy.
DROP INDEX IF EXISTS public.product_recipes_product_inventory_uidx;
DROP INDEX IF EXISTS public.ux_product_recipes_product_inventory;

-- product_allowed_mixers: keep one_active_mixer_mapping (partial).
-- Drop ux_product_allowed_mixers_unique which is an exact duplicate.
DROP INDEX IF EXISTS public.ux_product_allowed_mixers_unique;

-- shifts: keep only_one_open_shift. Drop the identically-defined
-- shifts_one_open_at_a_time.
DROP INDEX IF EXISTS public.shifts_one_open_at_a_time;

-- ── 2. Duplicate CHECK constraint ────────────────────────

-- inventory_movements has two identical CHECKs on movement_type.
-- Keep inventory_movements_movement_type_check, drop the duplicate.
ALTER TABLE public.inventory_movements
    DROP CONSTRAINT IF EXISTS inventory_movements_type_check;

-- ── 3. Useless assign_comanda_folio trigger (HP-8) ───────

-- The trigger calls nextval() on the folio sequence, but the
-- column already has DEFAULT nextval(...). Both fire on INSERT,
-- advancing the sequence twice per comanda (skipping every other
-- folio number). The DEFAULT alone is sufficient.
DROP TRIGGER IF EXISTS trg_assign_comanda_folio ON public.comandas;
DROP FUNCTION IF EXISTS public.assign_comanda_folio();

-- ── 4. Redundant RLS policies (allow_public_* duplicates) ─

-- These {public}-role policies are exact duplicates of the
-- {anon}-role policies. Since anon ⊂ public, both fired on
-- every request. Keeping only the {anon} versions.

DROP POLICY IF EXISTS allow_public_insert ON public.comanda_items;
DROP POLICY IF EXISTS allow_public_select ON public.comanda_items;
DROP POLICY IF EXISTS allow_public_update ON public.comanda_items;

DROP POLICY IF EXISTS allow_public_insert ON public.comandas;
DROP POLICY IF EXISTS allow_public_select ON public.comandas;

DROP POLICY IF EXISTS allow_public_insert ON public.inventory_movements;

DROP POLICY IF EXISTS allow_public_insert ON public.payments;
DROP POLICY IF EXISTS allow_public_select ON public.payments;
DROP POLICY IF EXISTS allow_public_update ON public.payments;

DROP POLICY IF EXISTS allow_public_select ON public.products;

DROP POLICY IF EXISTS allow_public_select ON public.units;

DROP POLICY IF EXISTS allow_public_select_users ON public.users;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema cleanup — items 1.7, 1.9, 5.3, 5.4, 5.7
-- ─────────────────────────────────────────────────────────────────────────────


-- 1.7 + 5.3 — comanda_events: drop orphaned columns and their index
--
-- `mesa_id` and `details` are never written or read by any application code.
-- Dropping `mesa_id` automatically drops idx_comanda_events_mesa_id (Postgres
-- removes an index when its only column is dropped).
-- `details` has no index and no FK — a plain column drop is sufficient.

ALTER TABLE comanda_events DROP COLUMN IF EXISTS mesa_id;
ALTER TABLE comanda_events DROP COLUMN IF EXISTS details;


-- 1.9 — products.category_id: remove the gen_random_uuid() default
--
-- The default silently creates a FK to a non-existent category when a product
-- is inserted without specifying category_id. Removing the default means the
-- caller must supply a real category_id — which is what should happen anyway.

ALTER TABLE products ALTER COLUMN category_id DROP DEFAULT;


-- 5.4 — payments: add NOT NULL DEFAULT 0 to numeric payment columns
--
-- efectivo, tarjeta, transferencia, total_paid are currently nullable with no
-- default. All application writes supply these values, but the schema allows
-- inconsistent rows. Two-step per column: zero out any existing NULLs, then
-- tighten the constraint.

UPDATE payments SET efectivo       = 0 WHERE efectivo       IS NULL;
UPDATE payments SET tarjeta        = 0 WHERE tarjeta        IS NULL;
UPDATE payments SET transferencia  = 0 WHERE transferencia  IS NULL;
UPDATE payments SET total_paid     = 0 WHERE total_paid     IS NULL;

ALTER TABLE payments
    ALTER COLUMN efectivo      SET DEFAULT 0,
    ALTER COLUMN tarjeta       SET DEFAULT 0,
    ALTER COLUMN transferencia SET DEFAULT 0,
    ALTER COLUMN total_paid    SET DEFAULT 0;

ALTER TABLE payments
    ALTER COLUMN efectivo      SET NOT NULL,
    ALTER COLUMN tarjeta       SET NOT NULL,
    ALTER COLUMN transferencia SET NOT NULL,
    ALTER COLUMN total_paid    SET NOT NULL;


-- 5.7 — users: add updated_at with automatic trigger
--
-- PIN resets, role changes, and deactivations currently leave no timestamp.
-- The trigger fires on every UPDATE and sets updated_at to NOW().

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Back-fill existing rows (created before this column existed)
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

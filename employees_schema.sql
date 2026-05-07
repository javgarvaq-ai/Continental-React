-- ============================================================
-- Employees module
-- ============================================================

-- Employee roster (POS users + non-POS staff)
CREATE TABLE IF NOT EXISTS employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    position        TEXT,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Check-in / check-out log
CREATE TABLE IF NOT EXISTS employee_time_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_out_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one open check-in per employee at a time
CREATE UNIQUE INDEX IF NOT EXISTS employee_one_open_checkin
    ON employee_time_logs (employee_id)
    WHERE checked_out_at IS NULL;

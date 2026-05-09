-- CRIT-4: Prevent two open comandas for the same unit (race condition).
-- If two tablets open the same unit simultaneously, the second INSERT will
-- hit this constraint and fail; the caller then re-reads the existing comanda.

CREATE UNIQUE INDEX IF NOT EXISTS one_open_comanda_per_unit
  ON comandas (unit_id)
  WHERE status IN ('open', 'pending_payment', 'processing_payment');

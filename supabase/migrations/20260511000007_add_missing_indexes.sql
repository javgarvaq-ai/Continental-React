-- 5.1  comanda_items: frequent join on (comanda_id, status) in getActiveCartItems
--      and validateComandaInventoryBeforePayment. Partial index covers the hot path.
CREATE INDEX IF NOT EXISTS comanda_items_comanda_status_idx
    ON comanda_items (comanda_id)
    WHERE status = 'active';

-- 5.8  comandas: getWeeklyReportData filters on cobrado_at WHERE status='paid'.
--      Without this index Postgres does a full sequential scan every report load.
CREATE INDEX IF NOT EXISTS comandas_cobrado_at_idx
    ON comandas (cobrado_at)
    WHERE status = 'paid';

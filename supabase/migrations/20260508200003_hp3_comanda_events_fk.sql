-- HP-3: Add FK from comanda_events.comanda_id to comandas.id.
-- Previously missing, meaning orphan event rows could exist without error.
-- ON DELETE CASCADE keeps the audit trail self-consistent.

ALTER TABLE comanda_events
  ADD CONSTRAINT comanda_events_comanda_id_fkey
  FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE CASCADE;

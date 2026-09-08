-- =====================================================================
-- Programa de RP (referidos) — captura en la comanda
--
-- Dos columnas en `comandas`:
--   rp_name      quién mandó a esa mesa. Se guarda el NOMBRE tal cual,
--                no un id, para que el histórico no dependa de que la
--                lista de src/config/rps.js nunca cambie. Si mañana un
--                RP se da de baja, las comandas viejas siguen legibles.
--   rp_cortesia  si esa mesa llevó trago de bienvenida de cortesía.
--                Lo pide el RP al avisar, nunca el cliente.
--
-- La regla de negocio (escalones 5% / 10% y la descalificación por
-- cortesía que no llegó a $1,000) vive en src/utils/rp.js, NO aquí.
-- La base de datos solo guarda los hechos.
--
-- No hace falta RPC: `comandas` ya tiene política de UPDATE/INSERT para
-- `authenticated` (ver 20260511000005_supabase_auth_rls.sql), a
-- diferencia de `payments`. Un .update() directo del cliente funciona.
-- =====================================================================


-- ── BLOQUE 1: las columnas ───────────────────────────────────────────
alter table public.comandas
    add column if not exists rp_name     text,
    add column if not exists rp_cortesia boolean not null default false;


-- ── BLOQUE 2: integridad ─────────────────────────────────────────────
-- No puede haber cortesía sin RP. Si esto truena, hay filas con
-- rp_cortesia = true y rp_name null — avísame antes de forzarlo.
alter table public.comandas
    drop constraint if exists comandas_rp_cortesia_requires_rp;

alter table public.comandas
    add constraint comandas_rp_cortesia_requires_rp
    check (rp_cortesia = false or rp_name is not null);


-- ── BLOQUE 3: índice para el reporte semanal ─────────────────────────
-- Parcial: solo indexa las comandas que sí traen RP, que van a ser
-- una minoría. Ocupa casi nada.
create index if not exists comandas_rp_name_cobrado_at_idx
    on public.comandas (rp_name, cobrado_at)
    where rp_name is not null;

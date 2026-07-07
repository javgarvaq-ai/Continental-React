-- Backfill único: registra como cash_movement el fondo de caja chica ($805)
-- que se puso físicamente un día antes de abrir el primer turno del sistema.
--
-- Por qué: la convención actual es que `createShift` NUNCA crea un cash_movement
-- por `starting_cash` (decisión 2026-06-13, ver tasks/lessons.md). Eso significa
-- que el fondo original con el que arrancó el negocio nunca quedó documentado
-- como movimiento — y el nuevo cálculo persistente del cajón en el Ledger
-- (tasks/todo.md, sección "Cajón persistente en el Ledger") depende de que
-- TODO el efectivo que ha entrado o salido del cajón tenga un cash_movement
-- respaldándolo. Sin este backfill, el acumulado persistente nacería en $0 y
-- quedaría desfasado de la realidad física por $805 para siempre.
--
-- Este es un evento único (el arranque del negocio), no un patrón a repetir:
-- los `starting_cash` de turnos posteriores NO necesitan movimiento porque es
-- el mismo dinero que ya dejó el turno anterior, no dinero nuevo.
--
-- IMPORTANTE — revisar antes de correr:
--   1. La subconsulta de user_id toma el primer usuario con role='admin' por
--      fecha de creación. Si existe más de un admin, confirma que resuelve a
--      la cuenta correcta (Javi) antes de ejecutar.
--   2. Ejecutar a mano en el SQL Editor de Supabase. No es una migración de
--      esquema — no usar `apply_migration` ni `supabase db push` para esto.
--   3. Es un INSERT de un solo renglón; no hay rollback automático — si el
--      monto o la fecha no son correctos, corrige los valores abajo antes de
--      correr, o borra el renglón después con su `id` (ver SELECT de verificación
--      al final).

INSERT INTO public.cash_movements (
    shift_id,
    user_id,
    type,
    amount,
    note,
    category,
    movement_nature,
    source_location,
    destination_location,
    created_at
)
SELECT
    first_shift.id,
    first_admin.id,
    'deposit',
    805,
    'Fondo inicial histórico — caja chica para cambio, puesta un día antes de abrir el primer turno (backfill 2026-07-07)',
    'aportacion_socio',
    'owner_funding',
    'owner',
    'drawer',
    first_shift.opened_at - INTERVAL '1 day'
FROM
    (SELECT id, opened_at FROM public.shifts ORDER BY opened_at ASC LIMIT 1) AS first_shift,
    (SELECT id FROM public.users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1) AS first_admin;

-- Verificación después de correr:
-- SELECT * FROM public.cash_movements WHERE category = 'aportacion_socio' AND amount = 805 ORDER BY created_at ASC LIMIT 1;

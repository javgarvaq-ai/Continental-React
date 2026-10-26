-- comanda_events.created_at era `timestamp` SIN zona horaria (el resto de las
-- tablas usa timestamptz). El default now() guardaba la hora UTC "desnuda", así
-- que el front la interpretaba como hora local (6 h adelantada) y los filtros
-- con offset -06:00 cortaban el día en el lugar equivocado.
-- Verificado 2026-10-25: created_at coincide exacto con comandas.cobrado_at en UTC.
--
-- Se convierte declarando que los valores existentes ESTÁN en UTC. El default
-- now() se conserva y ya produce timestamptz. No hay vistas ni funciones que
-- lean esta columna (solo INSERTs), así que el cambio de tipo no rompe nada.

ALTER TABLE public.comanda_events
    ALTER COLUMN created_at TYPE timestamptz
    USING created_at AT TIME ZONE 'UTC';

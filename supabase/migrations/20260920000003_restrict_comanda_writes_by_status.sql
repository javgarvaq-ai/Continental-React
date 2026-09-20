-- 2.16 (audit 2026-09-18): comandas/comanda_items eran 100% editables por
-- cualquier authenticated via RLS USING(true)/WITH CHECK(true). Cualquier
-- sesion autenticada podia escribir comanda_items de una comanda ya cerrada,
-- o mover comandas.status directamente a 'paid' sin pasar por el RPC
-- finalize_comanda_payment.
--
-- Verificado antes de escribir esto (ver tasks/todo.md seccion 2.16 para el
-- mapeo completo): todos los escritores directos de cliente (no-RPC) sobre
-- comanda_items solo escriben cuando la comanda esta 'open' (algunos con
-- guard explicito en el cliente, otros por como se usan en la practica), y
-- ningun flujo del cliente reabre una comanda que ya esta 'paid'. Los RPCs
-- SECURITY DEFINER (present_bill_atomic, finalize_comanda_payment,
-- activate_membership) no pasan por estas policies, asi que no se ven
-- afectados por este cambio.

-- ── comanda_items: solo se puede insertar/actualizar si la comanda sigue abierta ──
DROP POLICY IF EXISTS "comanda_items_insert" ON public.comanda_items;
CREATE POLICY "comanda_items_insert" ON public.comanda_items
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.comandas c WHERE c.id = comanda_id AND c.status = 'open')
    );

DROP POLICY IF EXISTS "comanda_items_update" ON public.comanda_items;
CREATE POLICY "comanda_items_update" ON public.comanda_items
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.comandas c WHERE c.id = comanda_id AND c.status = 'open'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.comandas c WHERE c.id = comanda_id AND c.status = 'open'));

-- ── comandas: ningun UPDATE directo de cliente puede dejar el status en 'paid' ──
-- (el RPC finalize_comanda_payment es SECURITY DEFINER y no pasa por esta policy)
DROP POLICY IF EXISTS "comandas_update" ON public.comandas;
CREATE POLICY "comandas_update" ON public.comandas
    FOR UPDATE TO authenticated USING (true) WITH CHECK (status <> 'paid');

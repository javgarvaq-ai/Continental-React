# Project Tasks (TODO)

## Fase 1 — Completada ✅
Ver historial — 5 fixes aplicados y commiteados (2026-05-08).

---

## Fase 2 — Hardening MVP ✅

### HP-2: Status guards en transiciones de comanda ✅
- [x] `comandaCheckout.js` → `reopenComanda`: `.eq('status', safePreviousStatus)` + rowCount check
- [x] `comandaCheckout.js` → `startPayment`: `.eq('status', 'pending_payment')` + rowCount check
- [x] `comandas.js` → `cancelComanda`: `.eq('status', 'open')` + rowCount check
- [x] `useShift.js` → `handleConfirmCloseShift`: `.eq('status', 'open')` + rowCount check

### HP-3: FK en comanda_events.comanda_id ✅
- [x] Migración `20260508200003_hp3_comanda_events_fk.sql`

### HP-6: Soft-delete de comanda_items ✅
- [x] Migración `20260508200004_hp6_comanda_items_soft_delete.sql` — CHECK `status IN ('active','cancelled')`
- [x] `products.js` → `decreaseCartItem`: UPDATE `status='cancelled'` en lugar de DELETE (item y mixers)

### HP-1: RPC present_bill_atomic ✅
- [x] Migración `20260508200005_phase2_rpcs.sql` — función SQL atómica con guard de status='open'
- [x] `comandaCheckout.js` → `presentBill`: llama RPC en lugar de dos calls separados

### CRIT-3 paso 1: verify_pin RPC ✅
- [x] Migración `20260508200005_phase2_rpcs.sql` — pgcrypto + `verify_pin` SECURITY DEFINER
- [x] `auth.js`: usa `supabase.rpc('verify_pin')`, sin bcrypt en cliente, sin SELECT a users

### adjust_inventory_stock RPC ✅
- [x] Migración `20260508200005_phase2_rpcs.sql` — `adjust_inventory_stock` con UPDATE...RETURNING
- [x] `inventoryAdmin.js`: llama RPC en lugar de SELECT + UPDATE + INSERT separados

---

## Quick fixes pre-apertura ✅
- [x] MP-5: Timezone fix en WeeklyReportPage — usa fecha local en lugar de UTC
- [x] MP-10: Mensaje claro cuando el turno ya está abierto (error 23505 → texto útil para el cajero)
- [x] Print popup bloqueado: `printTicket` acepta `onBlocked` callback; cuenta, pagado y reprint muestran aviso visible en UI

## Diferido (Fase 3)
- CRIT-3 paso 2: tightening RLS en users/shifts/comandas — requiere convertir create_user, close_shift y otros a RPCs SECURITY DEFINER primero
- HP-5: membership processing dentro de finalize_comanda_payment — muy invasivo, requiere reescritura del RPC core

---

## Review / Resultados Fase 2

Implementado 2026-05-08. 6 bloques en 6 archivos de código + 3 migraciones nuevas:

| Fix | Archivos | Tipo |
|-----|----------|------|
| HP-2 | comandaCheckout.js, comandas.js, useShift.js | Service + hook |
| HP-3 | migration 03 | DB schema |
| HP-6 | migration 04 + products.js | DB schema + service |
| HP-1 | migration 05 + comandaCheckout.js | DB RPC + service |
| CRIT-3 p1 | migration 05 + auth.js | DB RPC + service |
| adjust_inventory | migration 05 + inventoryAdmin.js | DB RPC + service |

**Acciones requeridas en producción:**
1. Aplicar migraciones 03, 04, 05 al proyecto Supabase remoto (`supabase db push` o Studio)
2. Verificar que `pgcrypto` esté habilitado en el proyecto (ya viene activado por defecto en Supabase)
3. Probar login con PIN en dev antes de merge a main

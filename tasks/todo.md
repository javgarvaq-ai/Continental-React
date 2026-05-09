# Project Tasks (TODO)

## Fase 1 — Must-fix antes de operar en barra real

### CRIT-1: Fix membership cancellation CHECK constraint ✅
- [x] Migración `20260508200001_allow_cancelled_membership_status.sql`: agrega `'cancelled'` al CHECK
- [x] `src/services/comandas.js` → `cancelComanda`: destructura y chequea error del UPDATE de membresía

### CRIT-2: Quitar pin_hash del localStorage ✅
- [x] `src/services/auth.js` → `loginWithPin`: `select` explícito, destruye `pin_hash` antes de retornar

### CRIT-4: Índice único parcial — una comanda abierta por unidad ✅
- [x] Migración `20260508200002_one_open_comanda_per_unit.sql`: índice único parcial en `comandas(unit_id) WHERE status IN (...)`
- [x] `src/services/comandas.js` → `getOrCreateActiveComanda`: captura error `23505` y relee la comanda existente

### CRIT-5: requireOnline en todos los handlers que mueven dinero ✅
- [x] `usePayment.js`: isOnline param + guards en handlePresentBill, handleReopenComanda, handleStartPayment, handleConfirmPayment
- [x] `useShift.js`: isOnline param + guards en handleConfirmCloseShift, handleCashMovementSubmit
- [x] `useComanda.js`: guards en handleDecreaseCartItem, handlePersonasChange
- [x] `useCustomer.js`: isOnline param + guards en handleAssignCustomer, handleCreateAndAssignCustomer, handleActivateMembership, handleCancelMembership, handleAddFreeBenefit
- [x] `PosPage.jsx`: isOnline propagado a useCustomer, useComanda, usePayment, useShift; guard en handleCancelMesa

### HP-4: Limpiar migración vacía ✅
- [x] `20260508185735_remote_schema.sql` convertida a noop (comentario SQL)

---

## Fase 2 — Hardening MVP (pendiente)
- [ ] CRIT-3 paso 1: RPC `verify_pin` SECURITY DEFINER + bloquear `select(pin_hash)` para anon
- [ ] CRIT-3 paso 2: quitar UPDATE/DELETE de anon en payments, shifts, users, comandas
- [ ] HP-1: RPC `present_bill_atomic`
- [ ] HP-2: Status guards en UPDATEs (reopen, startPayment, cancel, closeShift)
- [ ] HP-3: FK de `comanda_events.comanda_id`
- [ ] HP-5: Membership processing dentro del RPC
- [ ] HP-6: Soft-delete de comanda_items (status='cancelled' en lugar de DELETE)
- [ ] RPC `adjust_inventory_stock` atómica

---

## Review / Resultados Fase 1

Implementado 2026-05-08. 5 fixes en 9 archivos:

| Fix | Archivos | Tipo |
|-----|----------|------|
| CRIT-1 | migration + comandas.js | DB schema + service |
| CRIT-2 | auth.js | Service layer |
| CRIT-4 | migration + comandas.js | DB schema + service |
| CRIT-5 | usePayment, useShift, useComanda, useCustomer, PosPage | Hooks + page |
| HP-4 | migration vacía | Repo hygiene |

**Acción requerida en producción:** aplicar las 2 migraciones nuevas al proyecto Supabase remoto (`supabase db push` o aplicar manual desde Studio).

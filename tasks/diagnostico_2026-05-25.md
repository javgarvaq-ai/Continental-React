# Diagnóstico Técnico — Continental POS
**Fecha:** 2026-05-25  
**Revisado por:** Senior Full Stack Review  
**Estado del proyecto:** Pre-launch (staging)

---

## TL;DR

El proyecto está en buen estado general para un POS en staging. La arquitectura es sólida, el flujo de auth fue modernizado correctamente a Supabase Auth, las RLS existen y tienen buena cobertura, y el histórico de migraciones muestra un proceso de hardening real y honesto. Los problemas que siguen son reales pero ninguno es un bloqueador catastrófico — son el tipo de deuda que se acumula cuando un proyecto evoluciona rápido.

---

## 1. Seguridad

### ✅ RESUELTO — CORS en Edge Functions

Los tres Edge Functions (`create-user`, `reset-pin`, `deactivate-user`) usan:

```js
const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*'
```

**Verificado el 2026-05-25:** `ALLOWED_ORIGIN` está correctamente configurado en Supabase Secrets. Los Edge Functions no caen al wildcard `*`.

---

### 🟡 MEDIO — `/setup-admin` sin ningún guard de ruta

En `App.jsx`:

```jsx
<Route path="/setup-admin" element={<SetupAdminPage />} />
```

No hay `ProtectedRoute`, `AuthRoute`, ni nada. La página misma redirige a `/login` si ya hay usuarios, pero la lógica de "si no hay usuarios, muestra setup" está en cliente — lo que significa que cualquier persona en internet puede navegar a `/setup-admin` y ver el HTML con la referencia a `tasks/todo.md` y las instrucciones de bootstrap. En el caso extremo donde la query a Supabase falla (error de red, Supabase caído), la condición `if (loading) return null` bloquea el render pero el estado nunca llega a `usersExist = true`, lo cual depende del error handling.

El riesgo real es bajo porque esta ruta solo es peligrosa cuando la base de datos está vacía. Pero es una superficie innecesaria.

**Fix simple:** Después del primer deploy, esta ruta debería ser removida de `App.jsx` completamente. O al mínimo, la página no debería mencionar rutas de archivos internos en su HTML.

---

### 🟡 MEDIO — `users` SELECT abierto a `anon` expone todos los nombres e IDs de empleados

La política `users_select` en `anon` devuelve `id, name, active` de todos los empleados. Esto es un diseño intencional (necesario para la pantalla de login). El riesgo es que cualquiera con la URL del app puede hacer:

```
GET /rest/v1/users?active=eq.true&select=id,name
```

Y obtener la lista completa de empleados con sus UUIDs. Con el UUID + un ataque de PIN bruteforce, podrían intentar iniciar sesión como cualquier empleado. Supabase Auth tiene rate limiting nativo, lo que mitiga esto, pero vale la pena documentarlo como decisión de diseño consciente.

**No requiere cambio urgente**, pero si quieres eliminar la exposición: mover la lista de usuarios al login a través de un RPC `SECURITY DEFINER` que solo devuelva los campos necesarios y pueda agregar lógica de throttling adicional.

---

### 🟢 BIEN — Lo que está correcto en seguridad

- RLS habilitado en todas las tablas con cobertura correcta para `authenticated`.
- Políticas de admin/manager correctamente segregadas vía subquery en `public.users` (no `user_metadata`, que es editable por el usuario).
- `execute_sql` RPC de dev fue creado, protegido, y luego correctamente eliminado en producción antes del launch.
- Edge Functions verifican JWT + rol admin desde `public.users` antes de cualquier acción.
- `users.email` (formato `{uuid}@continental.bar`) es stripeado antes de llegar al store/cliente.
- `service_role_key` solo existe en los Edge Functions vía secreto Supabase — nunca en el cliente.
- Tablas de audit inmutables por diseño: `cash_movements` sin UPDATE/DELETE, `comanda_items` con soft-delete, `membership_benefit_usage` sin UPDATE/DELETE.

---

## 2. Bugs y Flujos — Por Prioridad

### 🔴 BUG — Mesero que hace login cuando no hay turno abierto

**Reproduce:** Un mesero ingresa su PIN cuando ningún turno está abierto.

**Qué pasa:** La pantalla de "efectivo inicial de caja" aparece. El mesero ingresa un monto. `createShift` falla silenciosamente con RLS (403) y el usuario ve: `"Error abriendo turno. Intenta de nuevo."` Esto es confuso y frustrante.

**Por qué pasa:** `createShift` está correctamente protegido por RLS a `role IN ('admin', 'manager')`, pero `LoginPage` no verifica el rol antes de mostrar el formulario de apertura de turno.

**Fix:** En `LoginPage`, después de `loginWithPin()` exitoso y antes de verificar el turno abierto, chequear si el rol del usuario permite crear turnos:

```js
if (!existingShift?.length && user.role === 'waiter') {
    setStatus('No hay turno abierto. Pide a un administrador que abra el turno.')
    await supabase.auth.signOut()
    setPin('')
    setIsSubmitting(false)
    return
}
```

---

### 🟡 BUG — `handleCashChange` permite múltiples puntos decimales

En `LoginPage`:

```js
const val = e.target.value.replace(/[^0-9.]/g, '')
```

Permite "100.50.25". El `type="number"` del input maneja la validación en submit, pero el valor mostrado en pantalla puede ser confuso y la animación del input se comporta raro.

**Fix:** `replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')`

---

### 🟡 BUG — Flash de pantalla blanca en cada recarga de página

`AuthRoute`, `ProtectedRoute`, y `ManagerRoute` devuelven `null` mientras `isVerifying` es `true`:

```jsx
if (isVerifying) return null
```

Esto produce una pantalla en blanco visible durante el tiempo que tarda `verifySession` (2-4 queries a Supabase). En un tablet de bar con conexión variable, puede verse como un crash.

**Fix:** Devolver un indicador de carga mínimo en lugar de `null`:

```jsx
if (isVerifying) return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e' }} />
)
```

El mismo issue aplica a `SetupAdminPage` que también retorna `null` mientras carga.

---

### 🟡 BUG — Race condition en apertura de turno no da feedback de UI claro

Si dos terminales abren la app simultáneamente sin turno activo, ambas verán el formulario de "efectivo inicial" y la segunda fallará con código `23505`. El mensaje actual es correcto: `"Ya hay un turno abierto en otra terminal..."`. Bien. Pero después de mostrar ese mensaje, el `setIsSubmitting(false)` no limpia el formulario — el usuario puede intentar submitir de nuevo y obtener el mismo error hasta que recargue la página. Sería mejor agregar un botón "Recargar" al mostrar el error 23505.

---

### 🟢 FLUJOS BIEN RESUELTOS

- Transiciones de estado de comanda con guards: `.eq('status', expectedPreviousStatus)` + rowCount check en todos los paths críticos.
- Pago idempotente: `finalize_comanda_payment` verifica `status = 'processing_payment'` antes de actuar.
- Shot mixer: el flag `setIsAddingProduct` está correctamente en `finally` para evitar estados stuck.
- Membership + comanda atómica en RPC — no hay ventana de inconsistencia.
- Turno cerrado con doble-check: `closeShift` usa `.eq('status', 'open')` y verifica el row count.

---

## 3. Adiciones y Cambios Sugeridos

### 🔴 URGENTE — Verificar `ALLOWED_ORIGIN` en Supabase Secrets antes del launch

Ver sección de seguridad. Es un comando de 30 segundos.

---

### 🟡 Waiter role check en LoginPage antes de mostrar "abrir turno"

Descrito arriba. Una línea de código que evita un bug frustrante en producción el primer día.

---

### 🟡 No hay loading state durante la verificación de sesión

Afecta la percepción de estabilidad del sistema en el tablet de la barra. Fix descrito arriba.

---

### 🟡 Manejar el caso de Supabase offline de forma más visible

Cuando la app abre sin conexión a Supabase, `verifySession` puede fallar silenciosamente y el usuario llega a login sin entender qué pasó. El `requireOnline` guard está bien en las operaciones mutantes, pero la verificación inicial de sesión no tiene un path de "sin conexión".

Sugerencia: Detectar si es un error de red en `verifySession` y mostrar un banner de "Sin conexión — modo offline" en lugar de forzar al usuario a login.

---

### 🟢 MENOR — Agregar `autoComplete="current-password"` al input de PIN

Actualmente tiene `autoComplete="off"`. En el tablet fijo del bar esto es irrelevante, pero en cualquier otro dispositivo los password managers no pueden asistir. Cambiar a `autoComplete="current-password"` ayuda en flujos de accesibilidad.

---

## 4. Código Muerto / No Utilizado

### Archivos a eliminar

| Archivo | Estado |
|---------|--------|
| `src/pages/SqlAdminPage.jsx` | Intencionalmente vaciado — el archivo existe pero no hace nada. Puede eliminarse. |
| `src/App.css` | Contiene los estilos del template por defecto de Vite (`.hero`, `.counter`, `.ticks`, `#next-steps`, etc.). **Ninguna clase de este archivo se usa en el proyecto.** Es dead code puro. |
| `src/assets/react.svg` | Logo de React del template de Vite. No se usa. |
| `src/assets/vite.svg` | Logo de Vite del template. No se usa. |
| `src/assets/hero.png` | No referenciado en ningún archivo `src/`. |
| `src/assets/LogotipoContinental_FNEGRO-01.png` | No referenciado en ningún archivo `src/` (se usa `logo.png`). |

### Limpieza de rutas

`/setup-admin` en `App.jsx` debería ser eliminada una vez que el sistema esté bootstrapped. Es una superficie innecesaria en producción.

### `tasks/todo.md` referenciado en HTML público

`SetupAdminPage` renderiza `tasks/todo.md` en pantalla como referencia de instrucciones. Esta página es accesible sin auth, lo que significa que la ruta de un archivo interno de proyecto aparece en el HTML público. Menor, pero innecesario.

---

## 5. Best Practices y Estándares

### 🟡 100% inline styles — no hay sistema de diseño

Cada componente y página usa objetos de estilo inline. Hay patrones repetidos en al menos 8 archivos distintos: el mismo botón verde/gris de submit, la misma card oscura de contenido, el mismo input oscuro. Esto no es un bug pero crea deuda de mantenimiento real:

- Cambiar el verde primario (`#4ade80`) requiere buscar y reemplazar en ~15 archivos.
- El mismo botón de submit está definido 8+ veces con variaciones leves.
- El tamaño del bundle aumenta con inline styles repetidas (no puede ser deduplicado por el CSS bundler).

**Sugerencia mínima:** Un archivo `src/styles/tokens.js` con las constantes de color y spacing, importado donde se necesite. No requiere migrar a CSS modules ni Tailwind.

---

### 🟡 Sin tests automatizados

El proyecto tiene QA docs excelentes (`.docx`) pero cero tests programáticos. Para un sistema que maneja dinero, pagos y membresías, la ausencia de tests de integración es un riesgo real cuando el proyecto crezca. No es bloqueador para el launch actual (el QA manual está bien documentado), pero es deuda técnica que se cobra con los primeros cambios post-launch.

**Sugerencia mínima para el futuro:** Tests de integración para `confirmPayment`, `closeShift`, y `activate_membership` — los tres flujos donde un bug tiene consecuencias financieras directas.

---

### 🟡 Sin TypeScript

El proyecto usa JS puro. Para un POS financiero, la falta de tipos significa que un `number` que se convierte silenciosamente en `string` puede afectar cálculos de pago sin un error visible. El patrón actual de `Number(value || 0)` defensivo en todas partes compensa parcialmente esto, pero es trabajo manual que TS haría automáticamente.

No es un cambio para hacer ahora (la migración en mid-project es costosa), pero es algo a considerar si el proyecto escala.

---

### 🟡 `useEffect` sin dependencias en `App.jsx`

```jsx
useEffect(() => {
    verifySession()
}, [])
```

El array de dependencias vacío con un ESLint de hooks activo debería generar un warning sobre `verifySession`. En la práctica funciona correctamente porque `verifySession` no cambia entre renders (es una función de Zustand), pero el linting debería estar pasando limpio. Agregar `// eslint-disable-next-line react-hooks/exhaustive-deps` con un comentario explicativo, o usar `useRef` para almacenar la referencia.

---

### 🟢 BIEN — Estándares que se respetan correctamente

- Patrón `{ data, error }` uniforme en toda la service layer. Consistencia total.
- Supabase calls SOLO en `src/services/`. Ningún hook o página llama directamente a Supabase.
- `requireOnline` como primera línea de todos los handlers mutantes.
- Double-confirm pattern para acciones destructivas.
- `SECURITY DEFINER` + `search_path` correctamente configurado en todos los RPCs.
- Role check desde `public.users`, NO desde `user_metadata`.
- Soft-delete en `comanda_items` (preserva audit trail + FK integrity).
- `pin_hash` ya no existe — Supabase Auth maneja auth completamente.
- `bcryptjs` eliminado del bundle del cliente.

---

## 6. Flujos que Merecen Revisión / Simplificación

### La división `service.js` / `serviceAdmin.js`

El patrón de tener `customers.js` + `customersAdmin.js` (y lo mismo para products, inventory, membership, units) tiene lógica: separa las operaciones del POS de las del admin panel. Pero la línea no siempre es clara:

- `membership.js` tiene `activateMembership`, `processMembershipOnPayment`, y también `getCustomerWithMembership` y `getCustomerByIdWithMembership` — funciones que usa el POS.
- `customers.js` tiene solo funciones de lectura para el POS. `customersAdmin.js` tiene las de escritura para el panel admin. Esta división es limpia.
- `products.js` es un archivo masivo (probablemente el más grande de services) que mezcla lectura del catálogo, operaciones de carrito, y lógica de shots.

**Sugerencia:** No es urgente refactorizar, pero si `products.js` sigue creciendo, separar `src/services/cart.js` para las operaciones de comanda_items tiene sentido.

---

### `getShiftSummary` — cálculos duplicados entre cliente y DB

`getShiftSummary` en `shifts.js` hace todos los cálculos de totales en JavaScript (cliente). Luego, `closeShift` manda esos mismos totales al DB. Si hay un bug en el cálculo client-side, los números en la DB estarán mal. La DB no valida los totales al recibir el UPDATE.

**Riesgo actual:** Bajo, porque el cálculo es simple y bien probado. Pero si la lógica de propinas o movimientos de caja se complica, este patrón va a generar inconsistencias.

**Sugerencia a futuro:** Mover el cálculo de cierre a un RPC `close_shift_atomic(p_shift_id, p_cash_counted)` que recalcule los totales desde la DB antes de escribir. Mismo patrón que `finalize_comanda_payment`.

---

### `LoginPage` tiene demasiada lógica para ser una "sola página"

`LoginPage` maneja dos fases completas (login + apertura de turno), validación de PIN, llamadas a `loginWithPin`, `getOpenShift`, `createShift`, y manejo de errores de cada uno. Es funcional pero se haría más mantenible con un `useLoginFlow` hook extraído, siguiendo el patrón de `useShift`, `usePayment`, etc. que ya existe en el proyecto.

---

### `PosPage.jsx` es demasiado grande

Aunque los hooks están extraídos correctamente, el PosPage sigue siendo un archivo de 64KB+ que gestiona demasiados estados y flujos. Este es el costo de una arquitectura donde todo el estado de POS está en una sola página para evitar props drilling.

La decisión de no usar Context/Redux fue razonable para el tamaño actual del proyecto, pero si el POS sigue creciendo, considerar `React.createContext` para el estado de `currentComanda` y `currentUser` al menos.

---

## 7. ¿Parece código humano o de IA?

**Veredicto: Mayoritariamente IA, con dirección humana activa y significativa.**

**Señales de IA:**
- Estilo de comentarios extremadamente uniforme en todas las migraciones y servicios (los `── sección ─────` son un fingerprint claro).
- `{ data, error }` return shape sin ninguna excepción en toda la codebase — uniformidad que un equipo humano no mantiene tan consistentemente.
- Cada función tiene un comment block de "por qué" bien articulado. Los humanos escribimos esto a veces, no siempre.
- Las migraciones están documentadas como tutoriales, no como cambios de producción.
- `lessons.md` está escrito en primera persona de IA ("Cuando añades...", "Nunca hagas...", "El patrón correcto es...").
- El manejo de errores es defensivo hasta el punto de que parece generado por alguien que conoce todos los edge cases de antemano.

**Señales humanas:**
- El mezclado español/inglés es orgánico — algunos mensajes de error en español, algunos en inglés, sin patrón fijo. Un AI uniformizaría.
- `tasks/todo.md` lee como un diario de sprint real con prioridades que cambian.
- Las decisiones de producto (nombres de empleados visibles en login, el flujo de PIN, los tipos de movimientos de caja) reflejan conocimiento real del dominio.
- Los bugs encontrados en QA son el tipo de bugs que aparecen cuando alguien usa el sistema de verdad, no en revisión de código.
- El proyecto evolucionó: hay migración de bcrypt → Supabase Auth, de RPCs custom → Edge Functions. Eso refleja aprendizaje real, no un diseño pre-planificado perfecto.

**Conclusión:** IA escribió la mayor parte del código bajo dirección humana intensa. La arquitectura, el contexto del negocio, las decisiones de diseño y la evolución del proyecto reflejan comprensión real del problema. El código mismo es más limpio y uniforme de lo que un solo desarrollador mantendría bajo presión — eso es el valor real que aportó la IA aquí.

---

## Resumen de Prioridades

| # | Prioridad | Descripción |
|---|-----------|-------------|
| 1 | ✅ Resuelto | `ALLOWED_ORIGIN` configurado en Supabase Secrets — verificado 2026-05-25 |
| 2 | 🔴 Crítico | Bug de waiter intentando abrir turno — error de RLS confuso |
| 3 | 🟡 Medio | Flash de pantalla blanca durante `isVerifying` |
| 4 | 🟡 Medio | `/setup-admin` sin guard de ruta |
| 5 | 🟡 Medio | `handleCashChange` permite múltiples puntos decimales |
| 6 | 🟢 Cleanup | Eliminar `App.css`, `react.svg`, `vite.svg`, `hero.png`, `LogotipoContinental_FNEGRO-01.png`, `SqlAdminPage.jsx` |
| 7 | 🟢 Deuda | Centralizar tokens de estilo para eliminar inline styles duplicadas |
| 8 | 🟢 Deuda | Considerar mover cierre de turno a RPC server-side a futuro |

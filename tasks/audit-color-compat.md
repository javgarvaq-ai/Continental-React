# Audit de compatibilidad visual de colores (dev vs PWA Brave)

> Solo diagnóstico. **No se modificó código.** Revisar caso por caso.
> Fecha: 2026-05-31

## TL;DR — La causa raíz

El bug **no** son los `color: 'white'` (esos están bien sobre fondos oscuros).
El problema real es la cascada de `src/index.css`:

1. `:root` define las variables con valores **claros por defecto** — entre ellos
   `--text-h: #08060d` (casi negro) y `--bg: #fff`.
2. Esos valores solo se sobrescriben a tonos legibles **dentro de**
   `@media (prefers-color-scheme: dark)`.
3. Pero la regla `h1, h2 { color: var(--text-h) }` (línea 89-94) viene **después**
   de `h1..h6 { color: #e2e8f0 }` (línea 64-66), así que para `<h1>` y `<h2>`
   gana la variable.

Resultado:
- **Browser de dev** → corre con el SO en modo oscuro → `prefers-color-scheme: dark`
  activo → `--text-h` = `#f3f4f6` (claro) → títulos legibles. ✅
- **PWA en Brave (PC del bar)** → el SO/PWA reporta modo claro → la media query
  NO aplica → `--text-h` = `#08060d` (casi negro) sobre tarjetas `#111/#181818`
  → **títulos invisibles**. ❌

Esto coincide exactamente con el síntoma reportado: texto negro sobre fondo oscuro
en las páginas de administración (todos los `<h1>` y `<h2>` sin color inline).

---

## Categoría A — CAUSA RAÍZ: variables que caen a casi-negro sin modo oscuro

| Archivo | Línea | Qué pasa | Severidad |
|---|---|---|---|
| `src/index.css` | 2 | `--text: #6b6375` (default claro) | Alta |
| `src/index.css` | 3 | `--text-h: #08060d` (casi negro como default) | **Crítica** |
| `src/index.css` | 4 | `--bg: #fff` (blanco como default) | Media |
| `src/index.css` | 89-94 | `h1, h2 { color: var(--text-h) }` sobrescribe el `#e2e8f0` seguro de la línea 64-66 → **todos los `<h1>`/`<h2>` sin color inline quedan dependiendo del modo del SO** | **Crítica** |
| `src/index.css` | 122-128 | `code, .counter { color: var(--text-h) }` — mismo riesgo (bajo uso real) | Baja |

**Elementos afectados en la práctica** (h1/h2 sin `color` inline → heredan var(--text-h)):

| Archivo | Línea | Elemento |
|---|---|---|
| `src/pages/UsersAdminPage.jsx` | 199 | `<h1>Users Administration</h1>` |
| `src/pages/UsersAdminPage.jsx` | 218 | `<h2>Create User</h2>` |
| `src/pages/UsersAdminPage.jsx` | 330 | `<h2>Current Users</h2>` |

> Nota: hay que barrer el resto de páginas admin para `<h1>`/`<h2>` sin `color`
> inline — siguen el mismo patrón (mismo componente base, mismas tarjetas oscuras).
> La corrección de fondo (un solo punto) es en `index.css`, no página por página.

---

## Categoría B — `color: inherit` sin fallback explícito

| Archivo | Línea | Qué pasa | Severidad |
|---|---|---|---|
| `src/index.css` | 71 | `th, td { color: inherit }` — hereda del ancestro; hoy la cadena llega a `#e2e8f0` del `:root`, así que normalmente queda legible, pero es frágil si algún ancestro fija un color claro/oscuro | Baja-Media |

No se encontraron usos de colores de sistema del navegador
(`ButtonText`, `WindowText`, `CanvasText`, etc.). ✅

---

## Categoría C — Negros hardcodeados (`#000` / `#000000`) — verificar intención

| Archivo | Línea | Qué pasa | Veredicto |
|---|---|---|---|
| `src/components/Ticket.jsx` | 88 | `style="color:#000000"` en aviso de botella gratis | **Intencional** — es el ticket impreso (tinta negra sobre papel blanco). No tocar. |
| `src/components/Ticket.jsx` | 211-212 | `background:#fff; color:#000` en CSS de impresión | **Intencional** — recibo térmico. No tocar. |
| `tasks/todo.md` | 434 | Nota de planificación, no es código | Ignorar |

---

## Categoría D — Código muerto de plantilla (bajo riesgo)

| Archivo | Línea | Qué pasa |
|---|---|---|
| `src/App.css` | 119 | `#next-steps ul a { color: var(--text-h) }` — pertenece a la plantilla Vite (hero/logos/next-steps), no se renderiza en la app real. Mismo riesgo teórico de variable, pero sin impacto. |

---

## Recomendación de orden de revisión

1. **`index.css` (Categoría A)** — un solo arreglo de fondo resuelve la mayoría:
   o se ponen los valores oscuros como default en `:root` (la app es dark-only),
   o se quita la dependencia de `var(--text-h)` en `h1/h2`. Esto elimina la
   diferencia dev-vs-PWA de raíz.
2. **Barrer `<h1>`/`<h2>` sin color inline** en el resto de páginas admin para
   confirmar el alcance (aunque el fix de `index.css` ya los cubre).
3. **`th, td { color: inherit }`** — decidir si se le da un color explícito.
4. **Ticket.jsx** — confirmar que se deja como está (impresión).

---

## Cómo reproducir / verificar el diagnóstico

En la PC del bar (Brave PWA), abrir DevTools → Rendering → "Emulate CSS
prefers-color-scheme" y alternar `light`/`dark`: en `light` los `<h1>`/`<h2>`
se vuelven casi negros; en `dark` se ven claros. Eso confirma la Categoría A.

---
name: frontend-react
description: Patrón exacto para añadir o modificar una pantalla en apps/frontend (React 18 + Vite + React Router + TanStack Query + Tailwind), registro de rutas, uso de api-client y ApiError, formato de pesos y por qué el importe siempre lo calcula el servidor, formularios con useState, y la deuda de textos hardcodeados (CV-012). Úsala al crear una página, un componente compartido o al tocar cualquier archivo de apps/frontend/src.
---

# Añadir una pantalla al frontend

Referencia viva: `apps/frontend/src/pages/ContractsPage.tsx` (pantalla con dinero, la más completa) y
`apps/frontend/src/pages/CustomersPage.tsx` (CRUD con modal). Copia esos patrones literalmente.
Diseño: [docs/08-arquitectura-tecnica.md](../../../docs/08-arquitectura-tecnica.md) §4.
Criterios de UI de mostrador: skill `ux-mostrador`. Reglas de dominio: skill `reglas-negocio-empeno`.

Stack real (`apps/frontend/package.json`): React 18.3.1, react-router-dom 6.26.2,
@tanstack/react-query 5.56.2, Vite 5.4.6, Tailwind 3.4.10, TypeScript 5.5.4 `strict`.
**No hay** librería de formularios, ni de componentes (docs/08 §4 menciona Radix/shadcn: no está
instalado), ni i18n, ni axios, ni Zustand/Redux, ni un solo `*.test.tsx`.

## 1. Estructura y registro de una ruta

```
apps/frontend/src/
  main.tsx  App.tsx        # createRoot+StrictMode / providers + tabla de rutas
  lib/api-client.ts        # ÚNICO punto de red;  lib/auth-context.tsx
  components/              # Layout, ProtectedRoute, Modal — solo lo compartido de verdad
  pages/<Nombre>Page.tsx   # una página = un archivo, export nombrado `export function XPage()`
```

Una pantalla nueva son **tres ediciones**:

1. `src/pages/MiPage.tsx`.
2. `App.tsx`: import junto a los demás (líneas 6-17) y `<Route path="/mi-ruta" element={<MiPage />} />`
   dentro del bloque anidado `ProtectedRoute > Layout` (líneas 28-42). Rutas en **español**
   (`/clientes`, `/plan-separe`, `/cartera`); componentes en inglés.
3. `components/Layout.tsx`: entrada en `NAV_ITEMS` (líneas 4-15) para que salga en el menú.

`ProtectedRoute.tsx` solo comprueba que exista `user` en el contexto (hidratado de `localStorage`):
no valida expiración ni rol, y **el menú se muestra completo a todos los roles**. La autorización
real la impone el backend con `@Roles`.

## 2. Llamar al API

Todo pasa por `src/lib/api-client.ts`. Hoy hay exactamente un `fetch` en todo el frontend, el de su
línea 16. Mantenlo así.

- `api.get<T>(path)`, `api.post<T>(path, data?)`, `api.patch<T>(path, data?)` (líneas 40-46). **No
  existen `put` ni `delete`**: si los necesitas, añade el verbo al objeto `api`, no un `fetch` suelto.
- Token: `apiFetch` lee `localStorage.getItem('accessToken')` y añade `Authorization: Bearer` solo si
  existe (líneas 3-5, 22). No lo leas desde la página. **Falta**: un 401 no cierra sesión ni
  redirige; si lo arreglas, hazlo dentro de `apiFetch`.
- Base URL: `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'` (línea 1), tipada en
  `src/vite-env.d.ts` y fijada en `apps/frontend/.env`. Variable nueva ⇒ prefijo `VITE_` y entrada
  también en `.env.example`.
- Errores: respuesta no-ok ⇒ `throw new ApiError(message, body)`, con `message` aplanando el array de
  `class-validator` de Nest (`body.message.join(', ')`) y `data` conservando el cuerpo crudo — así
  `LoginPage.tsx:28` lee `err.data?.mfaRequired`. Los mensajes ya vienen en español: **muéstralos tal
  cual**, con `<p className="text-sm text-red-600">{(mutation.error as ApiError).message}</p>`
  (`ContractsPage.tsx:164`) o volcados a `useState` en `onError` (`CustomersPage.tsx:64`). No hay
  toasts ni error boundary.

Cada página hace sus propios `useQuery`/`useMutation` y renderiza — ese *es* el patrón, no lo cambies.
`queryKey` es un array corto y estable (`['contracts']`, `['items','InStock']`,
`['contract-quote', contract.id]`); tras una mutación invalida **todas** las claves afectadas por el
efecto de dominio, no solo la propia (`ContractsPage.tsx:108-111`: desembolsar invalida `contracts`,
`items` y `cash-current`). El `QueryClient` se crea una vez en `App.tsx:19`, sin opciones.

## 3. Dinero

El backend guarda `Decimal(14,2)` y lo serializa distinto según el endpoint — verifícalo antes de tipar:

- Entidad Prisma cruda ⇒ **string** JSON: por eso `principalAmount: string`, `amount: string`,
  `totalCost: string`. Se muestran como `${Number(x).toLocaleString('es-CO')}`.
- Endpoint calculado (`GET /contracts/:id/quote`, `/accounting/income-statement`) ⇒ **number**. Se
  muestran con el `Intl.NumberFormat` de `ContractsPage.tsx:43-47` (`currency: 'COP'`,
  `maximumFractionDigits: 0`). Prefiere este; el doble estilo actual es deuda y conviene converger.

**Nunca calcules un importe cobrable en el cliente.** El operador elige *cuántos meses* paga, no
cuánta plata entrega; capital vigente, interés, mora y total salen de `/quote`
(`ContractsPage.tsx:254-257`). Es regla de negocio (RN-03, RN-13/16, RN-17 en `reglas-negocio-empeno`),
no estilo. Lo único legítimo en JSX es aritmética **presentacional**: `m * quote.monthlyAmount` para
etiquetar el `<select>` (`:325`) o la barra de progreso de `LayawayPage.tsx`. `CashPage.tsx:44-49`
suma ingresos y egresos en el navegador: es un cuadre de caja en el cliente, no lo imites.

Al liquidar se envía `expectedTotal: quote.settlementTotal` (`ContractsPage.tsx:284`) para que el
servidor rechace si su cálculo difiere. Replica eso en toda operación irreversible con dinero.

## 4. Formularios

`useState` por campo (`ContractsPage.tsx:82-86`) o un objeto único con constante `EMPTY_FORM` y helper
`updateField` tipado (`CustomersPage.tsx:24-35, 72-74`); usa el segundo a partir de ~4 campos.

- Validación: solo atributos HTML (`required`, `type="number"`, `type="email"`, `step`) más guardas
  manuales (`if (!categoryId) return;`). La validación real es del DTO del backend y vuelve como
  `ApiError`. No metas zod/react-hook-form sin acordarlo.
- Envío: `<form onSubmit>` con `e.preventDefault()` y `mutation.mutate()`; montos con `Number(...)`,
  opcionales vacíos como `undefined` (`dueDate || undefined`). Carga: `disabled={mutation.isPending}`
  + `disabled:opacity-50` y texto que cambia (`{m.isPending ? 'Guardando…' : 'Registrar cliente'}`).
- **Doble envío**: es la protección que falta hoy. Desembolsar y retirar (`ContractsPage.tsx:190-203`),
  abrir/cerrar caja (`CashPage.tsx:65, 96`) y registrar abono (`LayawayPage.tsx`) **no** se
  deshabilitan durante la mutación. En cualquier operación que mueva caja es obligatorio.
- Precondiciones de negocio: se deshabilita, no se oculta, y se explica al lado
  (`disabled={!quote.isCurrent}` + la nota de RN-03 en `:355-360`).

## 5. Textos (CV-012)

**Cero i18n**: todo texto visible está hardcodeado en JSX, contra
[docs/09 §5](../../../docs/09-modularidad-configuracion.md). Es CV-012 (docs/12 §3.1). Mientras no
exista la capa: escribe en el vocabulario del mostrador (*préstamo, intereses, abonar, actualizar,
liquidar*) y **no** repliques la terminología legal filtrada en `ContractsPage.tsx:128` ("compraventa
con pacto de retroventa"), `:153` ("Valor de compra") y `:154` ("% Retroventa mensual", variable
`retroventaRate` en `:85`). Los enums del backend nunca se muestran crudos: se traducen con un
`Record<string,string>` local con fallback `?? valor` (`STATUS_LABELS`, `TRANSFER_LABELS`), agrupado
arriba del archivo — es el punto de extracción natural cuando llegue el catálogo `es-CO`. El
identificador visible es `contractNumber`, nunca el uuid (RN-08). Detalle en la skill `ux-mostrador`.

## 6. Tipos

Cada página **redeclara** sus `interface Customer/Item/Contract/CashRegister` con el subconjunto que
usa; `Contract` está duplicada con formas distintas en ContractsPage, LayawayPage y CollectionsPage.
No hay tipos compartidos ni import desde `apps/backend`. Al añadir un campo en el backend, actualiza
**solo** las interfaces de las páginas que lo consumen, respetando §3. Si tocas la misma entidad en
tres páginas, propón `src/lib/types.ts` explícitamente; no lo cueles dentro de otro cambio.

## 7. Qué NO hacer

- `fetch`/axios fuera de `api-client.ts`; aritmética de dinero cobrable en el cliente (§3).
- Estado global nuevo (Redux/Zustand/Context de datos): servidor ⇒ TanStack Query, UI ⇒ `useState`
  local. `AuthContext` es la única excepción y solo guarda sesión.
- Tocar `localStorage` desde una página: `accessToken` y `user` los gestiona `auth-context.tsx` (la
  escritura directa de `MfaSetupPage.tsx:28-31` es una excepción a no imitar).
- CSS propio: todo es Tailwind por clases; `src/index.css` solo tiene las tres directivas y el `body`.
  No hay tema oscuro.
- Ocultar acciones no permitidas en vez de deshabilitarlas con explicación; mostrar uuids, estados o
  mensajes en inglés.

## 8. Ejecutar

Desde la raíz (workspaces npm): `npm run dev:backend` (Nest en `:3000`) y `npm run dev:frontend`
(Vite en `:5173`). El frontend apunta a `VITE_API_URL` de `apps/frontend/.env`, o sea al backend
local: **no hay proxy en `vite.config.ts`**, son peticiones cross-origin directas (de ahí el header
`ngrok-skip-browser-warning` y el `allowedHosts` de `.ngrok-free.app`). Tipos:
`npm run build:frontend` (`tsc -b && vite build`). **No hay tests ni linter en el frontend**:
verificar una pantalla es correr ambos servidores y probarla a mano.

## Checklist

- [ ] Página en `src/pages/`, registrada en `App.tsx` (dentro de `ProtectedRoute > Layout`) y en `NAV_ITEMS`
- [ ] Toda la red vía `api`/`apiFetch`; ningún `fetch` nuevo; verbo añadido al objeto `api` si hacía falta
- [ ] Errores mostrados con el `message` de `ApiError` tal como lo devuelve el backend
- [ ] Ningún importe cobrable calculado en el cliente; los totales vienen del servidor
- [ ] Pesos con `Intl.NumberFormat('es-CO', {currency:'COP'})`; tipos `string` vs `number` según el endpoint
- [ ] Botones de operaciones con dinero con `disabled={mutation.isPending}`
- [ ] `invalidateQueries` de todas las claves afectadas (incluida `cash-current` si mueve caja)
- [ ] Textos en el idioma del operador; enums traducidos en un `Record` agrupado (CV-012, no agravar)
- [ ] `npm run build:frontend` compila sin errores de tipos
- [ ] Si toca contratos, pagos, liquidación, remate o caja, revisar `reglas-negocio-empeno` y `ux-mostrador`

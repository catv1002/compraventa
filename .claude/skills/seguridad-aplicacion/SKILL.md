---
name: seguridad-aplicacion
description: Controles de seguridad verificados de este repo — aislamiento multi-tenant (findOwned), @Roles/RolesGuard y lo que NO valida, auditoría como control, credenciales compartidas, habeas data de los datos del cliente, importes calculados en servidor, secretos y CORS, respaldo del histórico. Úsala al crear o revisar cualquier endpoint, al tocar consultas Prisma por id, al manejar datos personales o dinero, y antes de dar por cerrado un cambio en apps/backend o apps/frontend.
---

# Seguridad de la aplicación (auditoría del código real, 2026-07)

Riesgos **verificados hoy en el código**, no un catálogo genérico. Base: [docs/05-multisucursal-auditoria.md](../../../docs/05-multisucursal-auditoria.md) §3,
[docs/03-dominios-ddd.md](../../../docs/03-dominios-ddd.md) (permisos por dominio), [docs/12-gap-analysis-y-backlog.md](../../../docs/12-gap-analysis-y-backlog.md) §3.3, §3.7, CV-005/016/017/018/028.

## 1. Aislamiento multi-tenant — la regla no negociable

**Ninguna entidad se recupera por id crudo: toda consulta por id filtra por el `tenantId` del usuario.** El uuid no
es un secreto — si el `where` es `{ id }`, conocerlo basta para operar el contrato o la caja de otra empresa.
Patrón correcto, ya en el repo:

```ts
// contracts.service.ts:753 — findOwned()
const contract = await this.prisma.contract.findFirst({ where: { id: contractId, tenantId: currentUser.tenantId } });
if (!contract) throw new NotFoundException('Contrato no encontrado');
```

Ya resuelto — no lo "arregles" otra vez: `contracts` (`findOwned`/`getActiveOrOverdue`, `contracts.service.ts:753,763`,
usados por pago, liquidación, renovación y remate `:694`), `customers.service.ts:32`, `inventory.service.ts:72`,
`billing.service.ts:80`, `collections.service.ts:17,29,58`. **CV-016 quedó cerrado en contratos**, no en el resto:

| Violación abierta hoy (`findUnique`/`findMany` sin `tenantId`) | Qué permite |
|---|---|
| `cash/cash.service.ts:60` (`recordMovement`) | meter un movimiento de dinero en la caja de otro tenant |
| `cash/cash.service.ts:85` (`closeRegister`) | cerrar la caja de otro tenant |
| `cash/cash.service.ts:119` (`findOne`) | leer caja y movimientos ajenos; el endpoint `cash.controller.ts:30` además **no tiene `@Roles`** |
| `cash/cash.service.ts:112` (`findOpenForBranch`) | filtra por `branchId` pero no por tenant |
| `branches/transfers.service.ts:68,90` | cancelar/despachar/recibir traslados ajenos |
| `billing/billing.service.ts:39` (`issue`) | emitir a la DIAN una factura de otro tenant |
| `workshop/workshop.service.ts:80,88` | `findAll()` sin `where` lista órdenes de todos los tenants; `getOpenOrder` opera por id crudo |
| `collections/collections.service.ts:47` | historial de gestión de cobro de cualquier contrato |
| `contracts/contracts.service.ts:606` | latente: `cancelLayaway` cae a `findUnique` si `currentUser` es `undefined`; hoy el controller siempre lo pasa (`contracts.controller.ts:152`) — vuelve el parámetro obligatorio |

`inventory.service.ts:86` (`transitionStatus`) usa id crudo a propósito: es interno y el id viene de una entidad ya
validada. Si lo expones por HTTP, deja de serlo.

## 2. Roles y autorización

`@Roles(...)` (`security/roles.decorator.ts`) + `RolesGuard` (`security/roles.guard.ts:24`) hacen **una sola cosa**:
comparar el rol del JWT contra la lista del handler. **No validan** que el recurso `:id` pertenezca al tenant ni a la
sucursal (docs/12 §3.7) — eso es §1 y va en el service, siempre.

- Handler sin `@Roles` = abierto a **cualquier** rol autenticado (`RolesGuard` devuelve `true` si no hay metadata).
  Verificado: `GET /cash-registers/:id` (`cash.controller.ts:30`), `GET /customers` y `/customers/:id`
  (`customers.controller.ts:23,28`), `GET /contracts` y `/contracts/:id` (`contracts.controller.ts:28,33`),
  `GET /workshop` (`workshop.controller.ts:24`). Un `Technician` lista la cartera y las cédulas de todos los clientes.
- Rol elevado por regla de negocio, ya correcto y acorde a docs/03: cierre de caja `BranchManager|Admin`
  (`cash.controller.ts:43`), remate `Admin|BranchManager` (`contracts.controller.ts:114,121,131`), anulación de Plan
  Separe (`:145`), marcar cliente en alerta (`customers.controller.ts:34`).
- MFA obligatorio para `Admin`, `BranchManager`, `Accountant` (`auth.service.ts:11`), pero el login solo **avisa** con
  `mfaSetupRequired`; no bloquea. Si añades aprobaciones en línea, exígelo de verdad.

## 3. Auditoría como control de seguridad

`@Audited(entity, action, { capturePrevious: true })` + `AuditInterceptor` global. Con `capturePrevious` el interceptor
lee el estado previo **antes** del handler (`audit.interceptor.ts:42`) y guarda `oldValue`/`newValue`; sin él solo dice
"quedó así". `AuditService.loadSnapshot` (`audit.service.ts:40`) usa un `switch` explícito a propósito: nunca lo
conviertas en acceso dinámico `this.prisma[entity]`.

- **CV-017 hecho, con una limitación**: `concatMap` (`audit.interceptor.ts:56`) espera la escritura y devuelve 500 si
  falla, pero la operación de negocio ya se confirmó en su propia transacción — **un fallo de auditoría no la revierte**.
  La atomicidad real exige escribir el `AuditLog` dentro del `$transaction` de negocio (hoy solo `contracts.service.ts:168`).
- **Regla**: toda ruta de escritura sobre dinero, contratos o datos de cliente lleva `@Audited`, y la que modifica algo
  existente lleva `capturePrevious: true`. La cobertura de `@Audited` está completa; falta `capturePrevious` fuera de contratos.
- `AuditLog` (`schema.prisma:572`) no tiene `sourceIp` ni `device`, que docs/05 §3 sí exige. **[por verificar]** si la
  tabla es append-only en base de datos; en la aplicación nada lo impide.

## 4. Credenciales compartidas (D-05 / CV-005 — abierto)

El riesgo real de campo no es un exploit: **todo el mundo opera con el usuario de la dueña**, así que el `AuditLog`
atribuye a una persona lo que hicieron cinco; auditoría perfecta sobre credencial compartida no vale nada. Regla de
diseño: **usuario nominal por persona** y, para lo restringido (anulación, remate, cierre), **solicitud + aprobación en
línea** — el operador solicita desde su usuario, la dueña autoriza desde el suyo, y quedan ambos registrados. Nunca
diseñes una pantalla cuya única salida sea "que venga la dueña y teclee su clave": eso es lo que presta la clave.

## 5. Datos personales (habeas data, Ley 1581 de 2012)

Se almacena: `fullName`, `identificationNumber`, `phone`, `email`, `address` (`schema.prisma:101-121`), adjuntos
(`Document`, `:138`) y un **tercero que nunca firmó nada**: `Reference` (nombre + teléfono, `:126`). Obliga a finalidad
declarada, autorización del titular y derecho de consulta/rectificación/supresión.

- **No loguear** cédulas, teléfonos, correos ni direcciones. Verificado: hoy no hay ningún log de datos personales;
  `contracts.service.ts:125` registra un `customerId` (uuid interno) — correcto, mantenlo así.
- **Nada personal en URL ni query string** (queda en logs de proxy e historial): buscar por cédula va en `POST` con
  cuerpo, no en `GET ?cedula=`.
- **Minimizar la respuesta**: `customers.service.ts:31` devuelve `documents + contracts + references` completos y
  `findAll` lista todas las cédulas sin `@Roles`. Cada endpoint devuelve lo que su pantalla necesita.
- **Biometría**: este repo **no** captura huella (no hay campo en `Customer`); el legado sí, y nunca la validaba (D-09,
  docs/11:192). No lo repliques: capturar un dato biométrico sin finalidad ni validación es un pasivo legal, no un
  activo — o se valida contra el titular al liquidar, o no existe (CV-028). Igual el régimen fiscal: hoy no se guarda.

## 6. Validación de entrada y dinero

`ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` (`main.ts:9`): cualquier campo no
declarado hace fallar la request. Todo endpoint lleva DTO con `class-validator`; nunca leas `@Body()` sin tipar. **Los
importes no llegan del cliente** — regla de negocio y control de seguridad: si el monto lo teclea el operador, el
sistema cobra lo que le digan.

- Resuelto: `PayInterestDto` recibe `months`, no pesos (`dto/pay-interest.dto.ts:13`); `SettleContractDto.expectedTotal`
  es solo confirmación y se rechaza si no cuadra (`contracts.service.ts:522`).
- **Abierto (CV-018)**: `CloseRegisterDto.discrepancy` llega del cliente y se persiste tal cual
  (`cash/dto/close-register.dto.ts:5` → `cash.service.ts:93`). El descuadre lo calcula el servidor: saldo esperado
  desde los movimientos contra el conteo físico.

## 7. Secretos y configuración

Variables (nombres, en `apps/backend/.env.example`): `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_TOKEN_TTL`,
`JWT_REFRESH_TOKEN_TTL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`,
`PORT`, `CORS_ORIGIN`. `.env` está en `.gitignore:4` y **no está versionado** (verificado); `.env.example` solo lleva
placeholders — variable nueva se añade ahí sin valor real.

- **Riesgo verificado**: el `JWT_SECRET` de `apps/backend/.env` es **byte a byte el mismo del `.env.example`** y es un
  placeholder; además el código cae a un literal por defecto si falta la variable (`jwt.strategy.ts:20`,
  `security.module.ts:12`) en vez de abortar. Con ese secreto cualquiera firma un token con `role: Admin` y el
  `tenantId` que quiera. Secreto real por entorno, y que el arranque falle si no está.
- El JWT no se revalida contra la base (`jwt.strategy.ts:24` confía en el payload): desactivar un usuario no invalida su
  token hasta que expira (`15m`). El token vive en `localStorage` (`apps/frontend/src/lib/api-client.ts:4`), legible por
  cualquier script de la página: aceptable con TTL corto y sin XSS, pero nunca guardes ahí datos de cliente.
- CORS (`main.ts:15-22`): lista blanca desde `CORS_ORIGIN`, default `http://localhost:5173`, sin comodín — correcto; no
  pongas `*` con `credentials: true`. Ojo con el túnel ngrok (`api-client.ts:21`): exponer el backend a internet con el
  `JWT_SECRET` de ejemplo es la peor combinación de esta lista.

## 8. Respaldo e integridad (D-07 / CV-001 — abierto)

Los ~92.751 contratos históricos viven en un solo computador de la tienda, **sin respaldo verificado** (docs/12:168). Es
control de seguridad, no tarea de infraestructura: es el único riesgo del proyecto cuyo costo es irrecuperable. Un
respaldo sin restauración probada no es un respaldo — CV-001 exige restaurar la copia y **contar los registros**. Ningún
script destructivo ni migración sobre el histórico corre antes de eso.

## Checklist para cualquier endpoint nuevo

- [ ] ¿Controller con `@UseGuards(JwtAuthGuard, RolesGuard)` y handler con `@Roles(...)` acorde a docs/03 (también los `@Get`)?
- [ ] ¿Toda consulta por id filtra por `tenantId` (patrón `findOwned`), sin ningún `findUnique({ where: { id } })` nuevo?
- [ ] ¿Los listados filtran por `tenantId` y, cuando aplica, por `branchId`?
- [ ] ¿La escritura lleva `@Audited(...)` y, si modifica algo existente, `capturePrevious: true`?
- [ ] ¿El importe lo calcula el servidor y el cliente solo confirma (`expectedTotal`) o elige unidades (`months`)?
- [ ] ¿El DTO declara todos los campos con `class-validator`?
- [ ] ¿La respuesta trae solo lo que la pantalla necesita, sin arrastrar cédulas, documentos ni contratos completos?
- [ ] ¿Ningún dato personal viaja en la URL ni aparece en logs?
- [ ] ¿La operación restringida se resuelve con aprobación de otro usuario y no prestando la clave de la dueña?
- [ ] ¿Ninguna variable nueva quedó con valor real en `.env.example` ni con default en el código?

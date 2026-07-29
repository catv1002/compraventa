---
name: reglas-negocio-empeno
description: Invariantes de dominio del empeño (interés 4% mensual, no abonar a capital con intereses en mora, remate discrecional por antigüedad, transiciones de ContractStatus, saldo de caja continuo, cierre diario obligatorio, consecutivos). Úsala antes de escribir o dar por terminado cualquier cambio en apps/backend/src/modules/contracts, /cash, /collections, /accounting o en las páginas de contratos, pagos, liquidación, remate y caja del frontend.
---

# Reglas de negocio del empeño (compraventa con pacto de retroventa)

Fuente: [docs/11-levantamiento-campo-carrera113.md](../../../docs/11-levantamiento-campo-carrera113.md) (RN-01..RN-28, observadas en un negocio real),
[docs/02-ciclos-de-vida.md](../../../docs/02-ciclos-de-vida.md) (máquinas de estado) y
[docs/03-dominios-ddd.md](../../../docs/03-dominios-ddd.md) §5 Contracts y §6 Cash.
Código donde viven hoy: `apps/backend/src/modules/contracts/contracts.service.ts` y `apps/backend/src/modules/cash/cash.service.ts`.

## 1. Cartera e intereses

- **RN-01 — 4% mensual fijo.** Tasa uniforme para todo contrato y monto. Nunca hardcodear: la tasa
  llega en `CreateContractDto.interestRate` y el techo se valida contra
  `TenantConfiguration.maxLegalRate` (default `0.1950`) en `contracts.service.ts:50`. Toda tasa nueva
  debe pasar por esa validación o por una equivalente.
- **RN-02 — plazo base 6 meses** de pago de intereses (`Contract.dueDate`).
- **RN-03 — no se abona a capital con intereses en mora.** Es la invariante más importante y hoy
  **no está implementada**: `payInstallment()` solo cubre Layaway. Cualquier endpoint de abono a
  capital sobre `ContractType.Pawn` debe rechazar (`BadRequestException`) si hay meses de interés
  pendientes. En la UI el botón de abono se deshabilita, no se oculta.
- **RN-04 — pago parcial de intereses permitido**: el cliente puede pagar 1 de 2 meses adeudados.
  Un pago parcial no habilita el abono a capital (RN-03) y no debe marcar el contrato como al día.
- **RN-13 / RN-16 — se cobra todo mes EMPEZADO, no todo mes cumplido.** Verificado contra el legado:
  1 mes y 25 días de mora sobre $200.000 cobra `200.000 × 4% × 2 = 16.000`; 1 mes y 30 días sobre
  $1.150.000 cobra `92.000`. Ojo: `wholeMonthsBetween()` en `interest-calculator.ts` cuenta meses
  **cumplidos** —el sentido contrario— y sobre esos dos casos cotiza la mitad. Ver CV-029 en docs/12.
- **RN-16 — la mora se cuenta desde la última fecha pagada, no desde `dueDate`.** Son ejes distintos:
  un contrato dentro de su plazo de 6 meses puede deber 2 meses de intereses. El campo es
  `Contract.interestPaidThrough` (el legado lo llama `Fecha Act`) y ya está bien usado por
  `quoteInterest()`. Nunca derives la mora de `dueDate`.
- **RN-17 — pagar N meses corre la fecha de corte N meses hacia adelante**, aunque quede en el
  futuro respecto de hoy. Pagar no cambia `dueDate` ni el estado (eso es renovación, otra operación).

## 2. Estados del contrato

Enum real en `apps/backend/prisma/schema.prisma` (`ContractStatus`): `Created, Active, Renewed,
Overdue, Expired, Settled, Forfeited, Cancelled`. Transiciones válidas:

- `Created → Active` solo vía `disburseContract()` y solo para `ContractType.Pawn`; mueve el
  artículo a `ItemStatus.InPledgeCustody` y emite `DisbursementIssuedEvent`.
- `Created → Cancelled` vía `withdraw()` ("Contrato Retirado"): sin movimiento de caja, el artículo
  se queda en `Appraised`. Nunca confundir con `Settled` ni con `Forfeited`.
- `Active|Renewed|Overdue → Renewed` (`renew()`), `→ Settled` (`settle()`). El guard compartido es
  `getActiveOrOverdue()` — reutilízalo en toda operación nueva sobre cartera viva.
- `Active|Renewed → Overdue → Forfeited` en `processOverdueContracts()`, usando
  `TenantConfiguration.gracePeriodDays` (default 30).
- Prohibido: operar un contrato en `Settled`, `Forfeited` o `Cancelled`. Prohibido saltarse
  `Created` desembolsando dentro de `create()` para Pawn.

Cada transición emite su evento de `apps/backend/src/shared/domain-events/events.ts` y toda ruta de
escritura lleva `@Audited('Contract', '<Evento>')`. Una transición sin evento y sin auditoría es un bug.

## 3. Remate (RN-05, RN-11)

- El remate **no es automático al vencimiento**. Vencer (`Overdue`) y rematar (`Forfeited`) son
  decisiones distintas: la segunda es discrecional de la dueña, en la práctica a partir de ~8 meses
  de antigüedad, con **selección manual contrato por contrato**.
- El umbral de antigüedad es **parámetro configurable** (`TenantConfiguration`), nunca el plazo del
  contrato ni una constante. `processOverdueContracts()` hoy remata por `gracePeriodDays`: si tocas
  esa función, respeta que el paso a `Forfeited` sea revisable/confirmable, no un barrido ciego.
- Un contrato rematado queda bloqueado para el mostrador y se muestra en rojo al consultarlo.
- Antes del remate hay que poder avisar al cliente: art. 1943 C.C. exige aviso previo de 15 días
  (ver skill `contexto-negocio-colombia` y dolor D-03).

## 4. Caja (RN-09, RN-10)

- **El saldo continúa entre días**: al cerrar no se retira el efectivo; el saldo final es el saldo
  inicial del día siguiente. No modeles el cierre como "vaciar la caja".
- **Cierre obligatorio por día, incluso en días no laborados** (domingo): sin cierre del día previo
  no se puede abrir la fecha siguiente.
- Una sola caja abierta por sucursal (`openRegister()` lanza si ya existe una `Open`).
- **Una diferencia de arqueo `Pending` bloquea la apertura siguiente** (`cash.service.ts:36`). No
  relajes esta regla: es regla de negocio, no una excepción técnica.
- **No hay movimientos de caja sueltos**: todo `CashMovement` lleva `sourceType` (+ `contractId`
  cuando aplica). Los ingresos/egresos manuales de la dueña ("base", "retiro") usan concepto libre
  pero igualmente un `sourceType` explícito.
- Todo movimiento de dinero de contratos pasa por `CashService.recordMovement()`, nunca por
  `prisma.cashMovement.create()` directo desde otro módulo.

## 5. Consecutivos y correcciones (RN-07, RN-08, RN-14, D-01)

- Tipo de contrato único en el negocio real: "001" compraventa. El sistema soporta más
  (`ContractType`), pero la UI de empeño no debe pedir elegir.
- El consecutivo lo genera el sistema y se transcribe a un libro físico paralelo. Un contrato
  anulado **marca** su consecutivo como anulado; no lo libera para reutilizar.
- Corregir un contrato hoy obliga a anularlo entero (D-01). El requisito derivado es **edición
  controlada con motivo obligatorio y auditoría**, no edición libre ni silenciosa.

## 6. Qué NO asumir (puntos "por confirmar" de docs/11 §6)

No inventes comportamiento en estos puntos; deja el parámetro explícito, documenta la duda y
pregunta:

1. ~~¿mes completo o prorrateo?~~ **Cerrado** por las capturas del legado: mes completo, redondeo
   hacia arriba (RN-16). Siguen abiertos: el **redondeo de importes** (no se observó ni un caso con
   centavos) y si el 4% **sigue corriendo entre el mes 6 y el remate**.
2. Semántica del filtro de remate "60 a 1000" (¿días o meses?).
3. Anulación del consecutivo: ¿se marca o se libera?
4. Origen del libro físico (exigencia legal, política interna o desconfianza).
5. Formato de importación de Samir (facturación electrónica) — bloqueante de D-02.
6. ~~Volumen histórico~~ **parcialmente cerrado**: una jornada real (15/07/2026) fueron 6 contratos
   nuevos por $5.650.000, ~7 actualizaciones, 2 liquidaciones y 1 abono, con la caja entre $8,3 y
   $11,4 millones. El último consecutivo sigue siendo 92.751.
7. `Dto Sob.Cto` — el legado tiene un campo de **descuento de sobrecosto** que nunca se vio usado.
   No lo implementes por tu cuenta ni asumas que no existe.
8. Un contrato puede traer **varias joyas aplastadas en una sola descripción** (`LOTE DE JOYAS`,
   peso y costo agregados). No asumas que descripción ↔ una pieza al migrar o al valorar.

## Checklist antes de cerrar un cambio en contratos/pagos/caja

- [ ] ¿La transición de estado está en la lista válida de §2 y usa `getActiveOrOverdue()` o un guard equivalente?
- [ ] ¿Emite el domain event correspondiente con `eventEmitter.emitAsync(DomainEventNames.X, new XEvent(...))`?
- [ ] ¿El endpoint lleva `@Audited(entity, action)` y `@Roles(...)` acordes a docs/03?
- [ ] ¿El dinero se mueve por `CashService.recordMovement()` con `sourceType` y `contractId`?
- [ ] ¿La tasa se valida contra `maxLegalRate` y el plazo/umbral vienen de `TenantConfiguration`?
- [ ] ¿Se respeta RN-03 (bloqueo de abono a capital con mora) y RN-04 (pago parcial permitido)?
- [ ] ¿La mora se calcula contra la **fecha de corte de intereses** y no contra `dueDate` (RN-16), y el pago la avanza (RN-17)?
- [ ] ¿Nada asume remate automático al vencimiento ni vaciado de caja al cierre?
- [ ] ¿Los importes usan `Decimal(14,2)` en Prisma y se convierten con `Number()` solo en el borde?
- [ ] ¿La UI habla el idioma del operador ("préstamo", "intereses", "abono a capital", "liquidar") y reserva la terminología legal para el documento impreso?

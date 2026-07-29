---
name: contabilidad-y-caja
description: Cómo se registra el dinero — convención de signos del extracto de caja (débito = entrada, crédito = salida), asiento con documento/detalle/saldo corrido/hora, liquidación en dos asientos (capital + retroventa), terminología legal en el libro, saldo continuo entre días y cierre diario obligatorio, conciliación arqueo↔libro y partida doble en accounting. Úsala al tocar apps/backend/src/modules/cash/, apps/backend/src/modules/accounting/, los modelos CashRegister/CashMovement/CashCount/JournalEntry de prisma/schema.prisma, cualquier llamada a CashService.recordMovement() desde contracts, o las pantallas de caja, arqueo, informe diario y extracto.
---

# Contabilidad y caja

Fuente observada: [docs/fuentes/2026-07-capturas-plus-cv-carrera113.md](../../../docs/fuentes/2026-07-capturas-plus-cv-carrera113.md) C-06 (Informe de caja) y C-07 (Extracto de caja);
reglas RN-09, RN-10, RN-24, RN-25, RN-26 y §3.2/§3.7 de [docs/11-levantamiento-campo-carrera113.md](../../../docs/11-levantamiento-campo-carrera113.md);
brecha en [docs/12-gap-analysis-y-backlog.md](../../../docs/12-gap-analysis-y-backlog.md) §3.11e (CV-018, CV-019, CV-032).
Código: `apps/backend/src/modules/cash/cash.service.ts`, `apps/backend/src/modules/accounting/` y la sección `// ---------- Cash ----------` de `apps/backend/prisma/schema.prisma:347`.

## 1. Convención de signos (RN-24) — verificada contra el legado

En el extracto de caja del legado: **DÉBITO = entrada de efectivo**, **CRÉDITO = salida**.

- Débito: liquidaciones (`CAPITAL LIQUIDACION`), pagos de actualización (`RECOMPRA PAGADO POR…`), abonos a capital, retroventa cobrada.
- Crédito: el dinero desembolsado al abrir un contrato (`CONTRATO # 92748` → 250.000 al crédito).

No es interpretación: las **16 filas de C-07 encadenan sin un solo descuadre** con débito sumando y
crédito restando, de 11:50 a 17:33, cerrando en 10.471.260. Si un informe invierte los signos, está mal.
La convención **ya coincide** con la partida doble de `accounting`: la cuenta `1000` (Caja) se debita
al cobrar (`accounting-events.listener.ts:50`, `:61`) y se acredita al desembolsar (`:40`).

En el dominio el signo lo lleva `CashMovementType` (`CashIn`/`CashOut`, `schema.prisma:372`), no el
importe: `RecordMovementDto.amount` es `@Min(0.01)` y siempre positivo.

## 2. Qué lleva cada asiento del libro

El extracto tiene **documento · fecha · detalle · débito · crédito · saldo corrido · fecha de proceso
(con hora)**. El **saldo corrido** no es adorno: es lo que permite recorrer el día hacia atrás y
encontrar en qué fila se descuadró el arqueo (§3.2 doc 11: "se revisa contrato por contrato").

Estado actual de `CashMovement` (`schema.prisma:377`): `type`, `amount`, `sourceType`, `sourceId`,
`contractId`, `createdAt`. **Le faltan el número de documento visible, el texto de detalle y el saldo
corrido** — por eso existe CV-032. El saldo corrido puede calcularse al leer (acumulado sobre
`createdAt`, que ya da la hora de proceso); el **detalle** hay que persistirlo, no se reconstruye después.

## 3. Una liquidación son DOS asientos (RN-26)

Caso real, C-07, contrato **92627 el 15/07 a las 16:11**: dos filas del mismo minuto,
`RETROVENTA … 72.000` y `CAPITAL LIQUIDACION … 1.800.000`. Capital y retroventa/sobrecosto **nunca
van fundidos en un solo importe**: el informe diario los separa (C-06: `Contratos Liquidados
6.100.000` con `SobreCostos 598.000` aparte) y el P&L necesita el ingreso financiero aislado (docs/01 §4).

Hoy `settle()` (`apps/backend/src/modules/contracts/contracts.service.ts:539`) registra **un solo**
`recordMovement` por `total` (capital + intereses): es el gap concreto de CV-032. El asiento contable
**sí** separa (`accounting-events.listener.ts:60-64`, `1100` capital y `4100` sobrecosto); el que no
separa es el libro de caja.

## 4. La terminología del asiento es LEGAL, no la del mostrador (RN-25)

Textos literales del legado: `CAPITAL LIQUIDACION DEL CONTRATO # 92627`,
`RETROVENTA PAGADO POR LIQUIDACION DEL CONTRATO # …` *(lectura dudosa del "O" intermedio)*,
`RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # …`, `ABONO A CAPITAL DEL CONTRATO # 92659`,
`CONTRATO # 92751`.

La UI de mostrador dice "intereses", "abono", "liquidar" (idioma del operador, docs/11 §5). **El libro
y el documento impreso dicen "recompra", "retroventa", "sobrecosto".** Importa porque bajo sustancia
sobre forma un juez puede recalificar el contrato como mutuo con prenda si el propio sistema lo
documenta como préstamo con intereses — ver skill `contexto-negocio-colombia` §1-§3. El legado ya hace
esta separación; el producto nuevo no tiene todavía ninguna capa que la produzca.

## 5. Saldo continuo y cierre por día (RN-09, RN-10)

- Al cerrar **no se retira el efectivo**: el saldo final es el saldo inicial del día siguiente.
- El cierre es **obligatorio todos los días, incluido el domingo no laborado** (se ejecuta el lunes);
  sin cierre del día previo no se abre la fecha siguiente. El legado avanza su `FECHA DE CAJA` al cerrar.
- Hoy `openRegister()` toma `baseAmount` del cliente (`cash.service.ts:42-49`, `OpenRegisterDto`) en
  vez de heredar el saldo del cierre anterior: es exactamente CV-018. No añadas lógica nueva encima
  del comportamiento actual sin arreglar la herencia del saldo.
- Se conserva: una sola caja `Open` por sucursal (`cash.service.ts:24-29`) y **una diferencia de
  arqueo `Pending` bloquea la apertura siguiente** (`cash.service.ts:36`).

## 6. Ingresos y egresos manuales de la dueña

"Base" adicional cuando se agota el presupuesto (p. ej. $5.000.000), "retiro" por exceso de efectivo,
"préstamo a doña Leonor" (§3.2 doc 11). **Concepto libre, pero `sourceType` explícito** — hoy
`sourceType` es un `String` suelto (`schema.prisma:384`) y contracts siempre manda `'Contract'`
(`contracts.service.ts:224, 241, 401, 455, 542, 577`). Un movimiento manual necesita su propio valor,
no `'Contract'` ni vacío. **Puerta única**: todo dinero pasa por `CashService.recordMovement()`, nunca
`prisma.cashMovement.create()` desde otro módulo (la única llamada legítima está en `cash.service.ts:65`).

## 7. Conciliación: arqueo, informe y trazabilidad

- El informe del día (CV-019) muestra intereses cobrados, abonos, liquidados, ingresos/egresos
  manuales y el **saldo esperado**; cada cifra debe ser trazable hasta el contrato de origen —
  `CashMovement.contractId` es el único enlace que existe hoy.
- El legado cuadra en los dos sentidos: en C-06 la pestaña "Contratos realizados" suma exactamente
  `5.650.000`, el egreso del resumen. Un informe cuyo detalle no sume el resumen es un bug.
- `closeRegister()` (`cash.service.ts:84-109`) **recibe `discrepancy` del cliente** y solo la guarda;
  `CashCount` (`schema.prisma:392`) ni siquiera tiene el conteo físico. CV-018 exige que el servidor
  calcule el saldo esperado desde los movimientos y derive la diferencia. No confíes en el front.
- `AccountingService.postEntry()` (`accounting.service.ts:17`) rechaza asientos desbalanceados con
  tolerancia `0.01` y resuelve cuentas por `code` contra `CHART_OF_ACCOUNTS` (`chart-of-accounts.ts:6`).
  Ojo: `onInterestPaymentRecorded` y `onContractSettled` (`accounting-events.listener.ts:44-65`) **no
  pasan `branchId`**, así que el centro de costo por sucursal se pierde ahí **[por verificar si es intencional]**.

## 8. Qué NO asumir todavía

1. **`Enviar Informe`** (botón de C-06, junto a `Abrir Caja`): la sesión no lo explicó. Sugiere envío
   por correo del informe diario, pero es especulación — no lo repliques inventando el destino.
2. **`Dto Sob.Cto`** (columna de la grilla en C-02/C-09, siempre en `0.00`): descuento de sobrecosto.
   Nunca se vio usado. No lo implementes por tu cuenta ni asumas que no existe.
3. **Formato de importación de Samir** (facturación electrónica, D-02): sin confirmar. Hoy el informe
   de intereses del día se imprime y se re-digita a mano.
4. El extracto de C-07 **está incompleto** (hay barra de desplazamiento; faltan al menos 92746 y
   92747): no lo uses como censo del día.
5. `CashRegisterStatus.InCashCount` y `.Reconciled` (`schema.prisma:349`) **no los usa ningún código
   hoy**: el flujo real de arqueo aún no está modelado **[por verificar contra el negocio]**.
6. La renovación/"actualización" —lo más frecuente del día observado, ~7 veces— **no registra
   movimiento de caja**: `renew()` (`contracts.service.ts:472-500`) crea el `ContractMovement` con
   `amount: 0` y no llama a `recordMovement`, mientras el legado sí asienta
   `RECOMPRA PAGADO POR ACTUALIZACION`. Falta cerrar cómo se cobra el sobrecosto al renovar.

## Checklist antes de cerrar un cambio en caja/contabilidad

- [ ] ¿Débito = entrada y crédito = salida, en libro, informe y asiento? (RN-24)
- [ ] ¿El movimiento pasa por `CashService.recordMovement()` con `sourceType` explícito y `contractId` cuando aplica?
- [ ] ¿La liquidación genera **dos** movimientos, capital y retroventa por separado? (RN-26)
- [ ] ¿El detalle del asiento usa terminología legal (`RECOMPRA`, `RETROVENTA`, `CAPITAL LIQUIDACION`) y no la del mostrador? (RN-25)
- [ ] ¿El asiento conserva documento, detalle, débito, crédito, saldo corrido y hora? (RN-24, CV-032)
- [ ] ¿La apertura hereda el saldo del cierre anterior en vez de pedirlo, y el cierre calcula la diferencia en el servidor? (RN-09, CV-018)
- [ ] ¿Se exige cierre de todos los días, incluido el no laborado, antes de abrir el siguiente? (RN-10)
- [ ] ¿Cada cifra del informe diario es trazable hasta el contrato de origen y el detalle suma el resumen? (CV-019)
- [ ] ¿El asiento contable cuadra (`postEntry` lanza si no) y lleva `branchId` en sus líneas?
- [ ] ¿Los importes son `Decimal(14,2)` en Prisma, con `Number()` solo en el borde?
- [ ] ¿Nada quedó asumido sobre `Enviar Informe`, `Dto Sob.Cto` o el formato de Samir?

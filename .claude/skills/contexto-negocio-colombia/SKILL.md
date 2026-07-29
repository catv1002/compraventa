---
name: contexto-negocio-colombia
description: Marco legal y contable colombiano que condiciona el diseño (compraventa con pacto de retroventa arts. 1939-1943 C.C. vs. mutuo con prenda, sustancia sobre forma NIIF, tasa de usura, aviso previo de 15 días, SARLAFT/UIAF, facturación electrónica DIAN Res. 000165/2023). Úsala al escribir código, textos de UI, contratos impresos o asientos contables que toquen terminología legal, cálculo de sobrecosto o intereses, plazos de vencimiento y remate, o facturación.
---

# Contexto legal y contable colombiano

Destilado de [docs/01-investigacion-negocio.md](../../../docs/01-investigacion-negocio.md).
**No es asesoría legal.** Es guía de diseño para saber qué debe ser parametrizable. Toda
implementación real debe validarse con un abogado antes de producción (ver la advertencia en
[docs/README.md](../../../docs/README.md)).

## 1. La figura real: compraventa con pacto de retroventa

No existe en Colombia una ley integral única de "casas de empeño". El contrato que se firma en la
práctica **no es mutuo con prenda** sino **compraventa con pacto de retroventa**, arts. **1939 a
1943 del Código Civil**.

| | Mutuo + prenda | Compraventa con pacto de retroventa (lo real) |
|---|---|---|
| Base legal | C.C. art. 2409+ | **C.C. arts. 1939-1943** |
| Propiedad del bien | Sigue del cliente | **Pasa al negocio desde la firma** |
| Qué recibe el cliente | Un préstamo | El **Valor de Compra** |
| Qué paga para recuperarlo | Capital + interés | El **Valor de Retroventa** |
| Aviso previo | No reglado uniformemente | Mínimo **15 días** antes del vencimiento (art. 1943) |

Existe debate documentado sobre si estos contratos de adhesión *simulan* un mutuo con prenda; por eso
un juez puede recalificarlos y aplicarles las reglas del préstamo.

## 2. Terminología: dos registros, no uno

- **Documento impreso, contrato, recibo y comunicación formal**: "Valor de Compra", "Valor de
  Retroventa", "Sobrecosto". Nunca "préstamo" ni "interés" en el instrumento legal.
- **UI del operador y del negocio**: "préstamo", "intereses", "abono a capital", "liquidar" — es el
  idioma real de las empleadas (divergencia registrada en docs/11 §5). La UI habla como el operador;
  el papel habla como el abogado.
- **Código**: nombres en inglés y neutros (`Contract`, `principalAmount`, `interestRate`,
  `ContractMovementType.InterestPayment`), como ya está en `apps/backend/prisma/schema.prisma`.

## 3. Sustancia sobre forma (NIIF)

Aunque legalmente sea una venta, un *sale and repurchase agreement* a precio fijo se contabiliza
como **operación de financiación**: el vendedor retiene el control económico del bien. Consecuencias
que el código ya refleja en `apps/backend/src/modules/accounting/accounting-events.listener.ts`:

- El desembolso de un `Pawn` va a **cuenta por cobrar** (cuenta `1100`), no a inventario (`1200`,
  reservada a `DirectPurchase`).
- El bien en custodia se controla en **cuenta de orden**, fuera de balance, hasta resolver el contrato.
- El sobrecosto es **ingreso financiero**, no ingreso por venta, y se reconoce en dos momentos:
  *sobrecosto por actualización* (renovación sin abonar capital) y *sobrecosto por entrega*
  (liquidación).
- Solo al rematar (`Forfeited`) el bien entra a inventario, al menor entre saldo insoluto y avalúo.

Otras figuras (tabla completa en docs/01 §2): compra directa → inventario desde el inicio;
consignación → ninguna cuenta, solo control; plan separe → **anticipo de clientes (pasivo)** hasta la
entrega, nunca ingreso.

## 4. Tope de usura

La diferencia entre valor de compra y valor de retroventa **no puede superar la tasa de usura**
(interés bancario corriente certificado por la Superintendencia Financiera × 1.5, Ley 45/1990;
excederla es delito, C.P. art. 305), precisamente por sustancia sobre forma.

En el código: `TenantConfiguration.maxLegalRate` (`Decimal(6,4)`, default `0.1950`), validado en
`apps/backend/src/modules/contracts/contracts.service.ts` al crear el contrato. **Nunca hardcodear el
tope** — cambia periódicamente y depende de la certificación vigente. La tasa del negocio observado
es 4% mensual (RN-01), muy por encima del interés bancario mensual: cualquier cálculo debe poder
compararse contra el tope configurado, no ignorarlo.

## 5. Plazos, aviso previo y remate

- Plazo pactado + **aviso previo mínimo de 15 días** (art. 1943) antes de que el bien se pierda.
  `TenantConfiguration.gracePeriodDays` (default 30) parametriza el periodo de gracia: es un mínimo
  legal a respetar, no un valor libre a la baja.
- Sin aviso no debería procesarse un remate: hoy no hay notificaciones y es el dolor D-03 de docs/11,
  con reclamos reales de clientes.
- Ley 1480/2011 (Estatuto del Consumidor, vigilada por la SIC): al cliente hay que informarle
  condiciones, valor de retroventa, plazos y consecuencias del no pago — texto obligatorio en el
  contrato impreso y en pantalla.

## 6. SARLAFT / UIAF

Varios sectores no financieros son sujetos obligados a reportar operaciones sospechosas o inusuales
a la **UIAF** vía SIREL (p. ej. Resolución 101/2013 para compraventas de vehículos). Aunque no toda
compraventa esté listada, el riesgo de recibir bienes de procedencia ilícita hace obligatoria la
debida diligencia desde el diseño: identificación del cliente, verificación de procedencia del bien,
registro fotográfico, y **umbrales de monto configurables** que disparan revisión o reporte. La
compra directa es la figura de mayor exposición. `Customer.flagged` en el schema es el marcador de
lista de alerta. Segregación de funciones: quien avalúa no debería ser el único que autoriza
desembolsos altos.

## 7. Facturación electrónica DIAN

Resolución **000165 de 2023** (modificada por 000202 de 2025), obligatoria para todo responsable de
IVA. Matices de diseño:

- Las **ventas** se facturan electrónicamente. Los contratos de retroventa en sí **no** son hecho
  generador de IVA mientras el bien pueda recomprarse.
- La compra a una persona natural no obligada a facturar genera **documento equivalente / soporte de
  compra**.
- En el negocio real la facturación vive hoy en un sistema externo ("Samir") con re-digitación
  manual diaria (dolor D-02); el formato de importación sigue sin confirmarse.

## Reglas de aplicación

1. Nada de lo anterior se hardcodea: tope de tasa, días de gracia/aviso y umbrales SARLAFT van a
   `TenantConfiguration` (docs/01 §1.2 lo exige explícitamente: el marco es fragmentado y cambia).
2. Al escribir texto de UI, decide primero el registro (§2) — operador u instrumento legal.
3. Al tocar asientos contables, sigue §3: financiación, no venta.
4. Al redactar cualquier texto legal en el producto, incluye que esto no sustituye asesoría jurídica
   y marca el punto como pendiente de validación con abogado.

# 01 — Investigación del negocio: cómo funciona una compraventa/casa de empeño moderna en Colombia

## 1. Marco legal (orientativo, no asesoría legal)

Punto de partida importante: **no existe en Colombia una ley integral única que regule "casas de empeño" o "compraventas"** como categoría propia (el proyecto Ley 221 de 2004 nunca se consolidó en un estatuto específico). El negocio se sostiene sobre varias piezas normativas independientes.

### 1.1 La figura legal real: compraventa con pacto de retroventa (no prenda)

**Corrección importante sobre una versión anterior de este documento**: verificado contra un contrato real de una compraventa operando en Florencia (Caquetá) y confirmado por fuentes de la industria — en la práctica **las compraventas colombianas no usan mutuo con prenda**. Usan el **Contrato de Compraventa con Pacto de Retroventa**, regulado en los **artículos 1939 a 1943 del Código Civil**:

> *"Art. 1939. Por el pacto de retroventa el vendedor se reserva la facultad de recobrar la cosa vendida, reembolsando al comprador la cantidad determinada que se estipulare, o en defecto de esta estipulación lo que le haya costado la compra."*

Diferencias concretas frente a lo que describía este documento antes:

| | Mutuo + prenda (versión anterior, incorrecta como base primaria) | Compraventa con pacto de retroventa (lo que se usa realmente) |
|---|---|---|
| Base legal | Código Civil art. 2409+ (prenda), accesorio a un mutuo | Código Civil **arts. 1939-1943** |
| Propiedad del bien | Sigue siendo del cliente | **Pasa al negocio** desde la firma del contrato |
| Qué recibe el cliente | Un préstamo garantizado | El **precio de compra** del artículo |
| Qué paga para recuperarlo | Capital + interés | El **valor de retroventa** pactado (precio de recompra) |
| Aviso previo al vencimiento | Plazo de gracia (no reglado uniformemente) | Mínimo **15 días** antes del vencimiento para bienes muebles (art. 1943) |

**El matiz que si sostiene el diseño ya construido**: existe un debate legal documentado (ver el estudio de [Ciencia Latina](https://ciencialatina.org/index.php/cienciala/article/view/4816) sobre tipicidad contractual en casas de empeño) sobre si estos contratos de adhesión en realidad *simulan* un mutuo con prenda disfrazado de compraventa — económicamente cumplen la misma función (dinero ahora, bien como garantía, se paga más para recuperarlo). Esto importa para el diseño en dos frentes:

1. **Legal/UI**: los contratos, recibos y comunicación con el cliente deben usar el lenguaje real — "Valor de Compra", "Valor de Retroventa", "Sobrecosto" — no "préstamo" ni "interés", para que el sistema refleje el contrato que el cliente realmente firma.
2. **Contable**: bajo NIIF, la **sustancia económica prima sobre la forma legal** — un "sale and repurchase agreement" a precio fijo se contabiliza como una operación de financiación (igual que un préstamo garantizado), no como una venta real, precisamente porque el vendedor retiene el control económico del bien (puede recuperarlo pagando un precio ya fijado). **Esto significa que el tratamiento contable que ya se diseñó** (cuenta "Cartera de préstamos"/Loans Receivable, reconocimiento de "sobrecosto" como ingreso financiero, no como ingreso por venta) **sigue siendo el correcto**, aunque el contrato legal sea, en su forma, una compraventa.

En consecuencia: el **modelo de datos y los asientos automáticos no cambian** — lo que corrige este documento es la narrativa legal y la terminología de cara al usuario.

### 1.2 Otras piezas normativas

- **Remate del bien** (equivalente operativo bajo pacto de retroventa): si el cliente no ejerce la retroventa dentro del plazo pactado (más el aviso previo de 15 días del art. 1943), la propiedad definitiva queda en el negocio y el bien pasa a inventario disponible para venta.
- **Topes de la tasa/sobreprecio de retroventa**: aunque formalmente es un "precio de recompra" y no una "tasa de interés" en sentido bancario, la diferencia entre valor de compra y valor de retroventa no puede superar la tasa de usura (interés bancario corriente certificado por la Superintendencia Financiera × 1.5, Ley 45/1990; cobrar por encima es delito de usura, Código Penal art. 305) — precisamente por el principio de sustancia sobre forma: un juez puede recalificar el contrato y aplicar el límite igual que a un préstamo.
- **Protección al consumidor**: Ley 1480 de 2011 (Estatuto del Consumidor), vigilada por la SIC — aplica a la información que debe entregarse al cliente (condiciones del contrato, valor de retroventa, plazos, consecuencias del no pago).
- **Prevención de lavado de activos (SARLAFT/UIAF)**: varios sectores no financieros son "sujetos obligados" a reportar operaciones sospechosas/inusuales a la UIAF vía el sistema SIREL (p. ej. la Resolución 101/2013 UIAF obliga explícitamente a compraventas de vehículos). Aunque no toda actividad de compraventa está expresamente listada, la práctica de la industria (y el riesgo de recibir bienes robados) hace indispensable un módulo de **debida diligencia del cliente y del bien** (identificación, procedencia, umbrales que disparan reporte) desde el diseño, no como añadido posterior.
- **Facturación electrónica**: Resolución DIAN 000165 de 2023 (modificada por 000202 de 2025) — obligatoria para todo responsable de IVA. Las ventas del negocio (no los contratos de compraventa con pacto de retroventa en sí, que no son un hecho generador de IVA mientras el bien pueda recomprarse) deben facturarse electrónicamente.

**Implicación de diseño**: el módulo de Configuración debe permitir parametrizar el tope legal del sobreprecio de retroventa, plazos de aviso previo y umbrales de reporte SARLAFT por jurisdicción, porque este marco es fragmentado y cambia con el tiempo — no se puede hardcodear.

## 2. Las cinco figuras de negocio y cómo cambia el ciclo de vida del artículo

### 2.1 Compra directa
El negocio compra el bien al cliente: hay transferencia de propiedad inmediata a cambio de un pago único. El artículo entra a **inventario propio** desde el minuto uno.
- **Contable**: se reconoce como **inventario de mercancías** (activo) contra salida de caja/banco. Costo de adquisición = base para el costo de venta futuro.
- **Fiscal**: la compra a una persona natural no obligada a facturar genera normalmente un **documento equivalente/soporte de compra**; la venta posterior sí genera factura electrónica con IVA si aplica.
- **Riesgo**: es la figura con más exposición a bienes de procedencia ilícita — requiere el mayor nivel de verificación de identidad y origen.

### 2.2 Empeño / Compraventa con pacto de retroventa

Legalmente es una **venta**: el negocio compra el bien al cliente (paga el "Valor de Compra") y el cliente se reserva el derecho de recomprarlo dentro del plazo pactado pagando el "Valor de Retroventa" — ver [1.1](#11-la-figura-legal-real-compraventa-con-pacto-de-retroventa-no-prenda). La propiedad **pasa al negocio desde la firma**, aunque el bien queda físicamente en custodia y, contablemente (sustancia sobre forma NIIF), se trata como una operación de financiación, no como una compra de inventario.

- **Contable**: no se reconoce como compra de inventario; se reconoce una **cuenta por cobrar** (el valor de compra desembolsado) y el bien se controla en una **cuenta de orden / registro de custodia** (fuera de balance) hasta que se resuelva el contrato. La diferencia entre valor de compra y valor de retroventa ("sobrecosto") es ingreso financiero, no ingreso operacional de venta — se reconoce en dos momentos distintos según el negocio real: **sobrecosto por actualización** (al renovar, sin abonar capital) y **sobrecosto por entrega** (al liquidar y devolver el bien).
- **Ciclo**: Creado → (pendiente de desembolso) → Activo → (Renovado N veces) → Vencido → periodo de gracia (mínimo 15 días, art. 1943 C.C.) → si no ejerce la retroventa, **se traslada a inventario disponible como bien resuelto/rematado** (aquí sí se reconoce como inventario, a valor del saldo insoluto o avalúo, lo que sea menor) → Venta.
- **Contrato retirado**: si el cliente no acepta los términos entre el avalúo y el desembolso (se arrepiente, no está de acuerdo con el valor ofrecido), el contrato se cancela **antes de que haya movimiento de caja** — el bien nunca sale de estado `Appraised`. Es una categoría distinta de "Liquidado" (pagó y recuperó el bien) y de "Resuelto/Rematado" (venció sin pago) — confirmado contra reportes reales de operación de una compraventa (categorías "Contratos Realizados / Liquidados / Resueltos / Retirados" en su reporte de inventario de cartera).
- **Reempeño**: el cliente liquida el contrato vigente y abre uno nuevo sobre el mismo bien (posiblemente con nuevo avalúo/monto). Operativamente es cerrar-y-abrir, no una transición de estado adicional.
- **Retiro del bien por terceros**: en la práctica, el negocio permite que alguien distinto al cliente titular retire el bien al liquidar, siempre que presente la boleta/recibo firmado por el cliente junto con su propio número de cédula — debe quedar registrado en la auditoría como parte de la liquidación, no como una excepción informal.

### 2.3 Consignación
El cliente (consignante) entrega el bien para que el negocio lo venda a un tercero, sin que haya compra ni préstamo. La propiedad **sigue siendo del consignante** hasta la venta efectiva.
- **Contable** (alineado a NIIF para PYMES): en la entrega, **no hay reconocimiento en el estado de resultados ni cambio en el inventario del consignatario** — solo un registro de control administrativo (el bien "está" físicamente en el negocio pero no es su activo). Al venderse a un tercero, se reconocen simultáneamente el ingreso por la venta y la obligación de pagarle al consignante su parte (o el consignante reconoce su propia venta e ingreso).
- **Diferencia clave con compra directa**: en compra directa el riesgo de no vender el bien lo asume el negocio (ya es su activo); en consignación lo asume el dueño original.

### 2.4 Apartado / Plan Separe
El cliente aparta un bien que **ya es del negocio** (viene de compra directa, de remate, o de inventario nuevo) pagando cuotas o un anticipo, sin llevárselo hasta completar el pago.
- **Contable**: el bien permanece como inventario del negocio (no se da de baja hasta la entrega final), y los pagos recibidos se reconocen como **anticipo de clientes (pasivo)**, no como ingreso, hasta la entrega. Al completar el pago se reconoce la venta y se da de baja el inventario.
- **Incumplimiento**: si el cliente no completa el plan en el plazo pactado, el bien vuelve a **disponible para venta** y el negocio decide (según política/contrato) si retiene parte del anticipo como penalidad.

### 2.5 Venta
Es el evento terminal del ciclo del artículo (viniendo de inventario propio, remate, o plan separe completado). Transferencia de propiedad definitiva, factura electrónica, baja de inventario, reconocimiento de ingreso y costo de venta.

### Tabla comparativa de tratamiento contable

| Figura | Cuenta afectada al inicio | Momento del reconocimiento de ingreso | Bien en libros del negocio |
|---|---|---|---|
| Compra directa | Inventario (activo) | Al vender el bien después | Sí, desde el inicio |
| Empeño (compraventa con pacto de retroventa) | Cuenta por cobrar (financiación) | Ingreso financiero (sobrecosto), en renovación o liquidación | No, hasta remate (aunque la propiedad legal ya pasó al negocio — se controla en cuenta de orden por sustancia sobre forma) |
| Consignación | Ninguna (cuenta de orden) | Al vender a tercero | No, nunca (hasta remate por incumplimiento, no aplica aquí) |
| Apartado | Anticipo de clientes (pasivo) | Al completar el pago/entrega | Sí, desde antes de apartarse |
| Venta | — | Inmediato | Se da de baja |

## 3. Flujo operativo end-to-end

1. **Recepción y avalúo**: el cliente llega con un artículo. Un tasador/avaluador registra características, estado, autenticidad (ej. prueba de oro, IMEI de celular, número de serie/chasis de vehículo), y propone un valor.
2. **Decisión de figura**: compra directa, empeño o consignación (la venta y el apartado se originan sobre inventario ya existente, no sobre ingreso nuevo).
3. **Verificación de identidad y procedencia** (control de fraude / SARLAFT): documento de identidad, huella si aplica, consulta de bienes reportados como robados/hurtados (cuando exista integración con bases de datos de policía/gremios), registro fotográfico del bien y del cliente.
4. **Generación del contrato**: valor de compra, valor de retroventa, plazo, firma (física o electrónica) — el contrato queda creado pero *sin desembolsar* hasta que el cliente confirma que acepta los términos.
5. **Desembolso/pago**: por caja, solo tras la confirmación del cliente. Si el cliente no confirma, el contrato se marca **Retirado** (cancelado antes de desembolso) y el bien vuelve a estar disponible para otra figura o se devuelve.
6. **Custodia/almacenamiento**: el bien se etiqueta (código de barras/QR), se fotografía y se ubica físicamente (bóveda para joyas, bodega para electrodomésticos, patio para vehículos).
7. **Vida del contrato** (si es empeño/retroventa): pagos de sobrecosto por actualización (renovaciones), abonos a capital, hasta liquidación (sobrecosto por entrega) o vencimiento.
8. **Vida del inventario** (si es compra/remate/consignación): exhibición, posible reparación (Taller), posible apartado, hasta la venta.
9. **Venta**: factura electrónica, entrega, garantía si aplica (ej. electrodomésticos, celulares).
10. **Postventa**: garantía, devoluciones, servicio técnico.

Todo paso queda auditado (ver [05-multisucursal-auditoria.md](05-multisucursal-auditoria.md)).

## 4. Flujo financiero y de caja

- **Caja por sucursal**, con apertura (monto base), movimientos del día (desembolsos de compraventa con retroventa/compra directa, ingresos por sobrecosto de renovación/liquidación, ingresos por ventas, egresos operativos), arqueo y cierre con conciliación de diferencias.
- **Cartera**: el conjunto de contratos con pacto de retroventa vigentes es, en esencia, una cartera de financiación con garantía (aunque legalmente sean compraventas). Se gestiona con indicadores de mora, vencimientos próximos (para avisar al cliente antes de perder el bien), y tasa de recuperación.
- **Rentabilidad**: dos motores de ingreso distintos que deben verse por separado en los reportes — **ingreso financiero por sobrecosto** (negocio de retroventa) y **margen de venta** (negocio de compraventa/reventa). Mezclarlos en un solo P&L oculta cuál de los dos motores realmente sostiene el negocio.

## 5. Flujo contable

- **Plan de cuentas** debe separar: inventario propio, cuentas por cobrar por compraventas con pacto de retroventa, cuentas de orden por bienes en custodia (retroventa vigente y consignación), anticipos de clientes (plan separe), ingresos por sobrecosto, ingresos por venta, costo de venta.
- **Centros de costo** por sucursal como mínimo, idealmente también por línea de negocio (retroventa vs. reventa vs. taller) para calcular rentabilidad por línea.
- **Conciliaciones** bancarias y de caja como control cruzado obligatorio.

## 6. Gestión de riesgo y prevención de fraude

- Verificación de identidad y huella dactilar/firma biométrica cuando sea posible.
- Registro fotográfico de cliente y bien en cada operación.
- Consulta de bases de datos de bienes hurtados donde exista integración disponible (a nivel de diseño: un puerto/adaptador que se puede conectar a un servicio externo).
- Umbrales de monto que disparan revisión adicional o reporte a UIAF.
- Segregación de funciones: quien avalúa no debería ser la única persona que autoriza el desembolso en operaciones de monto alto (doble control).
- Bitácora inmutable de todo cambio (ver auditoría).

## 7. Manejo de empleados y permisos

Roles típicos: Cajero, Avaluador/Tasador, Asesor de venta, Encargado de sucursal, Cobrador/gestor de cartera, Técnico de taller, Contador, Administrador/Gerencia, Auditor. Cada rol tiene permisos acotados por dominio y por sucursal (un cajero de la sede A no debería poder operar caja de la sede B salvo autorización explícita). Ver detalle de permisos por dominio en [03-dominios-ddd.md](03-dominios-ddd.md).

## 8. Ciclo de vida completo del contrato — estados confirmados contra operación real

Contrastado contra reportes reales de una compraventa en operación (categorías de su "Inventario de contratos"): **Realizado → Liquidado | Resuelto | Retirado**. Mapeo contra el diseño:

- **Creado (pendiente de desembolso)**: el contrato existe (avalúo aceptado, términos definidos) pero todavía no hay movimiento de caja. Es un estado transitorio, normalmente de minutos, entre "se acordaron los términos" y "se entregó el dinero".
- **Contrato Retirado**: el cliente no acepta finalmente los términos entre el avalúo y el desembolso — el contrato se cancela **sin que haya habido desembolso**. Es la categoría que aparecía como "Contratos Retirados" en los reportes reales, distinta de Liquidado y de Resuelto. El bien vuelve a `Appraised` (disponible para renegociar o para devolver al cliente).
- **Activo → Renovado (N veces)**: el cliente paga el **sobrecosto por actualización** sin abonar a capital; el contrato extiende su fecha de vencimiento. No cambia el valor de retroventa base.
- **Abono a capital**: reduce el saldo y recalcula el sobrecosto futuro; no necesariamente extiende el plazo salvo que se pacte.
- **Reempeño**: liquidación total del contrato anterior + apertura de uno nuevo (posiblemente con nuevo avalúo). Se modela como dos transacciones encadenadas, no como un estado nuevo.
- **Liquidado**: pago total del valor de retroventa (**sobrecosto por entrega**); el bien se devuelve al cliente — o a un tercero autorizado que presente la boleta firmada y su cédula — y el contrato pasa a Histórico.
- **Vencido sin pago → Resuelto/Rematado**: tras el plazo de gracia contractual (mínimo 15 días, art. 1943 C.C.), el bien se traslada a inventario disponible para venta y el contrato se marca Resuelto.

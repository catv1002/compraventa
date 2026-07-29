---
name: ux-mostrador
description: Principios de diseño de la UI de mostrador de la compraventa (el operador nunca digita plata, pantalla de cobro en dos mitades, idioma del operador, errores corregibles en vez de anulación, señalización de los cinco estados, alertas bloqueantes por novedad, densidad y accesibilidad), derivados de la observación del sistema legado "Plus Cv". Úsala al crear o modificar cualquier pantalla que atienda cliente en mostrador —contratos, pago de intereses, abono, liquidación, remate, caja, novedades— o al escribir textos visibles en `apps/frontend/src`.
---

# UX de mostrador (compraventa Carrera 113)

Fuentes: [transcripción](../../../docs/fuentes/2026-07-transcripcion-carrera113.md),
[capturas de "Plus Cv"](../../../docs/fuentes/2026-07-capturas-plus-cv-carrera113.md) (C-02, C-04, C-09),
[docs/11 §1, §3.1, §3.5, §4, §5](../../../docs/11-levantamiento-campo-carrera113.md),
[docs/12 §3.1 y CV-012/013/019/032](../../../docs/12-gap-analysis-y-backlog.md).
Cada principio se rastrea a una cita o a una captura. Reglas de dominio: skill `reglas-negocio-empeno`.

## 1. El operador nunca digita plata

Marca **la operación** (pagar N meses de intereses / abonar / liquidar) y el sistema calcula el
importe. En el legado son dos casillas, `Actual` y `Liqui`, y el sistema llena el resto de la fila
(C-02, C-09). Es lo que la empleada llama *"los plus que tiene el programa"*.

Lo que pasa cuando sí se digita: *"por el afán le puse 1.400.000, y lo que le iba a prestar realmente
al cliente eran 2.400.000"* — y como no se puede editar, hubo que anular el contrato. Mismo origen
tienen los descuadres del arqueo de mediodía (docs/11 §3.2).

- Único importe que el operador teclea legítimamente: **el préstamo al crear el contrato**
  (`ContractsPage.tsx:153`). Ese exige confirmación explícita, tope `Valor Mínimo/Máximo` (RN-15) y
  ser corregible (§4).
- El abono a capital hoy es un `<input type="number">` libre (`ContractsPage.tsx:340-347`): debe
  ofrecer montos sugeridos y mostrar el saldo resultante antes de confirmar.
- El pago de intereses ya está bien: `<select>` de meses con el valor calculado (`:318-328`) sobre
  `GET /contracts/:id/quote`. Ese es el patrón a replicar.

## 2. La pantalla de cobro se lee en dos mitades

La grilla de 17 columnas del legado no es densidad accidental: **izquierda = situación actual,
derecha = lo que se cobra ahora** (docs/11 §3.1, C-02 y C-09).

| Izquierda — cómo está | Derecha — cómo queda |
|---|---|
| fecha hasta la que pagó (`Fecha Act`) · meses/días vencidos · capital · saldo · sobrecosto pendiente | operación elegida · meses que cubre · interés a cobrar · abono · saldo resultante · nueva fecha de corte (`Fecha N.`) |

Funciona porque el operador atiende **con el cliente enfrente** y la primera pregunta siempre es
"¿cuánto debo?": la izquierda la responde sin tocar nada, la derecha muestra la consecuencia antes de
guardar. Al pie, un solo número grande: `Pago Total =>`.

Hoy `ContractAccountPanel` pone las cuatro cifras en una fila indiferenciada
(`ContractsPage.tsx:302-311`) y **nunca muestra la fecha de corte**: `nextAccrualDate` existe en el
tipo `Quote` (`:40`) y no se renderiza. Sin ella nadie puede responder "¿hasta cuándo estoy pagado?".

## 3. Idioma del operador en la UI

En mostrador: **préstamo, intereses, abonar, actualizar, liquidar**. Nunca "valor de retroventa" ni
"sobrecosto": esa terminología va en el **contrato impreso** y en los **asientos contables**, que es
donde el legado la usa (`RECOMPRA PAGADO POR ACTUALIZACION`, `RETROVENTA PAGADO POR LIQUIDACION`,
C-07, RN-25). Violaciones verificadas en `apps/frontend/src/pages/ContractsPage.tsx`:

- `:128` encabezado "Contratos de compraventa con pacto de retroventa" · `:130-131` párrafo con "valor de retroventa"
- `:154` campo "% Retroventa mensual", estado `retroventaRate` (`:85`, usado en `:95`)
- `:153` y `:181` "Valor de compra" en vez de "préstamo"

(docs/12 §3.1 cita además `:63` y `:218` con "Valor de retroventa a pagar": **esos números están
desactualizados** y ese texto ya no existe.) No hay capa i18n; todo hardcodeado en JSX — es CV-012, y
cada pantalla nueva agrava la deuda.

## 4. Los errores deben ser corregibles, no fatales

Dolor D-01, el número uno del cliente: *"tiene uno que anular el contrato completo para poder escribir
cualquier palabra"*. Ni la dueña puede editar (*"esta opción no la tiene ni ella"*).

- Toda pantalla que cree o cobre necesita ruta de **corregir**: motivo obligatorio (el legado ya exige
  causal tipificada al anular, C-08 `Causal de Anulación`), autor, fecha y rastro visible en los
  paneles `Actualizaciones`/`Observaciones` del contrato.
- Anular es el último recurso. Si se anula, el consecutivo se marca anulado, no se reutiliza (RN-08).
- **Confirmación antes de lo irreversible.** Hoy no hay ninguna: `withdrawContract` (`:198`) y
  `settle` (`:385`) disparan al primer clic, y no existe un solo `confirm` ni diálogo de confirmación
  en `apps/frontend/src`. `components/Modal.tsx` ya está disponible.

## 5. Señalización de estado inequívoca

El operador usa el color para explicarle al cliente que perdió la joya: *"cuando el cliente viene,
consulta y sale en rojo lo que el cliente perdió"*. El negocio razona en **cinco** estados (RN-21,
resumen por cliente en C-04), no en los ocho de `ContractStatus`:

| Estado del negocio | Interno | Vocabulario visual |
|---|---|---|
| Vigente | `Active`, `Renewed`, `Created` | neutro, sin adorno |
| Vencido | `Overdue`, `Expired` | ámbar + "vencido hace N meses" |
| Liquidado | `Settled` | verde tenue + fecha, fila apagada (cerrado, no operable) |
| Resuelto (rematado) | `Forfeited` | **rojo** + "joya rematada", toda operación bloqueada |
| Anulado | `Cancelled` | gris/tachado + causal |

`STATUS_LABELS` (`ContractsPage.tsx:49-58`) expone hoy los ocho estados internos en texto plano y sin
un solo color. El agrupamiento a cinco es CV-032.

## 6. Alertas bloqueantes con contexto

Las novedades del "globito" son un control antifraude **diario**: *"pasa mucho, casi a diario, que la
gente viene y dice que se le perdió el recibo… porque les da miedo que el que los robó vengan y lo
retiren así fácilmente"* (docs/11 §3.5). Una novedad activa de recibo perdido/robado **frena la
liquidación**: diálogo bloqueante con el texto de la novedad, su fecha y quién la registró, y salida
solo por confirmación auditada de un usuario autorizado (CV-013) — no un banner ignorable. Nada de
esto existe hoy en `apps/frontend/src` (sin resultados para "novedad"/"observación").

## 7. Contexto de uso

- **Cliente esperando enfrente**: "¿cuánto debo?" se responde en la primera pantalla, sin scroll ni
  clics extra. Nada de asistentes multipaso para operaciones diarias.
- **Teclado numérico**: cédula → contrato → operación sin mouse; foco inicial en la búsqueda, `Enter`
  avanza, tabulación en el orden visual (izquierda→derecha).
- **Personal nuevo rotando** (*"teníamos ahí chicos nuevos"*): cero jerga y los bloqueos explican
  **por qué** (el mensaje de `:357-359` es el tono correcto).
- **Pantalla compartida y soporte remoto** (AnyDesk, D-06): legible a distancia, nada crítico
  dependiente de hover o tooltip.
- **No repliques funciones muertas**: huella, cámara, escáner, SMS, venta y plan separe siguen
  visibles y sin función en el legado — *"están ahí los iconos pero nunca las hemos usado"* (D-09).
  Eso entrenó a la gente a ignorar la UI. Si no funciona, no se dibuja.

## 8. Accesibilidad y densidad

- Toda cifra en pesos por un helper compartido. Hoy solo `ContractsPage.tsx:43-47` usa
  `Intl.NumberFormat('es-CO', {style:'currency', currency:'COP'})`; el resto concatena `$` +
  `toLocaleString('es-CO')` (`CashPage.tsx:74,78,82,119`, `AccountingPage.tsx:31,35,39,57`,
  `CollectionsPage.tsx:64,78`, `LayawayPage.tsx:135`, `WorkshopPage.tsx:107,131` y el propio
  `ContractsPage.tsx:181`). **Extraer el helper antes de añadir la próxima cifra.**
- **Nada depende solo del color**: cada estado lleva texto además de tono; los bloqueos se rotulan.
- Botones deshabilitados, no ocultos, con la razón al lado (RN-03 en `:355-360`). El total a cobrar es
  la cifra más grande de la pantalla.
- Etiquetas asociadas a sus campos y `aria-label` en controles de solo icono: en todo
  `apps/frontend/src` hay **un solo** `aria-label` (`components/Modal.tsx:18`).
- Densidad alta está bien —el legado la tiene y funciona— si existe la agrupación de §2.

## Checklist para cualquier pantalla nueva de mostrador

- [ ] ¿El operador elige una operación en vez de digitar un importe, y todo importe visible viene del servidor?
- [ ] ¿Se distingue "cómo está el contrato" de "cómo queda", con la fecha de corte actual y la nueva?
- [ ] ¿Hay un único total a cobrar, destacado y formateado en COP con el helper compartido?
- [ ] ¿Los textos usan préstamo/intereses/abonar/actualizar/liquidar, sin "retroventa" ni "sobrecosto" en pantalla?
- [ ] ¿Existe ruta de corrección con motivo obligatorio y rastro, en vez de obligar a anular?
- [ ] ¿Toda acción irreversible (liquidar, anular, retirar, rematar) pide confirmación mostrando lo que va a pasar?
- [ ] ¿El estado se presenta en los cinco del negocio, con color **y** texto, y rematado sale en rojo y bloqueado?
- [ ] ¿Una novedad activa de recibo perdido/robado bloquea la liquidación con confirmación auditada?
- [ ] ¿El flujo completo se hace con teclado, con foco inicial y orden de tabulación predecibles?
- [ ] ¿No se dibujó ningún control sin función real detrás, y los deshabilitados explican por qué?

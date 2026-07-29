# Fuente primaria — Capturas del sistema legado "Plus Cv" (Carrera 113)

> **Qué es esto**: diez capturas de pantalla tomadas de la reproducción de una **grabación de pantalla
> del sistema legado** (`Screen Recording 2026-07-15 at 5.38.29 PM.mov`, duración **44:19**), hecha
> durante la misma sesión de levantamiento en sitio que produjo
> [2026-07-transcripcion-carrera113.md](2026-07-transcripcion-carrera113.md). El software se
> identifica a sí mismo como **"Plus Cv"**. Es la **fuente primaria visual** de la que se derivan las
> reglas RN-15..RN-28 y los dolores D-10..D-11 de
> [11-levantamiento-campo-carrera113.md](../11-levantamiento-campo-carrera113.md).
>
> **Que es la misma sesión que el audio está probado**, no supuesto: la transcripción dice
> *"92.751, que fue el último que elaboramos"* y la captura C-08 muestra la pantalla de
> mantenimiento con el contrato **92.751**; la transcripción dice *"ahorita que viste que hay diez"*
> (millones en caja) y el extracto de caja de C-07 cierra en **10.471.260**. La fecha de caja del
> sistema en todas las capturas es **JUL. 15/2026**, la misma fecha del archivo de video.
>
> **Calidad**: son fotografías de una pantalla dentro de un reproductor, no exportaciones del sistema.
> Consecuencias: (1) los valores se transcribieron **leyéndolos de la imagen** — puede haber errores
> de lectura en cifras pequeñas y en columnas truncadas por el ancho de la ventana; (2) varias
> columnas aparecen cortadas con "…" y se transcriben como tales; (3) el reproductor tapa parte de
> la pantalla en C-01, C-02, C-03 y C-05; (4) los encabezados de dos columnas sin rótulo en la grilla
> de actualización (las que aquí se leen como "meses | días") son **interpretación**, no rótulo
> leído. Todo lo dudoso va marcado *[lectura dudosa]*.
>
> **Material faltante**:
> - Los **archivos PNG originales no están en el repositorio**. Deben guardarse en
>   `docs/fuentes/capturas/2026-07-plus-cv/` con los nombres `C-01.png` … `C-10.png` usados aquí.
> - El **video completo** (44:19) tampoco está versionado; solo se revisaron estos diez momentos.
>   Quedan ~44 minutos sin analizar, incluida la pantalla de inventario y el filtro de remates.
> - Sigue faltando el **contrato impreso** y el **recibo de pago** (pregunta P-01 del doc 12).
>
> **Fecha de incorporación**: 2026-07-28.

---

## Reconstrucción de la línea de tiempo

El orden en que se recibieron las capturas **no es cronológico**. Se reordenaron usando el reloj de
Windows visible en la barra de tareas (el video arranca a las 17:38:29); la posición en el video se
computa a partir de ese reloj salvo donde el reproductor la muestra explícitamente.

| ID | Reloj | Posición en video | Pantalla |
|---|---|---|---|
| C-01 | 17:38 | 00:00 *(mostrada)* | Splash / escritorio de "Plus Cv" |
| C-02 | 17:44 | 06:06 *(mostrada)* | Ingreso de Transacciones — actualización, contrato 0092541 |
| C-03 | 17:46 | 08:05 *(mostrada)* | Catálogo "Descripción" — clases de artículo |
| C-04 | 17:46 | ~08:10 *(computada)* | Contrato nuevo con GARGANTILLA seleccionada |
| C-05 | 17:47 | 08:47 *(mostrada)* | Contrato nuevo — foco en Peso Bruto |
| C-06 | 18:06 | ~27:40 *(computada)* | Informe de caja — pestaña "Contratos realizados" |
| C-07 | 18:07 | ~28:30 *(computada)* | Informe de caja — pestaña "Extracto de caja" |
| C-08 | 18:15 | ~36:30 *(computada)* | Mantenimiento de Contratos — contrato 92.751 |
| C-09 | 18:18 | ~39:30 *(computada)* | Ingreso de Transacciones — liquidación, contrato 0092520 |

C-07 llegó duplicada (dos capturas casi idénticas del mismo extracto, una con el cursor sobre la
columna Débito); se documenta una sola vez.

---

## Elementos presentes en toda la sesión

- **Barra de título de la ventana MDI**: `FECHA DE CAJA : JUL. 15/2026`, a la derecha de una barra de
  ~13 iconos grandes (el tooltip de uno de ellos, en C-08, dice **"Guardar"**).
- **Panel lateral izquierdo, siempre visible**: un widget con la forma de un teléfono celular que dice
  `Saldo 0` / `Recarga` / `Elija su paquete` (combo) / botones `Solicitar` y `Cancelar`.
- **Sistema operativo**: Windows 10, teclado en `ESP`, fecha `15/07/2026`. En la barra de tareas:
  Chrome, explorador de archivos, correo, y tres aplicaciones no identificadas.
- **Licencia**: la barra del visor remoto muestra `Free license (non-professional use).` y el
  identificador `1 012 911 365` (sesión de escritorio remoto — la transcripción menciona AnyDesk).

---

## C-01 — Escritorio de "Plus Cv"

Pantalla en blanco con el logotipo **"Plus Cv"** entre dos ramas de laurel azules. Sin ventanas
abiertas. Confirma el nombre del producto legado y que la barra de herramientas y la `FECHA DE CAJA`
son elementos de la ventana principal, no de un módulo.

---

## C-02 — Ingreso de Transacciones Por Cliente (actualización) — contrato 0092541

Título de la ventana: `Ingreso de Transacciones Por Cliente  -  LINA MARIA GASCA MARTINEZ`.

**Ficha del cliente** (fila superior): `Tipo Persona: Natural` · `Tipo Documento: Cedula` ·
`Documento: 1117509230` · `Dv:` (vacío) · `Lugar Expedición: FLORENCIA` ·
`Nombre(s): LINA | MARIA` · `Apellido(s): GASCA | MARTINEZ`.
Segunda fila: `Régimen Fiscal: No responsables del IVA` · `País: CO - COLOMBIA` ·
`Departamento: Caquetá` · `Ciudad/Municipio: Florencia` · `C.Ciudad: 18001` · `C.Postal:` (vacío) ·
`Dirección: MNA M ETAPA 2 CASA 2 JESUS AN…` *(truncada)*.
Tercera fila: `Telefono Fijo:` (vacío) · `Celular: 3114730499` ·
`Correo Electrónico: linamariagasca89@gmail.com` · `Empresa Donde Labora:` (vacío) · `Tel. Empresa:` (vacío).
Cuarta fila: `Sexo: Femenino` · `Fecha Nac.: 29/09/1989`.

A la izquierda de la ficha, tres iconos grandes: **escáner**, **cámara** y **huella dactilar**.
Debajo, el rótulo `Estado de Cuenta` con dos botones cuadrados: `R` y `D`.
A la derecha, un **globo de diálogo** (observaciones) y un icono `SMS` con un círculo vacío.

**Menú lateral izquierdo** (botones apilados): `Actualización de Contratos` · `Contrato Nuevo` ·
`Venta` · `Plan Separe` · `Tercero Autorizado` · `Reimpresión de Transacciones`.

**Grilla de contratos del cliente** — encabezados y única fila:

| Contrato | Fecha Act | Vencido | *(s/r)* | Valor | Abono | Saldo | Sob.Cto. Pend. | Actual | Liqui | Actualiza | *(s/r)* | Sob.Cto. Pag. | Dto Sob.Cto | Abono | Saldo | Fecha N. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0092541 | 21/05/2026 | 1 | 25 | 200,000.00 | 0.00 | 200,000.00 | 16,000.00 | ☐ | ☐ | 0 | 0 | 0.00 | 0.00 | 0.00 | 200,000.00 | 21/05/2026 |

*(s/r)* = columna sin rótulo visible, contigua a `Vencido` y a `Actualiza` respectivamente.

Debajo de la grilla: `Imp. Estado de Cuenta` con los valores `200,000.00 | 0.00 | 200,000.00 | 16,000.00`;
botones `Detallado` y `Resumido`; `Pago Total =>  216,000.00`; `Total a Pagar =>` (vacío).

**Artículos del Contrato**: `Descripción del(los) Artículo(s): CANDONGA 18k 1} PAR ER` ·
`Ubicación:` (vacío) · `Peso: 1.20` · `Costo: 200,000.00`.

**Información Adicional del Contrato**: `Fecha de Inicio: 21/05/2026` · `Plazo: 6 Mes(es)` ·
`Periodo Actualizado: 0M0D` · `Fecha Creación: 21/05/2026` ·
`Contrato Elaborado Por: MARLEDY JARA ESPAÑA`.

Al pie, dos paneles vacíos: `Actualizaciones` (columnas Fecha · Usuario · Sob.Costo · Abono) y
`Observaciones` (columnas Fecha · Usuario · Descripción), con dos totales en `0.00`.

---

## C-03 — Catálogo de clases de artículo

Ventana emergente titulada `Descripción` con una `X` a la derecha, un campo de búsqueda vacío y una
lista de dos columnas `Codigo | Nombre`:

```
00105  ANILLO
00112  ARETE
00106  ARGOLLA
00108  ARO
00101  CADENA
00103  CAMANDULA
00114  CANDONGA
00109  CASANDRA
00111  DENARIO
00115  DIJE
00102  GARGANTILLA      ← resaltada, con tooltip "GARGANTILLA"
00104  GUAYA
00130  LOTE DE JOYAS
00107  PULSERA
00116  PULSO DE RELOJ
00117  RELOJ            [lectura dudosa: la fila está cortada por el borde inferior]
```

La lista continúa por debajo del borde visible (hay barra de desplazamiento). El orden es alfabético,
no por código, y los códigos no son contiguos.

---

## C-04 — Contrato nuevo con GARGANTILLA seleccionada

Misma ventana y mismo cliente que C-02, con el menú lateral en `Contrato Nuevo`.

**Cabecera del contrato**:

| Tipo de Contrato | Fecha de Inicio | Plazo | Fecha Vence | Artículos | Valor Mínimo | Valor Máximo | Retroventa |
|---|---|---|---|---|---|---|---|
| `001` CONTRATO DE COMPRAVENTA | JUL. 15/2026 | 6 Mes(es) *(con spinner)* | ENE. 15/2027 | 100 | 20,000.00 | 10,000,000.00 | 4.00 |

**Artículos del Contrato**: `Clase de Articulo: 00102 GARGANTILLA`.
`Tipo de Metal` como grupo de radios mutuamente excluyentes:
`10k` · `12k` · `14k` · `16k` · **`18k` (seleccionado)** · `22k` · `24k` · `Platino` · `Plata` · `Otro`.
A la derecha, flechas `◀ ▶` con un contador en `0`.
Debajo: cuatro filas de grilla vacías, luego `Descripción Adicional` (campo de texto vacío).

Fila de atributos del artículo, toda vacía o en cero:
`Estado` · `Unidad de Empaque` · `Peso Bruto: 0` · `Peso Neto: 0` · `Costo: 0` · `Cupo Total: 0` ·
`Ubicación:` , seguida de dos botones con iconos (un chulo azul y un carrito).
Debajo, una tabla vacía `Descripción | Peso Bruto | Peso Neto | Costo`.
A la derecha, una imagen decorativa de cámara fotográfica.

**Resumen de Contratos del Cliente por Estado** (esquina inferior izquierda):

| Estado | # | $ | % |
|---|---|---|---|
| Vigentes | 1 | 200,000.00 | 14.00 |
| Vencidos | 0 | 0.00 | 0.00 |
| Liquidados | 6 | 1,800,000.00 | 85.00 |
| Resueltos | 0 | 0.00 | 0.00 |
| Anulados | 0 | 0.00 | 0.00 |
| **Total** | **7** | **2,200,000.00** | |

Al lado, un gráfico de barras 3D con las mismas cinco categorías (`Vig. · Ven. · Liq. · Res. · Anu.`).

A la derecha, una tabla de proyección con encabezados `Vencimiento | Retroventa | Pago Total` y filas
`AGO. 15/2026` *(resaltada)* · `SEP. 15/2026` · `OCT. 15/2026` · `NOV. 15/2026`, todas con
`0.00 | 0.00` (el contrato aún no se guarda). Encima de ella, tres casillas en `0`.

---

## C-05 — Contrato nuevo, foco en Peso Bruto

Idéntica a C-04, con el cursor de texto dentro del campo `Peso Bruto` y el puntero del mouse sobre el
área de la grilla de artículos. Confirma el orden de captura: primero la clase de artículo, después
el peso.

---

## C-06 — Informe de caja, pestaña "Contratos realizados"

Ventana `Informe de caja`. Dos selectores de fecha, ambos en `15/07/2026` (el segundo con el día `15`
resaltado, en edición). Dos botones a la derecha: **`Abrir Caja`** y **`Enviar Informe`**.

**Columna izquierda (entradas)** y su columna auxiliar `SobreCostos`:

| Concepto | Valor | SobreCostos | % |
|---|---|---|---|
| Contratos Liquidados | 6,100,000.00 | 598,000.00 | 9.80 |
| Contratos Actualizados | 600,000.00 | 412,000.00 | |
| Ventas | 0.00 | I.V.A. 0.00 | |
| Nota Débito | 0.00 | I.V.A. 0.00 | |
| Abonos a Plan Separe | 0.00 | | |
| Cuota de Manejo Rev. Plan Sep. | 0.00 | | |
| Devolución de Compra | 0.00 | | |
| Otros Ingresos | 0.00 | | |
| **Subtotal** | **7,710,000.00** | | |

`6,100,000 + 598,000 + 600,000 + 412,000 = 7,710,000` — el subtotal suma capital y sobrecostos.

**Columna derecha (salidas, rotulada en rojo)**:

| Concepto | Valor |
|---|---|
| Contratos de CompraVenta | 5,650,000.00 |
| Anulación de Liquidación | 0.00 |
| Anulación de Actualización | 0.00 |
| Compras de Mercancía | 0.00 |
| Revocación de Plan Separe | 0.00 |
| Cancelación Abonos Plan Separe | 0.00 |
| Nota Crédito | 0.00 · I.V.A. 0.00 |
| Anulación de Remisión | 0.00 |
| Otros Egresos | 0.00 |
| Gastos | 0.00 |
| **Subtotal** | **5,650,000.00** |

**Pestañas**: `Contratos realizados` *(activa)* · `Contratos actualizados` · `Contratos liquidados` ·
`Ventas` · `Venta Oro` · `Remisiones` · `Gastos` · `Extracto de caja` · `Plan Separe`.

**Contenido de la pestaña activa**:

| Contrato | Plazo | Fecha vencimiento | Clientes | Valor | Elaborado por |
|---|---|---|---|---|---|
| 0092746 | 6 - Mes(es) | ENE. 15/2027 | MARIA FLOR GUARACA PERDOMO | 500,000.00 | LINA MARIA GASCA MARTINEZ |
| 0092747 | 6 - Mes(es) | ENE. 15/2027 | LEIDY PAOLA PEREZ RUBIO | 1,900,000.00 | LEONOR SANTA CRUZ |
| 0092748 | 6 - Mes(es) | ENE. 15/2027 | JESICA LORENA VARGAS MORA | 250,000.00 | LINA MARIA GASCA MARTINEZ |
| 0092749 | 6 - Mes(es) | ENE. 15/2027 | EDILMA RODRIGUEZ SANCHEZ | 500,000.00 | LINA MARIA GASCA MARTINEZ |
| 0092750 | 6 - Mes(es) | ENE. 15/2027 | LUZ MIRYAN HERNÁNDEZ MERCHÁN | 1,000,000.00 | LEONOR SANTA CRUZ |
| 0092751 | 6 - Mes(es) | ENE. 15/2027 | TULIO ENRIQUE LUGO FRANCO | 1,500,000.00 | ROBINSON HERNANDEZ LEITON |

Suma de la columna Valor: `5,650,000.00`, exactamente el egreso "Contratos de CompraVenta".

Panel inferior, para el contrato seleccionado (0092746):
`Descripción del artículo: ANILLO 18k CIRCONES VERDES ER` · `Peso bruto: 3.50` · `Peso neto: 3.50` ·
`Costo: 500,000.00`.

---

## C-07 — Informe de caja, pestaña "Extracto de caja"

Misma ventana, encabezado idéntico, pestaña `Extracto de caja` activa. Columnas
`Documento | Fecha | Detalle | Debito | Credito | Saldo | Fecha Proceso`:

| Documento | Fecha | Detalle | Debito | Credito | Saldo | Fecha Proceso |
|---|---|---|---|---|---|---|
| 89871 | 15/07/2026 | CAPITAL LIQUIDACION DEL CONTRATO # 89871 | 2,000,000.00 | 0.00 | 11,417,260.00 | 15/07/2026 11:50 |
| 92657 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 9… | 8,000.00 | 0.00 | 11,425,260.00 | 15/07/2026 12:24 |
| 91810 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 9… | 36,000.00 | 0.00 | 11,461,260.00 | 15/07/2026 14:07 |
| 92748 | 15/07/2026 | CONTRATO # 92748 | 0.00 | 250,000.00 | 11,211,260.00 | 15/07/2026 14:28 |
| 92749 | 15/07/2026 | CONTRATO # 92749 | 0.00 | 500,000.00 | 10,711,260.00 | 15/07/2026 14:34 |
| 90954 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 9… | 12,000.00 | 0.00 | 10,723,260.00 | 15/07/2026 14:59 |
| 92750 | 15/07/2026 | CONTRATO # 92750 | 0.00 | 1,000,000.00 | 9,723,260.00 | 15/07/2026 15:25 |
| 92659 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 9… | 16,000.00 | 0.00 | 9,739,260.00 | 15/07/2026 15:29 |
| 92659 | 15/07/2026 | ABONO A CAPITAL DEL CONTRATO # 92659 | 100,000.00 | 0.00 | 9,839,260.00 | 15/07/2026 15:29 |
| 92751 | 15/07/2026 | CONTRATO # 92751 | 0.00 | 1,500,000.00 | 8,339,260.00 | 15/07/2026 15:49 |
| 92627 | 15/07/2026 | RETROVENTA O PAGADO POR LIQUIDACION DEL CONTRATO # … | 72,000.00 | 0.00 | 8,411,260.00 | 15/07/2026 16:11 |
| 92627 | 15/07/2026 | CAPITAL LIQUIDACION DEL CONTRATO # 92627 | 1,800,000.00 | 0.00 | 10,211,260.00 | 15/07/2026 16:11 |
| 82555 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 8… | 4,000.00 | 0.00 | 10,215,260.00 | 15/07/2026 16:50 |
| 83983 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 8… | 8,800.00 | 0.00 | 10,224,060.00 | 15/07/2026 16:50 |
| 82938 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 8… | 7,200.00 | 0.00 | 10,231,260.00 | 15/07/2026 16:53 |
| 90092 | 15/07/2026 | RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 9… | 240,000.00 | 0.00 | 10,471,260.00 *(celda resaltada)* | 15/07/2026 17:33 |

Hay barra de desplazamiento: la lista mostrada **no es completa** (faltan al menos los contratos
92746 y 92747, que sí aparecen en C-06). En `RETROVENTA O PAGADO POR…` el texto se lee así en la
imagen; lo más probable es `RETROVENTA PAGADO POR…` con el número de contrato pegado *[lectura dudosa]*.

Aritmética verificable en el propio extracto: **las 16 filas encadenan sin un solo descuadre** con
`Débito` sumando al saldo y `Crédito` restando (11,417,260 + 8,000 = 11,425,260;
11,461,260 − 250,000 = 11,211,260; … ; 10,231,260 + 240,000 = 10,471,260). Eso confirma la
convención contable de la pantalla: **débito = entrada de efectivo a la caja** (pagos del cliente),
**crédito = salida** (dinero prestado al abrir un contrato).

---

## C-08 — Mantenimiento de Contratos — contrato 92.751

Título de la ventana: `Mantenimiento de Contratos  -  LEONOR SANTA CRUZ`.

| Contrato | Tipo de Contrato | Fecha de Inicio | Plazo | Valor | Saldo | Sobrecosto |
|---|---|---|---|---|---|---|
| 92,751 | CONTRATO DE COMPRAVENTA | 15/07/2026 | 6 | 1,500,000.00 | 1,500,000.00 | 4.00 % |

`Elaborado por: ROBINSON HERNANDEZ LEITON` · estado: `Vigente`.
`Documento #: 80723833` · `Expedido en: BOGOTA` · `Nombre(s): TULIO | ENRIQUE` ·
`Apellido(s): LUGO | FRANCO`.

`Descripción del(los) Artículo(s): CADENA 18k 1 TEJIDO CARTIER ER` · `Ubicación:` (celda vacía,
resaltada en azul) · `Peso: 10.40` · `Cupo: 0.00` · `Costo: 1,500,000.00`.

Paneles `Actualizaciones` y `Observaciones`, ambos vacíos. Dos totales en `0.00`.

`Causal de Anulación:` combo desplegable mostrando **`CLIENTE DESISTIÓ DE TRANSACCIÓN`**.

Botonera inferior: `Anula Contrato` · `Actualización` *(deshabilitado)* · `Anula Resolución` ·
`Actualiza Datos` · `Reimprime Lables` *(sic)* · `Reimprime Contrato` · `Certificado de Propiedad` ·
`Imprime Formato`.

En la barra superior, el tooltip `Guardar` sobre el icono de diskette.

---

## C-09 — Ingreso de Transacciones (liquidación) — contrato 0092520

Título de la ventana: `Ingreso de Transacciones Por Cliente  -  ROBINSON HERNANDEZ LEITON`.

**Ficha del cliente**: `Tipo Persona: Natural` · `Tipo Documento: Cedula` · `Documento: 6804704` ·
`Dv: 0` · `Lugar Expedición: FLORENCIA` · `Nombre(s): FIGUEREDO` *[lectura dudosa]* ·
`Apellido(s): RAMIREZ | HOYOS` · `Régimen Fiscal: Responsables del IVA` · `País: CO - COLOMBIA` ·
`Departamento: Caquetá` · `Ciudad/Municipio: Florencia` · `C.Ciudad: 18001` ·
`Dirección: ANDES BAJOS` · `Celular: 3124078239` · `Correo Electrónico: NOTIENE` ·
`Sexo: Masculino` · `Fecha Nac.: 22/02/1981`.

El icono `SMS` de la esquina derecha muestra ahora un **chulo rojo** (en C-02 mostraba un círculo vacío).

**Grilla de contratos** — fila única, con el puntero del mouse sobre la casilla `Liqui`, que aparece
**marcada**:

| Contrato | Fecha Act | Vencido | *(s/r)* | Valor | Abono | Saldo | Sob.Cto. Pend. | Actual | Liqui | Actualiza | *(s/r)* | Sob.Cto. Pag. | Dto Sob.Cto | Abono | Saldo | Fecha N. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0092520 | 16/05/2026 | 1 | 30 | 1,150,000.00 | 0.00 | 1,150,000.00 | 92,000.00 | ☐ | ☑ | 1 | 30 | 92,000.00 | 0.00 | 1,150,000.00 | 0.00 | 16/07/2026 |

`Imp. Estado de Cuenta: 1,150,000.00 | 0.00 | 1,150,000.00 | 92,000.00` — luego `92,000.00 | 0.00 |
1,150,000.00 | 0.00`. `Pago Total => 1,242,000.00` · `Total a Pagar => 1,242,000.00`.

**Artículos del Contrato**:
`LOTE DE JOYAS 18k 1 CADENA CARTIER ER 1 DIJE PLACA GRABADO ROSTRO ER 1 DIJE DE C…` *(truncado por
el ancho de la columna)* · `Ubicación:` (vacío) · `Peso: 5.90` · `Costo: 1,150,000.00`.

**Información Adicional del Contrato**: `Fecha de Inicio: 16/05/2026` · `Plazo: 6 Mes(es)` ·
`Periodo Actualizado: 0M0D` · `Fecha Creación: 16/05/2026` ·
`Contrato Elaborado Por: ROBINSON HERNANDEZ LEITON`.

Paneles `Actualizaciones` y `Observaciones` vacíos.

---

## Aritmética que se desprende de las capturas

Se deja aquí el cálculo crudo; su interpretación como regla vive en el doc 11 (RN-16, RN-17).

**Contrato 0092541** (C-02) — valor 200.000, `Fecha Act 21/05/2026`, fecha de caja 15/07/2026:
- Transcurrido desde la última actualización: 1 mes y 25 días. En pantalla: `Vencido 1 | 25`.
- `Sob.Cto. Pend. = 16.000` = `200.000 × 4% × 2` → cobra **2 meses** por 1 mes y 25 días.
- `Pago Total 216.000` = 200.000 (capital) + 16.000 (sobrecosto).

**Contrato 0092520** (C-09) — valor 1.150.000, `Fecha Act 16/05/2026`, fecha de caja 15/07/2026:
- Transcurrido: 1 mes y 30 días. En pantalla: `Vencido 1 | 30`.
- `Sob.Cto. Pend. = 92.000` = `1.150.000 × 4% × 2` → de nuevo **2 meses**.
- Al marcar `Liqui`, `Fecha N.` pasa a `16/07/2026` — es decir, el pago de 2 meses corre la fecha de
  corte hasta **un día en el futuro** respecto de la fecha de caja (15/07).
- `Pago Total = 1.242.000` = 1.150.000 + 92.000.

**Informe de caja** (C-06): `598.000 / 6.100.000 = 9,80%` — el porcentaje mostrado es el sobrecosto
cobrado sobre el capital liquidado del día, no una tasa contractual.

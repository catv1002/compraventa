# 09 — Modularidad y configuración por tipo de negocio

> Nota de idioma: claves de configuración/JSON y nombres de módulo en **inglés** (son literales de código); la explicación en español.

## 1. Activación de módulos por tenant

Cada bounded context "opcional" (Workshop, Layaway, CRM, Billing/facturación electrónica, Collections avanzada) se registra en `TenantConfiguration.activeModules` (ver [06-modelo-datos-erd.md](06-modelo-datos-erd.md)) como un mapa `{ module: boolean }`. Los módulos núcleo (Security, Customers, Inventory, Contracts, Cash) **no son desactivables** — son el mínimo viable de cualquier negocio de este tipo.

```json
{
  "activeModules": {
    "workshop": false,
    "layaway": true,
    "crm": true,
    "electronicBilling": true,
    "advancedCollections": false,
    "consignment": true
  }
}
```

A nivel de aplicación, esto se resuelve con un **guard** de NestJS que intercepta cualquier request a un endpoint de un módulo opcional y responde 403/404 si el tenant no lo tiene activo — el módulo ni siquiera se carga en el árbol de rutas si está desactivado, no es solo un candado en la UI.

Ejemplos de perfiles de activación:

| Perfil (negocio) | Módulos activos además del núcleo |
|---|---|
| Compraventa de oro pequeña | (ninguno adicional — solo núcleo) |
| Compraventa de celulares con taller | `workshop`, `layaway` |
| Cadena de compraventas multi-línea | `workshop`, `layaway`, `crm`, `electronicBilling`, `purchasing` |
| Casa de empeño pura (sin reventa activa) | `advancedCollections` (sin `layaway`, sin `workshop`) |

## 2. Categorías de artículo con atributos dinámicos

El segundo eje de flexibilidad es de **datos**, no de módulos: la tabla `CATEGORY` define un `attribute_schema` (JSON Schema-like) que el frontend usa para generar el formulario de alta del artículo, y que `ItemRepository` valida antes de persistir en `DYNAMIC_ATTRIBUTE`.

Ejemplo — categoría "Oro" (`gold`):
```json
{
  "attributes": [
    { "key": "karats", "type": "number", "required": true },
    { "key": "weightGrams", "type": "number", "required": true },
    { "key": "acidTestPurity", "type": "string", "required": false }
  ]
}
```

Ejemplo — categoría "Vehículos" (`vehicles`):
```json
{
  "attributes": [
    { "key": "licensePlate", "type": "string", "required": true },
    { "key": "vin", "type": "string", "required": true },
    { "key": "mileage", "type": "number", "required": true },
    { "key": "modelYear", "type": "number", "required": true }
  ]
}
```

Ejemplo — categoría "Bicicletas" (`bicycles`):
```json
{
  "attributes": [
    { "key": "brand", "type": "string", "required": true },
    { "key": "frameSize", "type": "string", "required": false },
    { "key": "wheelSize", "type": "string", "required": false }
  ]
}
```

Esto permite agregar una nueva línea de negocio (ej. "Instrumentos musicales" / `musicalInstruments`) **sin desplegar código nuevo** — solo se crea una categoría con su esquema de atributos vía el módulo Configuration.

## 3. Parametrización legal/financiera

Dado que Colombia no tiene una única ley de casas de empeño ([01-investigacion-negocio.md](01-investigacion-negocio.md#1-marco-legal-orientativo-no-asesoría-legal)), estos valores viven en `TenantConfiguration` y no en código:

| Parámetro (código) | Ejemplo | Se valida contra |
|---|---|---|
| `maxLegalRate` | Interés bancario corriente × 1.5 (tasa de usura vigente) | `Contract.interestRate` al crear/renovar |
| `gracePeriodDays` | 30 días tras vencimiento antes de remate | Job batch que dispara `ContractDefaulted` |
| `uiafReportThreshold` | Monto que activa revisión de debida diligencia | `ContractCreated` / `DirectPurchaseRegistered` |
| `defaultLoanablePercentage` | % del avalúo ofrecido en empeño, por categoría | `Appraisal` |

Estos parámetros deben poder actualizarse por Gerencia sin intervención de desarrollo, porque la tasa de usura certificada cambia periódicamente y el negocio necesita reflejarla de inmediato.

## 4. Frontera entre "core" y "extensión"

Regla de diseño: si una funcionalidad es indispensable para *cualquier* negocio de compra/venta/empeño de artículos físicos, va al core (no desactivable). Si solo aplica a algunas líneas de negocio (reparar antes de vender, apartar con cuotas, facturar electrónicamente porque se factura IVA), va a un módulo activable. Esta frontera es la que sostiene la promesa central del proyecto: un solo producto, configurable por tipo de negocio, sin bifurcar el código por cliente.

## 5. Idioma: código vs. plan vs. aplicación

Regla adoptada para todo el proyecto:

- **Código** (clases, tablas, columnas, endpoints, eventos, claves de configuración): **inglés**, como se refleja en este documento y en [03](03-dominios-ddd.md), [06](06-modelo-datos-erd.md) y [07](07-api-rest-graphql-eventos.md).
- **Plan/documentación** (este conjunto de documentos): prosa en **español**, identificadores técnicos citados en inglés tal como estarán en el código.
- **Aplicación (UI)**: textos visibles para el usuario final — etiquetas, botones, mensajes, nombres de reportes — en **español**. La capa de i18n del frontend debe existir desde el MVP (aunque solo tenga el locale `es-CO` cargado) precisamente para separar el texto de UI de los identificadores de código, evitando que cambiar una etiqueta implique tocar un nombre de campo o de evento.

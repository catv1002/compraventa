# 00 — Resumen ejecutivo

## Qué es este proyecto

Un **ERP modular para compraventas, casas de empeño y negocios afines** (oro, joyería, celulares, herramientas, electrodomésticos, instrumentos musicales, bicicletas, vehículos, antigüedades, equipos industriales) operando en **Colombia**. No es un CRUD de inventario: modela el negocio completo — operativo, financiero, contable, legal y de auditoría — de una empresa cuyo activo central es un **artículo físico** que puede pasar por compra directa, empeño, consignación, apartado (plan separe) o venta, cada uno con reglas, contabilidad y ciclo de vida distintos.

## Principio de diseño rector

**Un solo core, módulos activables por negocio.** Una compraventa de oro pequeña enciende Inventario + Contratos + Caja + Ventas. Una cadena de compraventas con taller de reparación de celulares además enciende Taller, Plan Separe, CRM, Compras y Facturación Electrónica. El mecanismo que lo permite es doble:

1. **Modularidad a nivel de aplicación**: cada dominio (bounded context) es un módulo independiente que se activa/desactiva por tenant vía configuración de *feature flags* (ver [09-modularidad-configuracion.md](09-modularidad-configuracion.md)).
2. **Modularidad a nivel de dato**: el modelo de "Artículo" no tiene un esquema fijo de atributos — usa categorías con atributos dinámicos, así un anillo de oro (quilates, gramos, pureza) y una bicicleta (marca, tamaño de marco, rodada) conviven en el mismo sistema sin tablas paralelas.

## Los cinco tipos de operación sobre un artículo

| Operación | Propiedad del bien | Vencimiento/plazo | Qué pasa si el cliente incumple |
|---|---|---|---|
| **Compra directa** | Pasa al negocio de inmediato | No aplica | No aplica — ya es del negocio |
| **Empeño (compraventa con pacto de retroventa)** | Pasa al negocio desde la firma; el cliente puede recomprarlo (retroventa) — ver [01-investigacion-negocio.md §1.1](01-investigacion-negocio.md#11-la-figura-legal-real-compraventa-con-pacto-de-retroventa-no-prenda) | Sí, con posibilidad de renovación | Remate/venta del bien; el negocio ya era el propietario legal |
| **Consignación** | Sigue siendo del cliente hasta que se venda a un tercero | Variable, pactado | Devolución del bien al consignante |
| **Apartado (Plan Separe)** | Es del negocio, reservado para un cliente que paga cuotas | Sí, con plazo de pago | El bien vuelve a inventario disponible (con o sin penalidad sobre el anticipo) |
| **Venta** | Pasa al cliente | No aplica | No aplica — es el fin del ciclo |

El detalle completo, incluyendo tratamiento contable e IVA por figura, está en [01-investigacion-negocio.md](01-investigacion-negocio.md).

## Arquitectura en una frase

DDD con bounded contexts que se comunican por eventos de dominio, backend NestJS/PostgreSQL, frontend React, desplegado en AWS, preparado desde el día uno para multi-tenant aunque el MVP sea single-tenant. Detalle en [08-arquitectura-tecnica.md](08-arquitectura-tecnica.md).

## Alcance de este documento vs. lo que falta

Esta ronda entrega **investigación + diseño** (documentación). No incluye código ni infraestructura desplegada. El roadmap ([10-roadmap.md](10-roadmap.md)) plantea 5 fases desde MVP de un solo negocio hasta SaaS multi-tenant.

## Advertencia legal

Colombia **no tiene una ley integral única para casas de empeño/compraventas** — en la práctica, el "empeño" se instrumenta como un **contrato de compraventa con pacto de retroventa** (Código Civil arts. 1939-1943), no como prenda; verificado contra un contrato real de una compraventa en operación (ver [01-investigacion-negocio.md §1.1](01-investigacion-negocio.md#11-la-figura-legal-real-compraventa-con-pacto-de-retroventa-no-prenda)). La protección al consumidor cae bajo la SIC (Ley 1480/2011), y el tope del sobreprecio de retroventa lo fija indirectamente la tasa de usura de la Superintendencia Financiera. Este documento usa esas referencias como guía de diseño, no como asesoría legal — cualquier implementación real debe validarse con un abogado especializado antes de producción.

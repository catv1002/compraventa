# Plataforma ERP modular para Compraventas y Casas de Empeño (Colombia)

Documentación de investigación de negocio y diseño de arquitectura. Sin código todavía — este es el entregable de la primera ronda (ver el plan original en `/Users/catv/.claude/plans/act-a-como-un-equipo-resilient-bonbon.md`).

## Índice

1. [00 — Resumen ejecutivo](00-resumen-ejecutivo.md) — qué es el proyecto, principio de diseño rector, las 5 figuras de negocio en una tabla.
2. [01 — Investigación del negocio](01-investigacion-negocio.md) — marco legal colombiano, comparativa compra directa/empeño/consignación/apartado/venta, flujo operativo/financiero/contable, fraude y SARLAFT.
3. [02 — Ciclos de vida](02-ciclos-de-vida.md) — máquinas de estado de Artículo, Contrato y Caja (Mermaid).
4. [03 — Dominios (DDD)](03-dominios-ddd.md) — 14 bounded contexts con aggregates, entities, value objects, domain events, reglas de negocio y permisos.
5. [04 — KPIs y dashboards](04-kpis-y-dashboards.md) — catálogo de indicadores con fórmula/fuente/frecuencia y layout de dashboard ejecutivo.
6. [05 — Multisucursal y auditoría](05-multisucursal-auditoria.md) — modelo de sucursal, traslados, auditoría transversal inmutable.
7. [06 — Modelo de datos (ERD)](06-modelo-datos-erd.md) — entidad-relación completo en Mermaid.
8. [07 — API REST, GraphQL y eventos](07-api-rest-graphql-eventos.md) — endpoints por dominio, esquema GraphQL del BFF de reportes, catálogo de domain events.
9. [08 — Arquitectura técnica](08-arquitectura-tecnica.md) — stack propuesto y justificado: NestJS, PostgreSQL, React, AWS.
10. [09 — Modularidad y configuración](09-modularidad-configuracion.md) — cómo se activan/desactivan módulos por tenant y cómo se soportan categorías de artículo arbitrarias.
11. [10 — Roadmap](10-roadmap.md) — Fase 1 MVP → Fase 5 SaaS.
12. [11 — Levantamiento de campo "Carrera 113"](11-levantamiento-campo-carrera113.md) — cómo opera hoy una casa de empeño real con su software legado "Plus Cv": reglas de negocio observadas (RN-01..RN-28), flujos de mostrador, caja y remate, y los dolores del usuario (D-01..D-11).
13. [12 — Gap analysis y backlog](12-gap-analysis-y-backlog.md) — cruce de esas reglas contra el código realmente existente, brechas de diseño, backlog priorizado (CV-001..CV-033) y preguntas abiertas para el cliente.

### Fuentes primarias

[docs/fuentes/](fuentes/) guarda el material crudo de campo sin editar (transcripciones, capturas, notas de visita), para que toda afirmación de los documentos derivados sea rastreable hasta su evidencia original.

| Fuente | Qué es |
|---|---|
| [2026-07-transcripcion-carrera113.md](fuentes/2026-07-transcripcion-carrera113.md) | Transcripción ASR sin editar de la sesión en sitio (audio `Carrera 113 10.m4a`) |
| [2026-07-capturas-plus-cv-carrera113.md](fuentes/2026-07-capturas-plus-cv-carrera113.md) | Nueve capturas de la grabación de pantalla de esa misma sesión, transcritas campo por campo |

## Cómo leer esta documentación

El orden 00→10 es intencional: cada documento se apoya en el anterior (negocio → ciclos de vida → dominios → datos/API → arquitectura → roadmap). Si solo tienes tiempo para dos documentos, lee **01** (para entender el negocio) y **03** (para entender el diseño).

Los documentos **11 y 12** son de otra naturaleza: mientras 00–10 son diseño, 11 es **observación de campo** y 12 es el **contraste entre ambos mundos**. Antes de escribir código, 12 es el documento que dice qué falta y en qué orden.

## Skills del proyecto

`.claude/skills/` contiene el conocimiento operativo destilado de estos documentos, en formato cargable por Claude Code:

| Skill | Cuándo se usa |
|---|---|
| `reglas-negocio-empeno` | Antes de tocar contratos, pagos, liquidación, remate o caja |
| `nuevo-modulo-backend` | Al crear un módulo, endpoint, DTO, listener o modelo Prisma |
| `levantamiento-cliente` | Al procesar una transcripción, capturas o notas de una sesión con el negocio |
| `contexto-negocio-colombia` | Al escribir textos legales, cálculo de sobrecosto/intereses, plazos o facturación |
| `contabilidad-y-caja` | Al tocar caja, contabilidad, asientos, arqueo o el extracto diario |
| `ux-mostrador` | Al diseñar o modificar cualquier pantalla que se use con el cliente enfrente |
| `frontend-react` | Al crear o modificar una página o componente de `apps/frontend` |
| `seguridad-aplicacion` | Al crear o revisar un endpoint, tocar consultas por id, datos personales o dinero |

## Advertencia legal

Los documentos citan normativa colombiana (Código Civil, Ley 1480/2011, Resolución DIAN 000165/2023, SARLAFT/UIAF) como guía de diseño para saber qué debe ser parametrizable. No sustituyen asesoría legal — cualquier implementación real debe validarse con un abogado especializado en la materia antes de producción.

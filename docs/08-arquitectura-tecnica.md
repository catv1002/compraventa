# 08 — Arquitectura técnica

> Nota de idioma: rutas, nombres de carpeta y símbolos de código en **inglés**; la explicación en español.

## 1. Backend: Node.js + TypeScript + NestJS

**Por qué**: el sistema de módulos de NestJS mapea de forma casi literal a los bounded contexts del diseño DDD ([03-dominios-ddd.md](03-dominios-ddd.md)) — cada contexto (Inventory, Contracts, Cash...) se implementa como un `Module` de NestJS con sus propios controllers, services y providers, con fronteras explícitas. Su DI nativo facilita inyectar repositories e interceptors (el interceptor de auditoría transversal de [05-multisucursal-auditoria.md](05-multisucursal-auditoria.md) se implementa naturalmente como un NestJS Interceptor global). TypeScript de punta a punta con el frontend reduce fricción de contratos compartidos (tipos de DTO).

Estructura de carpetas (monolito modular, no microservicios desde el día uno):

```
src/
  modules/
    security/
    customers/
    inventory/
    appraisals/
    contracts/
    cash/
    accounting/
    billing/
    collections/
    crm/
    workshop/
    reporting/
    configuration/
    branches/
  shared/
    domain-events/
    audit-interceptor/
    kernel/            # value objects y utilidades comunes a todo el dominio
```

Cada módulo sigue la misma disposición interna: `domain/` (aggregates, entities, value objects, events), `application/` (services, use cases), `infrastructure/` (repositories concretos, controllers).

## 2. Base de datos: PostgreSQL + Redis

- **PostgreSQL** como base transaccional principal: la integridad relacional es crítica para contratos, caja y contabilidad (no se puede permitir un asiento contable huérfano o un movimiento de caja sin origen). Columnas `JSONB` para los atributos dinámicos de artículo ([09-modularidad-configuracion.md](09-modularidad-configuracion.md)), evitando esquema rígido por categoría sin sacrificar la integridad del resto del modelo.
- **Redis**: cache de sesiones/JWT, rate limiting, y cola ligera de trabajos (recordatorios de cartera, generación de reportes pesados) usando BullMQ.
- **ORM**: repositorio + mapeo explícito (ej. TypeORM o Drizzle) en vez de un active-record puro — mantiene los aggregates de dominio libres de detalles de persistencia, alineado con el patrón Repository de DDD.

## 3. Eventos internos

- **Fase 1-2**: `EventEmitter2` de NestJS in-process — el monolito modular no necesita infraestructura de mensajería externa todavía.
- **Fase 3+**: migración a BullMQ (Redis) o Amazon SQS/EventBridge para desacoplar productores/consumidores cuando aparezcan procesos asíncronos pesados (notificaciones masivas, generación de reportes multi-sucursal) o, en Fase 4-5, servicios separados.

## 4. Frontend: React + TypeScript + Vite

- **Vite** por velocidad de desarrollo; no se requiere SSR para un ERP interno (no hay necesidad de SEO).
- **TanStack Query** para estado de servidor (cache, invalidación, reintentos) — encaja bien con la naturaleza CRUD-transaccional de la mayoría de pantallas.
- **Tailwind + componentes accesibles** (ej. Radix UI/shadcn) para una UI moderna y consistente entre módulos, con soporte de tema claro/oscuro.
- Gráficos de dashboards vía una librería de charting estándar (ej. Recharts/ECharts), consumiendo el BFF GraphQL de [07-api-rest-graphql-eventos.md](07-api-rest-graphql-eventos.md).

## 5. Autenticación y autorización

- JWT de corta duración + refresh token, MFA por TOTP (Google Authenticator-style) obligatorio para roles con permisos de aprobación (Encargado, Gerencia, Contador).
- RBAC con permisos granulares por recurso + acción + alcance (sucursal propia vs. todas) — modelo descrito en el contexto Security ([03-dominios-ddd.md](03-dominios-ddd.md#1-seguridad-security)).

## 6. Cloud: Railway + Cloudflare (Fase 1-2) → AWS (Fase 3+)

Para una sola empresa (single-tenant), montar la infraestructura completa de AWS desde el MVP es sobrecosto innecesario. El diseño no depende de ningún servicio propietario de AWS en Fase 1-2 (solo Postgres + Node + object storage S3-compatible), así que se puede arrancar en un stack mucho más económico y migrar cuando el volumen lo justifique.

### Fase 1-2: Railway + Cloudflare

| Necesidad | Servicio | Costo aprox. |
|---|---|---|
| Base de datos transaccional | Railway PostgreSQL (plugin administrado) | incluido en plan Hobby/Pro |
| Cómputo backend (NestJS) | Railway (servicio Node desplegado desde el repo) | incluido en plan Hobby/Pro |
| Cache / colas ligeras | Railway Redis (plugin), opcional hasta que se necesite BullMQ | incluido |
| Frontend estático (React/Vite) | Cloudflare Pages | gratis (sin límite de ancho de banda) |
| Fotos de artículos / documentos de contrato | Cloudflare R2 (API compatible con S3, sin costo de egress) | gratis hasta 10GB/mes |
| Certificados / dominio | Cloudflare (DNS + SSL automático) | gratis |
| Observabilidad básica | Logs de Railway + alertas simples | incluido |

Se elige **Cloudflare R2 en vez de S3** desde Fase 1 (no solo como paso intermedio) porque, al ser API-compatible con S3, el código de acceso a almacenamiento (`@aws-sdk/client-s3` apuntando al endpoint de R2) es el mismo que se usará contra S3 real en Fase 3+ — la migración de proveedor no toca una sola línea de la aplicación, solo credenciales y endpoint.

### Fase 3+: migración a AWS

| Necesidad | Servicio |
|---|---|
| Base de datos transaccional | RDS PostgreSQL (Multi-AZ) |
| Cómputo backend | ECS Fargate |
| Frontend estático | (se mantiene en Cloudflare Pages, o se mueve a S3 + CloudFront si conviene consolidar todo en AWS) |
| Fotos de artículos / documentos de contrato | S3 (mismo código que R2, solo cambia el endpoint) |
| Cache / colas | ElastiCache Redis |
| Eventos asíncronos | EventBridge / SQS |
| Observabilidad | CloudWatch (logs, métricas, alarmas de diferencias de caja/errores DIAN) |

**Disparadores de migración** (no una fecha fija): más de una sucursal con necesidad de alta disponibilidad real (Multi-AZ), inicio de Fase 4 (multiempresa, aislamiento de tenants con row-level security), o volumen de tráfico/almacenamiento que supere lo cómodo en Railway.

**Multi-tenancy progresivo**: el modelo de datos incluye `tenant_id` desde el ERD inicial ([06-modelo-datos-erd.md](06-modelo-datos-erd.md)) aunque Fase 1-3 operen en modo single-tenant (un solo tenant fijo). En Fase 4 se activa aislamiento por `tenant_id` con row-level security de PostgreSQL; en Fase 5 (SaaS) se añade onboarding self-service y, si el volumen lo justifica, aislamiento físico (bases de datos separadas) para tenants grandes.

## 7. Seguridad de la infraestructura

- **Fase 1-2**: secretos como variables de entorno gestionadas en el panel de Railway (nunca committeadas al repo); credenciales de R2 con permisos acotados al bucket de la app.
- **Fase 3+**: migración a AWS Secrets Manager con rotación controlada.
- Backups automáticos de la base de datos con retención acorde a requisitos contables/legales (mínimo los años exigidos por la normativa tributaria colombiana para conservación de soportes) — Railway ofrece backups administrados de Postgres; verificar que la retención configurada cumpla ese mínimo.
- Certificado de firma digital DIAN gestionado como secreto, con rotación controlada, independientemente del proveedor de hosting.

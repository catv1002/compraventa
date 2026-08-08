# Compraventa — Plataforma ERP para compraventas y casas de empeño

Monorepo con el MVP de Fase 1 (ver [docs/10-roadmap.md](docs/10-roadmap.md)). La documentación completa de negocio y arquitectura está en [docs/](docs/README.md).

## Estructura

```
apps/
  backend/    NestJS + Prisma + PostgreSQL — API REST (docs/07-api-rest-graphql-eventos.md)
  frontend/   React + Vite + Tailwind — panel de administración
docs/         Investigación de negocio y diseño de arquitectura (ver docs/README.md)
```

## Stack (Fase 1-2)

Railway (backend + PostgreSQL) + Cloudflare Pages (frontend) + Cloudflare R2 (fotos/documentos) — ver [docs/08-arquitectura-tecnica.md](docs/08-arquitectura-tecnica.md#6-cloud-railway--cloudflare-fase-1-2--aws-fase-3). En local se usa Docker para Postgres.

## Requisitos

- Node.js 20+
- Docker (para Postgres local) o una instancia de PostgreSQL accesible

## Puesta en marcha local

```bash
npm install

# Backend
cd apps/backend
cp .env.example .env               # ajustar DATABASE_URL si no usas el Postgres por defecto
docker run -d --name compraventa-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=compraventa -p 5433:5432 postgres:16-alpine
# si usas el puerto 5433, actualiza DATABASE_URL en .env para que apunte a localhost:5433
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts         # crea tenant/sucursal/usuario admin de prueba
npm run start:dev                  # http://localhost:3100

# Frontend (otra terminal)
cd apps/frontend
cp .env.example .env
npm run dev                        # http://localhost:5173
```

Usuario de prueba creado por el seed: `admin@compraventa.demo` / `admin1234`.

Tip: si no quieres tener el teléfono a mano en cada login local, pon `MFA_BYPASS=true` en `apps/backend/.env` — solo tiene efecto si `NODE_ENV` no es `production` (ver `auth.service.ts`).

## Despliegue

Staging y producción son el mismo stack (Railway + Cloudflare Pages), separados por rama y por ambiente — no hay infraestructura duplicada que mantener. Guía paso a paso completa en [DEPLOYMENT.md](DEPLOYMENT.md).

| Rama | Backend (Railway) | Frontend (Cloudflare Pages) |
|---|---|---|
| `develop` | Ambiente **Staging**, su propia Postgres | Preview deployment automático |
| `main` | Ambiente **Production**, su propia Postgres | Deployment de producción |

`main` todavía no existe en este repo — se crea desde `develop` cuando el negocio esté listo para salir a producción real (ver DEPLOYMENT.md).

## Qué cubre Fase 1 (MVP)

- **Security**: login JWT + roles.
- **Customers**: alta y consulta de clientes.
- **Inventory**: categorías con atributos dinámicos, alta de artículos, máquina de estados.
- **Appraisals**: avalúo de artículos.
- **Contracts**: empeño (Pawn), compra directa (DirectPurchase) y venta (Sale), con renovación, liquidación y un endpoint manual `process-overdue` que simula el job diario de mora/remate.
- **Cash**: apertura, movimientos, arqueo y cierre de caja por sucursal.
- **Auditoría transversal**: todo endpoint marcado con `@Audited(...)` genera un registro inmutable en `audit_logs`.

## Qué cubre Fase 2 (Operación completa)

- **Branches + Transfers**: alta de sucursales, traslados de artículos entre sedes (`Requested → InTransit → Received/Cancelled`).
- **Layaway (Plan Separe)**: apartar artículos de inventario existente, abonos parciales, cancelación con retorno a inventario.
- **Workshop (Taller)**: órdenes de reparación con repuestos; el costo se capitaliza en `Item.costBasis`.
- **Collections (Cartera/Cobranza)**: contratos por vencer/en mora, registro de intentos de contacto, tasa de recuperación.
- **Accounting (Contabilidad)**: asientos automáticos balanceados generados por un listener de eventos de dominio (desembolsos, intereses, liquidaciones, ventas, reparaciones) sobre un plan de cuentas sembrado en `prisma/seed.ts`.
- **MFA (TOTP)**: obligatorio para roles Admin/BranchManager/Accountant — setup con QR, login exige código una vez activo.
- **Billing (facturación)**: modelo de `Invoice`/`InvoiceLine` y flujo de emisión — el envío real a DIAN está detrás de un `DianProvider` con una implementación mock (`MockDianProvider`); **reemplazar por un proveedor tecnológico autorizado real antes de producción** (ver `dian-provider.interface.ts`).

## Eventos de dominio

`EventEmitter2` in-process conecta los módulos sin llamadas directas entre ellos — ej. liquidar un contrato de empeño libera el artículo automáticamente, el vencimiento sin pago lo pasa a inventario disponible, una venta genera el asiento contable de ingreso/costo. Los emisores usan `emitAsync` (no `emit`) para que el endpoint HTTP espere a que los listeners (incluida Contabilidad) terminen de escribir antes de responder — se encontró y corrigió una condición de carrera real durante las pruebas donde `emit()` no esperaba al listener de Contabilidad.

## Simplificaciones deliberadas de este scaffold

- Los nombres de columna en Postgres son camelCase (convención idiomática de Prisma), no snake_case como en el ERD de `docs/06-modelo-datos-erd.md` — funcionalmente equivalente, solo difiere la convención de nombres físicos.
- El job batch diario que marca contratos vencidos/rematados (`docs/02-ciclos-de-vida.md`) está implementado como un endpoint manual (`POST /contracts/process-overdue`) en vez de un cron real — conviene moverlo a `@nestjs/schedule` o un job de Railway.
- La auditoría se activa por endpoint vía el decorador `@Audited(...)`, no de forma 100% automática para cualquier mutación futura — hay que anotar cada endpoint de escritura nuevo.
- El registro de permisos es por rol (enum `UserRole` + `@Roles(...)`), no la tabla granular `RolePermission` completa descrita en `docs/03-dominios-ddd.md`.
- **Plan Separe no genera asientos contables automáticos todavía** (los abonos y la venta final no están conectados al listener de Contabilidad) — es el hueco más notorio dejado por decisión de alcance en esta ronda.
- Notas crédito/débito de facturación (docs/03-dominios-ddd.md, Facturación) no están implementadas — solo emisión simple de factura.
- No hay cron real ni colas (BullMQ) todavía — `EventEmitter2` in-process es suficiente para el volumen de Fase 1-2, como estaba previsto en el roadmap.

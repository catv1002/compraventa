---
name: nuevo-modulo-backend
description: Patrón exacto para añadir o extender un módulo NestJS en apps/backend (estructura de carpetas, registro en app.module.ts, PrismaService, guards y @Roles, auditoría con @Audited/AuditInterceptor, domain events con EventEmitter2 y @OnEvent, DTOs con class-validator, modelos Prisma). Úsala al crear un módulo nuevo, un endpoint, un DTO, un listener de eventos o un modelo en schema.prisma.
---

# Añadir un módulo backend (NestJS + Prisma)

Referencia viva: `apps/backend/src/modules/cash/` (módulo simple) y
`apps/backend/src/modules/contracts/` (módulo que orquesta otros). Copia esos patrones literalmente.
Diseño: [docs/03-dominios-ddd.md](../../../docs/03-dominios-ddd.md), [docs/07-api-rest-graphql-eventos.md](../../../docs/07-api-rest-graphql-eventos.md), [docs/08-arquitectura-tecnica.md](../../../docs/08-arquitectura-tecnica.md).

## 1. Estructura de archivos

```
apps/backend/src/modules/<nombre>/
  <nombre>.module.ts
  <nombre>.controller.ts
  <nombre>.service.ts
  dto/<accion>-<entidad>.dto.ts        # un DTO por comando
  listeners/<origen>-events.listener.ts # opcional, ver §5
```

Un módulo = un bounded context de docs/03. Nombre de carpeta en inglés y en plural
(`contracts`, `cash`, `appraisals`), igual que en docs/03.

## 2. Módulo y registro

```ts
// apps/backend/src/modules/cash/cash.module.ts
@Module({
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],   // solo si otro módulo lo inyecta
})
export class CashModule {}
```

Si tu módulo consume servicios de otro, impórtalo (nunca toques las tablas ajenas):

```ts
// contracts.module.ts
@Module({ imports: [InventoryModule, CashModule], controllers: [ContractsController], providers: [ContractsService] })
```

Registro en `apps/backend/src/app.module.ts`: añade el import y una entrada en `imports`, después de
`PrismaModule`, `AuditModule` y `SecurityModule` (que van primero por ser transversales).

## 3. PrismaService

`PrismaModule` es `@Global()` — **no lo importes**, solo inyecta
`private readonly prisma: PrismaService` (desde `'../../prisma/prisma.service'`) junto con
`private readonly eventEmitter: EventEmitter2`.

Toda consulta multi-tenant filtra por `tenantId` del usuario y, cuando aplica, por `branchId`:

```ts
return this.prisma.contract.findMany({ where: { tenantId: currentUser.tenantId, status }, include: { customer: true, item: true } });
```

Errores de dominio con excepciones Nest y **mensaje en español**:
`throw new BadRequestException('El artículo debe estar Appraised antes de crear el contrato')`,
`throw new NotFoundException('Contrato no encontrado')`.

## 4. Controller: guards, roles y auditoría

```ts
@Controller('cash-registers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashController {
  @Post('open')
  @Roles(UserRole.Cashier, UserRole.BranchManager, UserRole.Admin)
  @Audited('CashRegister', 'CashRegisterOpened')
  open(@Body() dto: OpenRegisterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.openRegister(dto, user);
  }
}
```

- `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentUser`/`AuthenticatedUser` viven en
  `apps/backend/src/modules/security/`.
- Los roles permitidos por dominio están tabulados en docs/03 (§ "Permisos" de cada contexto).
- **Auditoría**: `Audited(entity, action)` (`apps/backend/src/shared/audit/audited.decorator.ts`)
  pone metadata `AUDIT_KEY`; `AuditInterceptor` (registrado como `APP_INTERCEPTOR` global en
  `apps/backend/src/shared/audit/audit.module.ts`) la lee con `Reflector` y llama
  `AuditService.record()` tras una respuesta exitosa, tomando `entityId` de `responseBody.id ??
  request.params.id`. **Todo endpoint de escritura lleva `@Audited`**; los `@Get` no. Si necesitas
  `oldValue`, llama `AuditService.record({...})` a mano desde el service (está exportado por el
  módulo `@Global()` `AuditModule`).

## 5. Domain events

Catálogo único: `apps/backend/src/shared/domain-events/events.ts` — una clase por evento con
constructor de propiedades `public readonly`, más el mapa `DomainEventNames` con el nombre kebab
(`'contract.settled'`). Añade ahí el evento nuevo; no declares eventos dentro de un módulo.

Emitir (dentro del service, tras persistir):

```ts
await this.eventEmitter.emitAsync(
  DomainEventNames.ContractSettled,
  new ContractSettledEvent(contractId, contract.itemId, dto.settlementAmount),
);
```

Consumir, en un listener propio del módulo receptor
(`apps/backend/src/modules/accounting/accounting-events.listener.ts`,
`apps/backend/src/modules/inventory/listeners/contract-events.listener.ts`):

```ts
@Injectable()
export class AccountingEventsListener {
  @OnEvent(DomainEventNames.DisbursementIssued)
  async onDisbursementIssued(event: DisbursementIssuedEvent) { /* ... */ }
}
```

Regístralo como `provider` en el módulo receptor. Transporte: `EventEmitterModule.forRoot()`
in-process (Fase 1-2). Regla: **un contexto nunca escribe tablas de otro** — o inyecta su service
(§2) o reacciona a su evento.

## 6. DTOs y validación

Un DTO por comando en `dto/`, con `class-validator`. `main.ts` aplica
`new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`, así que
cualquier campo no declarado hace fallar la request.

```ts
export class CreateContractDto {
  @IsEnum(ContractType) contractType: ContractType;   // enums importados de '@prisma/client'
  @IsString() customerId: string;
  @IsNumber() @Min(0.01) principalAmount: number;
  @IsOptional() @IsNumber() @Min(0) interestRate?: number;
  @IsOptional() @IsDateString() dueDate?: string;
}
```

Convenciones: montos `@IsNumber() @Min(0.01)` (`@Min(0)` solo para bases/saldos que pueden ser
cero), fechas como `@IsDateString()` string ISO y `new Date(...)` en el service, ids como
`@IsString()`. Los comentarios que explican una decisión de negocio van en el DTO y citan el doc
(ver `create-contract.dto.ts` y `settle-contract.dto.ts`).

## 7. Prisma schema

En `apps/backend/prisma/schema.prisma`, agrupado por sección comentada (`// ---------- Cash ----------`):

- `id String @id @default(uuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` donde aplique.
- `tenantId`/`branchId` presentes desde ya aunque Fase 1 sea single-tenant.
- Dinero: `Decimal @db.Decimal(14, 2)`; tasas: `Decimal @db.Decimal(6, 4)`.
- Enums en PascalCase con valores PascalCase (`ContractStatus`, `CashMovementType`).
- `@@map("snake_case_plural")` obligatorio en cada modelo; `@@unique([tenantId, ...])` para claves de negocio.
- Parámetros de negocio nuevos van a `TenantConfiguration` (ver `maxLegalRate`, `gracePeriodDays`,
  `activeModules`), nunca como constantes en código.

Tras editar el schema: `npx prisma generate` y la migración correspondiente desde `apps/backend`.

## Checklist

- [ ] Módulo creado con la estructura de §1 y registrado en `app.module.ts`
- [ ] Controller con `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(...)` según docs/03 y `@Audited(...)` en cada escritura
- [ ] Service inyecta `PrismaService` + `EventEmitter2`, filtra por `tenantId`, lanza excepciones en español
- [ ] Evento nuevo añadido a `shared/domain-events/events.ts` (clase + entrada en `DomainEventNames`) y emitido con `emitAsync`
- [ ] DTOs con `class-validator`, sin campos extra (el `ValidationPipe` es estricto)
- [ ] Schema con `@@map`, `Decimal(14,2)`, `tenantId`, y parámetros configurables en `TenantConfiguration`
- [ ] Si toca contratos/pagos/caja, revisar también la skill `reglas-negocio-empeno`

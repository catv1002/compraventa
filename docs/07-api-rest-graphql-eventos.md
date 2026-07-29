# 07 — API REST, GraphQL y catálogo de eventos

> Nota de idioma: rutas, esquemas y payloads en **inglés** (son código); las explicaciones en español.

## 1. Por qué REST + GraphQL (no uno solo)

- **REST** para comandos transaccionales (crear contrato, registrar movimiento de caja, vender un artículo): la semántica de recurso + verbo HTTP + código de estado es explícita y auditable, y mapea 1:1 con los `ApplicationService` de cada bounded context.
- **GraphQL** solo para el **BFF de reportes/dashboards**: los tableros ejecutivos combinan datos de muchos contextos con formas de consulta variables (por sucursal, por periodo, por categoría) — pedir eso por REST implicaría explotar endpoints o sobre-fetch constante.

## 2. API REST — endpoints principales por dominio

Convención: `/api/v1/{branch}/{resource}`, autenticación JWT + scopes de permiso por recurso.

### Customers
```
POST   /api/v1/customers
GET    /api/v1/customers/{id}
GET    /api/v1/customers/{id}/history
PATCH  /api/v1/customers/{id}/flag
```

### Inventory
```
POST   /api/v1/items
GET    /api/v1/items/{id}
GET    /api/v1/items?status=&categoryId=&branchId=
PATCH  /api/v1/items/{id}/status
POST   /api/v1/items/{id}/transfer
POST   /api/v1/categories
```

### Appraisals
```
POST   /api/v1/items/{id}/appraisal
GET    /api/v1/appraisals/{id}
```

### Contracts
```
POST   /api/v1/contracts                    # crea (pawn/direct-purchase/sale/layaway)
GET    /api/v1/contracts/{id}
POST   /api/v1/contracts/{id}/renew
POST   /api/v1/contracts/{id}/payment
POST   /api/v1/contracts/{id}/settle
GET    /api/v1/contracts?status=&customerId=&dueBefore=
```

### Cash
```
POST   /api/v1/cash-registers/open
POST   /api/v1/cash-registers/{id}/movements
POST   /api/v1/cash-registers/{id}/cash-count
POST   /api/v1/cash-registers/{id}/close
```

### Billing
```
POST   /api/v1/invoices
POST   /api/v1/invoices/{id}/credit-note
GET    /api/v1/invoices/{id}/pdf
```

### Accounting
```
GET    /api/v1/accounting/journal-entries?period=
POST   /api/v1/accounting/close-period
GET    /api/v1/accounting/income-statement?period=
```

### Workshop
```
POST   /api/v1/repair-orders
PATCH  /api/v1/repair-orders/{id}/complete
```

### Configuration
```
GET    /api/v1/configuration
PATCH  /api/v1/configuration/modules
PATCH  /api/v1/configuration/rates
```

## 3. GraphQL — esquema del BFF de reportes

```graphql
type Query {
  executiveDashboard(branchId: ID, period: PeriodInput!): ExecutiveDashboard!
  stockSummary(filter: StockFilter): StockSummary!
  portfolioSummary(filter: PortfolioFilter): PortfolioSummary!
  profitability(groupBy: ProfitabilityGrouping!, period: PeriodInput!): [ProfitabilityItem!]!
}

type ExecutiveDashboard {
  salesToday: Money!
  cashFlowToday: Money!
  contractsDueToday: Int!
  availableStock: Int!
  committedStock: Int!
  staleStock: Int!
  portfolioRecoveryRate: Percentage!
  roi: Percentage!
}

type ProfitabilityItem {
  key: String!          # categoría, sucursal o empleado según groupBy
  profit: Money!
  margin: Percentage!
}

enum ProfitabilityGrouping { CATEGORY BRANCH EMPLOYEE }

input PeriodInput { from: Date!, to: Date! }
input StockFilter { branchId: ID, categoryId: ID, status: String }
input PortfolioFilter { branchId: ID, minDaysOverdue: Int }
```

Este esquema lee **exclusivamente** de las proyecciones del contexto Reporting ([03-dominios-ddd.md](03-dominios-ddd.md#12-reportes--bi-reporting)) — nunca de las tablas transaccionales, para no competir por locks con la operación del día a día.

## 4. Catálogo de domain events

| Evento (código) | Productor | Consumidores | Payload clave |
|---|---|---|---|
| `CustomerRegistered` | Customers | CRM, Security(audit) | customerId, type, identificationNumber |
| `ItemReceived` | Inventory | Audit | itemId, categoryId, branchId |
| `ItemAppraised` | Appraisals | Contracts, Audit | itemId, appraisedValue, loanablePercentage |
| `ContractCreated` | Contracts | Cash, Collections, Audit | contractId, contractType, principalAmount |
| `DisbursementIssued` | Contracts | Cash, Accounting | contractId, amount |
| `ContractRenewed` | Contracts | Collections, Reporting | contractId, newDueDate |
| `InterestPaymentRecorded` | Contracts | Cash, Accounting | contractId, amount |
| `ContractDefaulted` | Contracts (batch job) | Inventory (repossession), Collections | contractId, itemId |
| `ContractSettled` | Contracts | Inventory (releases item), Accounting | contractId |
| `ItemTransferred` | Inventory | Audit, Reporting | itemId, sourceBranchId, destinationBranchId |
| `ItemSentToWorkshop` | Workshop | Inventory | itemId, repairOrderId |
| `RepairCompleted` | Workshop | Inventory, Reporting | itemId, totalCost |
| `LayawayCreated` | Contracts (layaway) | Inventory | itemId, contractId |
| `ItemSold` | Inventory/Billing | Accounting, Reporting, CRM | itemId, price, customerId |
| `InvoiceIssued` | Billing | Accounting | invoiceId, cufe, total |
| `CashMovementRecorded` | Cash | Accounting, Reporting | cashRegisterId, type, amount, source |
| `CashRegisterClosed` | Cash | Accounting, Audit | cashRegisterId, discrepancy |
| `ActionAudited` | Security (cross-cutting interceptor) | Reporting | entity, entityId, userId |

## 5. Transporte de eventos por fase

- **Fase 1-2**: event emitter in-process (dentro del mismo servicio NestJS) — simple, suficiente para un monolito modular.
- **Fase 3+**: cuando el número de suscriptores/servicios crece (multi-sucursal con procesamiento asíncrono, ej. envío de recordatorios de cartera), se migra a una cola (BullMQ sobre Redis o SQS) sin cambiar los contratos de evento — el `payload` ya está diseñado como mensaje serializable independiente del transporte.

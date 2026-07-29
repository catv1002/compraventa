# 06 — Modelo de datos (ERD)

> Nota de idioma: nombres de tablas y columnas en **inglés** (es el literal que tendrá el esquema de base de datos); las notas explicativas están en español.

Diagrama entidad-relación de los agregados principales. Se omiten columnas triviales (timestamps estándar) para legibilidad; `tenant_id` y `branch_id` están presentes de forma transversal en casi toda tabla (multi-tenant desde el diseño, aunque el MVP sea single-tenant).

```mermaid
erDiagram
    TENANT ||--o{ BRANCH : has
    TENANT ||--o{ USER : employs
    TENANT ||--o{ TENANT_CONFIGURATION : configures

    USER ||--o{ ROLE_PERMISSION : holds
    USER ||--o{ AUDIT_LOG : generates
    USER }o--|| BRANCH : "based at"

    BRANCH ||--o{ ITEM : hosts
    BRANCH ||--o{ CASH_REGISTER : operates
    BRANCH ||--o{ BRANCH_TRANSFER : "origin/destination"

    CUSTOMER ||--o{ CONTRACT : signs
    CUSTOMER ||--o{ DOCUMENT : presents
    CUSTOMER ||--o{ REFERENCE : provides

    CATEGORY ||--o{ SUBCATEGORY : contains
    CATEGORY ||--o{ ITEM : classifies
    ITEM ||--o{ DYNAMIC_ATTRIBUTE : describes
    ITEM ||--o{ PHOTO : documents
    ITEM ||--o| APPRAISAL : receives
    ITEM ||--o| CONTRACT : "subject of"
    ITEM ||--o{ REPAIR_ORDER : "goes through"
    ITEM ||--o| LAYAWAY : "reserved in"

    APPRAISAL }o--|| USER : "performed by"

    CONTRACT ||--o{ CONTRACT_MOVEMENT : records
    CONTRACT }o--|| CUSTOMER : belongs_to
    CONTRACT }o--|| ITEM : secures_or_transacts
    CONTRACT ||--o{ COLLECTION_CASE : "tracked by"

    CASH_REGISTER ||--o{ CASH_MOVEMENT : contains
    CASH_REGISTER ||--o| CASH_COUNT : "closed with"
    CASH_MOVEMENT }o--o| CONTRACT : originates_from
    CASH_MOVEMENT }o--o| INVOICE : originates_from

    INVOICE ||--o{ INVOICE_LINE : details
    INVOICE }o--|| CUSTOMER : issued_to
    INVOICE ||--o| CREDIT_NOTE : adjusted_by
    INVOICE_LINE }o--|| ITEM : references

    JOURNAL_ENTRY ||--o{ JOURNAL_ENTRY_LINE : composes
    JOURNAL_ENTRY_LINE }o--|| ACCOUNT : affects
    JOURNAL_ENTRY_LINE }o--o| COST_CENTER : allocated_to

    REPAIR_ORDER ||--o{ SPARE_PART : uses
    REPAIR_ORDER }o--|| USER : "assigned to technician"

    AUDIT_LOG }o--|| USER : performed_by
    AUDIT_LOG }o--|| BRANCH : from

    TENANT {
        uuid id PK
        string legal_name
        string tax_id
    }
    BRANCH {
        uuid id PK
        uuid tenant_id FK
        string name
        string address
    }
    USER {
        uuid id PK
        uuid tenant_id FK
        uuid home_branch_id FK
        string email
        string role
        bool mfa_enabled
    }
    CUSTOMER {
        uuid id PK
        uuid tenant_id FK
        string type
        string identification_number
        bool flagged
    }
    CATEGORY {
        uuid id PK
        uuid tenant_id FK
        string name
        jsonb attribute_schema
    }
    ITEM {
        uuid id PK
        uuid tenant_id FK
        uuid category_id FK
        uuid branch_id FK
        string status
        string serial_number
        string qr_code
    }
    DYNAMIC_ATTRIBUTE {
        uuid id PK
        uuid item_id FK
        string key
        string value
        string data_type
    }
    APPRAISAL {
        uuid id PK
        uuid item_id FK
        uuid appraised_by FK
        numeric appraised_value
        numeric loanable_percentage
    }
    CONTRACT {
        uuid id PK
        uuid tenant_id FK
        uuid customer_id FK
        uuid item_id FK
        string contract_type
        string status
        numeric principal_amount
        numeric interest_rate
        date due_date
        int renewal_count
    }
    CONTRACT_MOVEMENT {
        uuid id PK
        uuid contract_id FK
        string type
        numeric amount
        date movement_date
    }
    CASH_REGISTER {
        uuid id PK
        uuid branch_id FK
        date register_date
        numeric base_amount
        string status
    }
    CASH_MOVEMENT {
        uuid id PK
        uuid cash_register_id FK
        string type
        numeric amount
        uuid source_id
        string source_type
    }
    CASH_COUNT {
        uuid id PK
        uuid cash_register_id FK
        numeric discrepancy
        string resolution_status
    }
    INVOICE {
        uuid id PK
        uuid tenant_id FK
        uuid customer_id FK
        string cufe
        string dian_status
        numeric total
    }
    INVOICE_LINE {
        uuid id PK
        uuid invoice_id FK
        uuid item_id FK
        numeric price
        numeric vat
    }
    JOURNAL_ENTRY {
        uuid id PK
        uuid tenant_id FK
        date entry_date
        string source_event
    }
    JOURNAL_ENTRY_LINE {
        uuid id PK
        uuid journal_entry_id FK
        uuid account_id FK
        uuid cost_center_id FK
        numeric debit
        numeric credit
    }
    REPAIR_ORDER {
        uuid id PK
        uuid item_id FK
        uuid technician_id FK
        string status
        numeric total_cost
    }
    AUDIT_LOG {
        uuid id PK
        uuid user_id FK
        uuid branch_id FK
        string entity
        uuid entity_id
        string action
        jsonb old_value
        jsonb new_value
        timestamp created_at
    }
    TENANT_CONFIGURATION {
        uuid id PK
        uuid tenant_id FK
        jsonb active_modules
        numeric max_legal_rate
        int grace_period_days
    }
```

## Notas de diseño del modelo

- **`DYNAMIC_ATTRIBUTE` + `attribute_schema` en `CATEGORY`**: es el mecanismo que evita crear una tabla distinta por tipo de artículo (oro, celular, bicicleta, vehículo). La categoría define qué atributos son válidos y de qué tipo; el artículo los completa como filas clave-valor. Ver detalle en [09-modularidad-configuracion.md](09-modularidad-configuracion.md).
- **`CASH_MOVEMENT.source_id` / `source_type`**: referencia polimórfica controlada (no FK de base de datos, sino invariante de aplicación) hacia `CONTRACT` o `INVOICE` — todo movimiento de caja debe tener un origen de negocio trazable.
- **`AUDIT_LOG`** es *append-only* a nivel de permisos de base de datos, y referenciable desde cualquier entidad vía `entity` + `entity_id` (patrón polimórfico, no una FK por tabla).
- **Multi-tenancy**: casi toda tabla lleva `tenant_id`. En Fase 1-3 (single-tenant) esta columna existe pero no se usa para *routing*; en Fase 4-5 se convierte en la clave de aislamiento (row-level security en PostgreSQL).
- Las tablas `LAYAWAY` y `COLLECTION_CASE` referenciadas arriba se detallan en el módulo correspondiente ([03-dominios-ddd.md](03-dominios-ddd.md)); se omiten sus columnas aquí por brevedad ya que siguen el mismo patrón que `CONTRACT`.

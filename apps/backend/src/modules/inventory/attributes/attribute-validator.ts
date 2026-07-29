/**
 * Validador de atributos dinámicos contra el `attributeSchema` de la categoría (CV-020).
 *
 * Por qué existe: docs/09-modularidad-configuracion.md §2 afirma que el
 * repositorio de artículos "valida antes de persistir en DYNAMIC_ATTRIBUTE",
 * pero `createItem()` guardaba `dto.attributes` sin mirar el esquema. Esa
 * divergencia doc↔código está registrada en docs/12 §2 (fila RN-06) y es el
 * núcleo de CV-020: hoy una joya se puede registrar **sin peso**, que es
 * justamente el dato con el que el negocio la valora (docs/11 D-10).
 *
 * Este módulo es **puro a propósito**, igual que
 * `modules/contracts/interest/interest-calculator.ts`: no importa Prisma, no
 * toca la base de datos y no conoce NestJS. Así la regla se prueba exhaustiva y
 * rápidamente sin infraestructura (CV-014), y el service se limita a traducir
 * el resultado a una excepción HTTP.
 */

/** Tipos soportados por el esquema. `enum` cubre listas cerradas como el
 * quilataje del legado (10k…Otro, RN-19). */
export type AttributeType = 'number' | 'string' | 'boolean' | 'enum';

export interface AttributeDefinition {
  /** Clave técnica, la que se persiste en `DynamicAttribute.key`. */
  key: string;
  type: AttributeType;
  required: boolean;
  /** Rótulo en español para el operador. Se usa en los mensajes de error y lo
   * consume el formulario del frontend (docs/09 §2: el esquema genera el form). */
  label?: string;
  /** Solo para `enum`: valores admitidos, en el orden en que se ofrecen. */
  values?: string[];
  /**
   * Valor aplicado cuando el atributo es obligatorio y no viene en la petición.
   * Existe por RN-19: el legado trae `18k` preseleccionado y la restricción a
   * oro 18K es **política del negocio, no del software**. Un obligatorio SIN
   * default sí se rechaza (es el caso del peso).
   */
  default?: string;
  /** Solo para `number`: cotas inclusivas. `min: 0.01` es lo que impide
   * registrar una joya con peso cero, que equivale a no registrarlo. */
  min?: number;
  max?: number;
  unit?: string;
}

export interface CategoryAttributeSchema {
  attributes: AttributeDefinition[];
  /**
   * Código de la clase en el sistema legado "Plus Cv" (C-03: `00102`
   * GARGANTILLA). Vive dentro del JSON y no en una columna porque `Category` no
   * tiene campo `code` y CV-020 es un cambio de datos, no de esquema; se
   * conserva porque la migración del histórico (CV-024) empareja por ese código.
   */
  legacyCode?: string;
}

/** Lo que llega del cliente. `dataType` es opcional: la fuente de verdad del
 * tipo es el esquema de la categoría, no lo que declare quien llama. */
export interface AttributeInput {
  key: string;
  value: string;
  dataType?: string;
}

/** Lo que se persiste: `dataType` ya resuelto desde el esquema y `value`
 * normalizado (número sin ceros a la izquierda, booleano canónico). */
export interface NormalizedAttribute {
  key: string;
  value: string;
  dataType: string;
}

export type AttributeValidationResult =
  | { ok: true; attributes: NormalizedAttribute[] }
  | { ok: false; errors: string[] };

const EMPTY_SCHEMA: CategoryAttributeSchema = { attributes: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lee el `Json` de Prisma con desconfianza: la columna admite cualquier forma y
 * las categorías creadas por API llegan con lo que mandó el cliente. Todo lo
 * que no encaje se descarta en silencio en vez de tumbar la petición — una
 * categoría con esquema corrupto se comporta como una sin esquema.
 */
export function parseAttributeSchema(raw: unknown): CategoryAttributeSchema {
  if (!isRecord(raw)) return EMPTY_SCHEMA;

  const legacyCode = typeof raw.legacyCode === 'string' ? raw.legacyCode : undefined;
  const list = Array.isArray(raw.attributes) ? raw.attributes : [];

  const attributes: AttributeDefinition[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    if (typeof entry.key !== 'string' || entry.key.length === 0) continue;

    const type: AttributeType =
      entry.type === 'number' || entry.type === 'boolean' || entry.type === 'enum'
        ? entry.type
        : 'string';

    attributes.push({
      key: entry.key,
      type,
      required: entry.required === true,
      label: typeof entry.label === 'string' ? entry.label : undefined,
      values: Array.isArray(entry.values)
        ? entry.values.filter((v): v is string => typeof v === 'string')
        : undefined,
      default: typeof entry.default === 'string' ? entry.default : undefined,
      min: typeof entry.min === 'number' ? entry.min : undefined,
      max: typeof entry.max === 'number' ? entry.max : undefined,
      unit: typeof entry.unit === 'string' ? entry.unit : undefined,
    });
  }

  return { attributes, legacyCode };
}

/**
 * Esquema efectivo de una categoría: el del padre más el propio, con el hijo
 * ganando por clave.
 *
 * Es la pieza que hace viable modelar las 15 clases de joya como subcategorías
 * de "Oro" (ver `jewelry-catalog.ts`): peso y quilataje se declaran **una sola
 * vez** en la línea de negocio y no se copian quince veces, donde acabarían
 * divergiendo. Una clase concreta puede añadir o endurecer lo suyo.
 */
export function resolveAttributeSchema(
  own: unknown,
  parent?: unknown,
): CategoryAttributeSchema {
  const child = parseAttributeSchema(own);
  if (parent === undefined || parent === null) return child;

  const inherited = parseAttributeSchema(parent);
  const merged: AttributeDefinition[] = [...inherited.attributes];

  for (const definition of child.attributes) {
    const index = merged.findIndex((d) => d.key === definition.key);
    if (index >= 0) merged[index] = definition;
    else merged.push(definition);
  }

  return { attributes: merged, legacyCode: child.legacyCode ?? inherited.legacyCode };
}

function nameOf(definition: AttributeDefinition): string {
  return definition.label ? `${definition.label} (${definition.key})` : `«${definition.key}»`;
}

function validateOne(
  definition: AttributeDefinition,
  rawValue: string,
  errors: string[],
): NormalizedAttribute | null {
  const value = rawValue.trim();

  if (value.length === 0) {
    if (definition.required) {
      errors.push(`${nameOf(definition)} es obligatorio y llegó vacío.`);
      return null;
    }
    return { key: definition.key, value: '', dataType: definition.type };
  }

  switch (definition.type) {
    case 'number': {
      const parsed = Number(value.replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        errors.push(`${nameOf(definition)} debe ser un número; se recibió "${rawValue}".`);
        return null;
      }
      if (definition.min !== undefined && parsed < definition.min) {
        errors.push(
          `${nameOf(definition)} debe ser mayor o igual a ${definition.min}; se recibió ${parsed}.`,
        );
        return null;
      }
      if (definition.max !== undefined && parsed > definition.max) {
        errors.push(
          `${nameOf(definition)} debe ser menor o igual a ${definition.max}; se recibió ${parsed}.`,
        );
        return null;
      }
      return { key: definition.key, value: String(parsed), dataType: 'number' };
    }

    case 'boolean': {
      const lowered = value.toLowerCase();
      if (lowered !== 'true' && lowered !== 'false') {
        errors.push(`${nameOf(definition)} debe ser "true" o "false"; se recibió "${rawValue}".`);
        return null;
      }
      return { key: definition.key, value: lowered, dataType: 'boolean' };
    }

    case 'enum': {
      const allowed = definition.values ?? [];
      if (!allowed.includes(value)) {
        errors.push(
          `"${rawValue}" no es un valor válido para ${nameOf(definition)}. ` +
            `Valores permitidos: ${allowed.join(', ')}.`,
        );
        return null;
      }
      return { key: definition.key, value, dataType: 'enum' };
    }

    default:
      return { key: definition.key, value, dataType: 'string' };
  }
}

/**
 * Valida y normaliza los atributos de un artículo contra el esquema efectivo de
 * su categoría. Acumula **todos** los errores en vez de abortar en el primero:
 * el operador está de mostrador con el cliente enfrente y no puede corregir de
 * a un campo por viaje (skill `ux-mostrador` §4).
 *
 * Reglas:
 * - atributo no declarado en el esquema ⇒ error (el esquema es cerrado);
 * - obligatorio ausente ⇒ error, salvo que el esquema declare `default`;
 * - clave repetida ⇒ error (ambigüedad, no "gana el último");
 * - opcional ausente ⇒ simplemente no se persiste.
 */
export function validateItemAttributes(
  inputs: AttributeInput[] | undefined,
  schema: CategoryAttributeSchema,
  categoryName?: string,
): AttributeValidationResult {
  const errors: string[] = [];
  const provided = inputs ?? [];
  const ofCategory = categoryName ? ` de la categoría "${categoryName}"` : '';
  const inCategory = categoryName ? ` en la categoría "${categoryName}"` : '';

  const seen = new Set<string>();
  const byKey = new Map<string, string>();

  for (const input of provided) {
    const key = typeof input?.key === 'string' ? input.key.trim() : '';
    if (key.length === 0) {
      errors.push('Se recibió un atributo sin nombre.');
      continue;
    }
    if (seen.has(key)) {
      errors.push(`El atributo «${key}» viene repetido.`);
      continue;
    }
    seen.add(key);

    const definition = schema.attributes.find((d) => d.key === key);
    if (!definition) {
      const declared = schema.attributes.map((d) => d.key);
      errors.push(
        `El atributo «${key}» no está declarado en el esquema${ofCategory}.` +
          (declared.length > 0 ? ` Atributos válidos: ${declared.join(', ')}.` : ''),
      );
      continue;
    }

    byKey.set(key, String(input.value ?? ''));
  }

  const attributes: NormalizedAttribute[] = [];

  for (const definition of schema.attributes) {
    const raw = byKey.get(definition.key);

    if (raw === undefined) {
      if (!definition.required) continue;
      if (definition.default !== undefined) {
        // RN-19: el quilataje viene preseleccionado en 18k; que el operador no
        // lo toque no puede ser un error.
        const normalized = validateOne(definition, definition.default, errors);
        if (normalized) attributes.push(normalized);
        continue;
      }
      errors.push(`Falta ${nameOf(definition)}, obligatorio${inCategory}.`);
      continue;
    }

    const normalized = validateOne(definition, raw, errors);
    if (normalized) attributes.push(normalized);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, attributes };
}

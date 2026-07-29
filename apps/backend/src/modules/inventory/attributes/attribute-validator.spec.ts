import {
  AttributeDefinition,
  CategoryAttributeSchema,
  parseAttributeSchema,
  resolveAttributeSchema,
  validateItemAttributes,
} from './attribute-validator';
import { GOLD_ATTRIBUTE_SCHEMA, KARAT_OPTIONS } from '../jewelry-catalog';

const weight: AttributeDefinition = {
  key: 'weightGrams',
  label: 'Peso en gramos',
  type: 'number',
  required: true,
  min: 0.01,
};

const schemaOf = (...attributes: AttributeDefinition[]): CategoryAttributeSchema => ({ attributes });

/** Atajo: valida y devuelve el mapa clave→valor, o falla la prueba. */
function accepted(result: ReturnType<typeof validateItemAttributes>) {
  if (!result.ok) throw new Error(`Se esperaba éxito; errores: ${result.errors.join(' | ')}`);
  return Object.fromEntries(result.attributes.map((a) => [a.key, a.value]));
}

function rejected(result: ReturnType<typeof validateItemAttributes>) {
  if (result.ok) throw new Error('Se esperaba rechazo y fue aceptado');
  return result.errors;
}

describe('parseAttributeSchema', () => {
  it('devuelve esquema vacío para basura', () => {
    expect(parseAttributeSchema(null).attributes).toEqual([]);
    expect(parseAttributeSchema('oro').attributes).toEqual([]);
    expect(parseAttributeSchema([1, 2]).attributes).toEqual([]);
    expect(parseAttributeSchema({}).attributes).toEqual([]);
  });

  it('descarta entradas corruptas sin tumbar el resto', () => {
    const schema = parseAttributeSchema({
      attributes: [{ key: 'ok', type: 'number', required: true }, { type: 'number' }, 'nope', null],
    });
    expect(schema.attributes).toHaveLength(1);
    expect(schema.attributes[0].key).toBe('ok');
  });

  it('cae a string ante un tipo desconocido y a no-obligatorio ante required no booleano', () => {
    const schema = parseAttributeSchema({
      attributes: [{ key: 'x', type: 'fecha-marciana', required: 'sí' }],
    });
    expect(schema.attributes[0].type).toBe('string');
    expect(schema.attributes[0].required).toBe(false);
  });

  it('conserva el código del legado', () => {
    expect(parseAttributeSchema({ legacyCode: '00102', attributes: [] }).legacyCode).toBe('00102');
  });
});

describe('resolveAttributeSchema — herencia de la línea de negocio', () => {
  it('la subcategoría hereda los atributos del padre', () => {
    const resolved = resolveAttributeSchema({ legacyCode: '00101', attributes: [] }, GOLD_ATTRIBUTE_SCHEMA);
    expect(resolved.attributes.map((a) => a.key).sort()).toEqual(['karats', 'weightGrams']);
    expect(resolved.legacyCode).toBe('00101');
  });

  it('el hijo gana por clave y puede endurecer al padre', () => {
    const resolved = resolveAttributeSchema(
      { attributes: [{ key: 'weightGrams', type: 'number', required: true, min: 5 }] },
      GOLD_ATTRIBUTE_SCHEMA,
    );
    expect(resolved.attributes).toHaveLength(2);
    expect(resolved.attributes.find((a) => a.key === 'weightGrams')?.min).toBe(5);
  });

  it('sin padre devuelve el esquema propio', () => {
    expect(resolveAttributeSchema(GOLD_ATTRIBUTE_SCHEMA).attributes).toHaveLength(2);
    expect(resolveAttributeSchema(GOLD_ATTRIBUTE_SCHEMA, null).attributes).toHaveLength(2);
  });
});

describe('validateItemAttributes — obligatorios', () => {
  it('rechaza el artículo sin peso: es la razón de ser de CV-020', () => {
    const errors = rejected(validateItemAttributes([], schemaOf(weight), 'CADENA'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Peso en gramos');
    expect(errors[0]).toContain('CADENA');
  });

  it('rechaza el peso vacío igual que el ausente', () => {
    const errors = rejected(
      validateItemAttributes([{ key: 'weightGrams', value: '   ' }], schemaOf(weight)),
    );
    expect(errors[0]).toContain('obligatorio');
  });

  it('acepta el peso presente y lo normaliza', () => {
    expect(
      accepted(validateItemAttributes([{ key: 'weightGrams', value: '05.90' }], schemaOf(weight))),
    ).toEqual({ weightGrams: '5.9' });
  });

  it('acepta coma decimal, que es como se escribe en Colombia', () => {
    expect(
      accepted(validateItemAttributes([{ key: 'weightGrams', value: '5,90' }], schemaOf(weight))),
    ).toEqual({ weightGrams: '5.9' });
  });

  it('rechaza peso cero o negativo (min 0.01)', () => {
    expect(rejected(validateItemAttributes([{ key: 'weightGrams', value: '0' }], schemaOf(weight)))[0]).toContain(
      'mayor o igual a 0.01',
    );
    expect(
      rejected(validateItemAttributes([{ key: 'weightGrams', value: '-3' }], schemaOf(weight))),
    ).toHaveLength(1);
  });

  it('rechaza un peso no numérico', () => {
    const errors = rejected(
      validateItemAttributes([{ key: 'weightGrams', value: 'pesadita' }], schemaOf(weight)),
    );
    expect(errors[0]).toContain('debe ser un número');
    expect(errors[0]).toContain('pesadita');
  });

  it('respeta el máximo cuando el esquema lo declara', () => {
    const capped = { ...weight, max: 1000 };
    expect(rejected(validateItemAttributes([{ key: 'weightGrams', value: '1001' }], schemaOf(capped)))[0]).toContain(
      'menor o igual a 1000',
    );
  });
});

describe('validateItemAttributes — esquema cerrado', () => {
  it('rechaza un atributo no declarado y dice cuáles valen', () => {
    const errors = rejected(
      validateItemAttributes(
        [
          { key: 'weightGrams', value: '5' },
          { key: 'colorDeLaPiedra', value: 'rojo' },
        ],
        schemaOf(weight),
        'DIJE',
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('colorDeLaPiedra');
    expect(errors[0]).toContain('weightGrams');
  });

  it('rechaza claves repetidas en vez de quedarse con la última', () => {
    const errors = rejected(
      validateItemAttributes(
        [
          { key: 'weightGrams', value: '5' },
          { key: 'weightGrams', value: '9' },
        ],
        schemaOf(weight),
      ),
    );
    expect(errors[0]).toContain('repetido');
  });

  it('rechaza un atributo sin nombre', () => {
    expect(rejected(validateItemAttributes([{ key: '  ', value: '5' }], schemaOf(weight)))).toContain(
      'Se recibió un atributo sin nombre.',
    );
  });

  it('acumula todos los errores, no solo el primero', () => {
    const errors = rejected(
      validateItemAttributes([{ key: 'inventado', value: 'x' }], GOLD_ATTRIBUTE_SCHEMA),
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.some((e) => e.includes('inventado'))).toBe(true);
    expect(errors.some((e) => e.includes('Peso en gramos'))).toBe(true);
  });

  it('ignora los opcionales ausentes y no los persiste', () => {
    const optional: AttributeDefinition = { key: 'nota', type: 'string', required: false };
    const result = validateItemAttributes([{ key: 'weightGrams', value: '5' }], schemaOf(weight, optional));
    expect(accepted(result)).toEqual({ weightGrams: '5' });
  });

  it('un esquema vacío acepta el artículo sin atributos y rechaza cualquiera', () => {
    expect(accepted(validateItemAttributes(undefined, schemaOf()))).toEqual({});
    expect(rejected(validateItemAttributes([{ key: 'x', value: '1' }], schemaOf()))).toHaveLength(1);
  });
});

describe('validateItemAttributes — quilataje (RN-06 / RN-19)', () => {
  const gold = resolveAttributeSchema(GOLD_ATTRIBUTE_SCHEMA);

  it('aplica 18k cuando el operador no toca el quilataje', () => {
    expect(accepted(validateItemAttributes([{ key: 'weightGrams', value: '5.9' }], gold))).toEqual({
      weightGrams: '5.9',
      karats: '18k',
    });
  });

  it('acepta cualquiera de los diez valores del legado: la restricción a 18K es del negocio', () => {
    for (const karat of KARAT_OPTIONS) {
      expect(
        accepted(
          validateItemAttributes(
            [
              { key: 'weightGrams', value: '1' },
              { key: 'karats', value: karat },
            ],
            gold,
          ),
        ).karats,
      ).toBe(karat);
    }
  });

  it('rechaza un quilataje fuera de la lista y enumera los válidos', () => {
    const errors = rejected(
      validateItemAttributes(
        [
          { key: 'weightGrams', value: '1' },
          { key: 'karats', value: '9k' },
        ],
        gold,
      ),
    );
    expect(errors[0]).toContain('9k');
    expect(errors[0]).toContain('Platino');
  });

  it('ignora el dataType que declare el cliente: manda el esquema', () => {
    const result = validateItemAttributes(
      [
        { key: 'weightGrams', value: '5.9', dataType: 'string' },
        { key: 'karats', value: '18k', dataType: 'number' },
      ],
      gold,
    );
    if (!result.ok) throw new Error(result.errors.join(' | '));
    expect(result.attributes.map((a) => a.dataType).sort()).toEqual(['enum', 'number']);
  });
});

describe('validateItemAttributes — booleanos', () => {
  const flag: AttributeDefinition = { key: 'tienePiedra', type: 'boolean', required: false };

  it('normaliza mayúsculas', () => {
    expect(accepted(validateItemAttributes([{ key: 'tienePiedra', value: 'TRUE' }], schemaOf(flag)))).toEqual({
      tienePiedra: 'true',
    });
  });

  it('rechaza cualquier otra cosa', () => {
    expect(rejected(validateItemAttributes([{ key: 'tienePiedra', value: 'sí' }], schemaOf(flag)))[0]).toContain(
      '"true" o "false"',
    );
  });
});

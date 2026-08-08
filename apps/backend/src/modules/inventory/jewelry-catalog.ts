/**
 * Catálogo preparametrizado de clases de joya y esquema de atributos del oro
 * (CV-020, RN-20).
 *
 * Origen: captura C-03 de `docs/fuentes/2026-07-capturas-plus-cv-carrera113.md`
 * — la ventana "Descripción" del sistema legado "Plus Cv", donde el operador
 * **elige** la clase de una lista cerrada en vez de escribirla. Nuestro sistema
 * la tenía como texto libre, de modo que "GARGANTILLA", "gargantilla" y
 * "garg." eran tres cosas distintas y el inventario no era agrupable.
 *
 * ---------------------------------------------------------------------------
 * DECISIÓN DE MODELADO: las 15 clases son **subcategorías de "Oro"**, no
 * categorías de primer nivel.
 *
 * Se evaluaron las dos opciones que permite `Category.parentCategoryId`:
 *
 * (a) 15 categorías sueltas. Obliga a copiar el mismo `attributeSchema`
 *     (peso + quilataje) quince veces; en cuanto alguien edite una por API,
 *     las quince divergen y "el peso es obligatorio" deja de ser una regla del
 *     negocio para ser una coincidencia. Además deja "Oro" huérfana y con ella
 *     los artículos ya creados.
 *
 * (b) Subcategorías de "Oro" ← **elegida**. "Oro" pasa a ser el nodo de la
 *     línea de negocio y el único dueño del esquema: peso y quilataje se
 *     declaran una vez y las clases los heredan vía `resolveAttributeSchema()`.
 *     Los artículos existentes, que apuntan a "Oro", siguen siendo válidos: no
 *     hace falta migrar datos. Una línea futura (electrónica, vehículos) entra
 *     como hermana de "Oro" con su propio esquema, sin tocar código.
 *
 * Ojo con el matiz: en el legado "Clase de Artículo" y "Tipo de Metal" son dos
 * campos **ortogonales** (C-04), así que el metal NO es la categoría — es el
 * atributo `karats`, con Platino y Plata entre sus valores (RN-19). Colgar las
 * clases de "Oro" refleja que hoy el negocio solo recibe oro (RN-06), no que
 * una cadena de plata sea imposible: seguiría siendo "CADENA" con
 * `karats = Plata`. Si algún día hay dos líneas de metal reales, se reparentan
 * las clases sin tocar los artículos, que apuntan siempre a la hoja.
 *
 * El código del legado (`00102`) se conserva en `attributeSchema.legacyCode`
 * porque `Category` no tiene columna `code` y CV-020 es un cambio de datos, no
 * de esquema; la migración del histórico (CV-024) empareja por ese código.
 * ---------------------------------------------------------------------------
 */

import { MetalType } from '@prisma/client';
import { AttributeDefinition } from './attributes/attribute-validator';

/**
 * Quilataje / tipo de metal, tal cual el grupo de radios de C-04 y en su mismo
 * orden. RN-19: el software ofrece los diez; recibir solo oro 18K es política
 * del negocio (RN-06). Por eso están todos y `18k` va preseleccionado.
 */
export const KARAT_OPTIONS = [
  '10k',
  '12k',
  '14k',
  '16k',
  '18k',
  '22k',
  '24k',
  'Platino',
  'Plata',
  'Otro',
] as const;

export const DEFAULT_KARAT = '18k';

/**
 * Esquema de la línea "Oro". Lo heredan las 15 clases.
 *
 * `weightGrams` es obligatorio y **sin default**: es la razón de ser de CV-020.
 * El negocio valora la pieza por peso × quilataje (docs/11 §3.6, D-10) y hasta
 * ahora la pantalla ni siquiera lo pedía. `min: 0.01` porque un peso en cero
 * es lo mismo que no tenerlo.
 */
export const GOLD_ATTRIBUTE_SCHEMA: { attributes: AttributeDefinition[] } = {
  attributes: [
    {
      key: 'weightGrams',
      label: 'Peso en gramos',
      type: 'number',
      required: true,
      min: 0.01,
      unit: 'g',
    },
    {
      key: 'karats',
      label: 'Quilataje',
      type: 'enum',
      required: true,
      values: [...KARAT_OPTIONS],
      default: DEFAULT_KARAT,
    },
  ],
};

/**
 * Mapeo quilataje -> (metal, fracción de pureza sobre metal 100% puro), para
 * el avalúo sugerido (CV-032): `suggestedValue = weightGrams * purity *
 * MetalPrice.pricePerGramFine`.
 *
 * Oro (10k..24k): la fracción es quilates/24, la definición internacional de
 * quilate. Se guarda como fracción exacta (`k / 24`), no como número
 * redondeado a mano, para no acumular el mismo tipo de error de precisión que
 * `roundAmount`/`fractionalMonthsBetween` evitan en intereses — el redondeo,
 * si hace falta, se aplica una sola vez al final sobre el peso en pesos, no
 * aquí sobre la fracción.
 *
 * Platino y plata no tienen "quilate": el número (950, 925) es la ley
 * comercial —partes por mil de metal puro— con la que el gremio joyero
 * colombiano vende y compra la pieza. No es una medición exacta por pieza
 * (una pieza real puede diferir un poco de su ley nominal), es la convención
 * de industria que también usa el tasador a mano; por eso está fija aquí y no
 * es un dato que capture el operador.
 *
 * 'Otro' no tiene metal: pieza mixta o metal no catalogado, no se puede
 * sugerir un valor automático (ver `AppraisalsService.suggestValue`).
 */
export const KARAT_PURITY: Record<(typeof KARAT_OPTIONS)[number], { metal: MetalType; purity: number } | null> = {
  '10k': { metal: MetalType.Gold, purity: 10 / 24 },
  '12k': { metal: MetalType.Gold, purity: 12 / 24 },
  '14k': { metal: MetalType.Gold, purity: 14 / 24 },
  '16k': { metal: MetalType.Gold, purity: 16 / 24 },
  '18k': { metal: MetalType.Gold, purity: 18 / 24 },
  '22k': { metal: MetalType.Gold, purity: 22 / 24 },
  '24k': { metal: MetalType.Gold, purity: 24 / 24 },
  // Ley 950: estándar comercial de joyería en platino.
  Platino: { metal: MetalType.Platinum, purity: 0.95 },
  // Ley 925 / sterling: estándar comercial de joyería en plata.
  Plata: { metal: MetalType.Silver, purity: 0.925 },
  Otro: null,
};

/** Atajo: solo el metal (o null) de un quilataje, sin la pureza. */
export function karatToMetal(karat: string): MetalType | null {
  return KARAT_PURITY[karat as (typeof KARAT_OPTIONS)[number]]?.metal ?? null;
}

export interface JewelryClassSeed {
  /** Código del legado, C-03. No contiguo y no reasignable. */
  code: string;
  name: string;
}

/**
 * Las 15 clases observadas en C-03, en orden alfabético (así las lista el
 * legado). `00130 LOTE DE JOYAS` se incluye tal cual porque es la clase con la
 * que hoy se registran los empeños de varias piezas (D-10); no se legitima el
 * texto corrido —eso lo corrige CV-030— pero sin ella no se puede migrar el
 * histórico.
 *
 * `00117 RELOJ` aparece en C-03 con lectura dudosa (la fila está cortada por el
 * borde de la ventana) y la lista continúa bajo el scroll, así que NO se siembra:
 * el catálogo es administrable por `POST /categories` y prefiero que falte una
 * clase a sembrar un código inventado que luego rompa la migración.
 */
export const JEWELRY_CLASSES: JewelryClassSeed[] = [
  { code: '00105', name: 'ANILLO' },
  { code: '00112', name: 'ARETE' },
  { code: '00106', name: 'ARGOLLA' },
  { code: '00108', name: 'ARO' },
  { code: '00101', name: 'CADENA' },
  { code: '00103', name: 'CAMANDULA' },
  { code: '00114', name: 'CANDONGA' },
  { code: '00109', name: 'CASANDRA' },
  { code: '00111', name: 'DENARIO' },
  { code: '00115', name: 'DIJE' },
  { code: '00102', name: 'GARGANTILLA' },
  { code: '00104', name: 'GUAYA' },
  { code: '00130', name: 'LOTE DE JOYAS' },
  { code: '00107', name: 'PULSERA' },
  { code: '00116', name: 'PULSO DE RELOJ' },
];

/** Id determinista de la categoría raíz sembrada. */
export const GOLD_CATEGORY_SEED_ID = 'seed-category-gold';

/** Id determinista de cada clase, para que el seed sea idempotente vía upsert. */
export function jewelryClassSeedId(code: string): string {
  return `seed-jewelry-class-${code}`;
}

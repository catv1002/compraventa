/**
 * El dato que se guarda SIEMPRE es gramos — `DynamicAttribute` con
 * `key: 'weightGrams'` no cambia. Esto solo deja que el operador teclee en
 * la unidad que le resulte natural (una balanza de joyería casi siempre
 * pesa en gramos, pero una compra de metal a granel puede venir en kg o el
 * cliente puede referirse a onzas) y convierte antes de enviar.
 *
 * Onza = onza troy (31.1034768 g), el estándar de metales preciosos — NO la
 * onza avoirdupois (28.3495 g) que se usa para alimentos/otros productos.
 */
export type WeightUnit = 'g' | 'kg' | 'oz';

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  g: 'g',
  kg: 'kg',
  oz: 'oz troy',
};

const GRAMS_PER_UNIT: Record<WeightUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 31.1034768,
};

export function toGrams(value: number, unit: WeightUnit): number {
  return value * GRAMS_PER_UNIT[unit];
}

export function fromGrams(grams: number, unit: WeightUnit): number {
  return grams / GRAMS_PER_UNIT[unit];
}

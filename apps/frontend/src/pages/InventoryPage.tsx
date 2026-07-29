import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';

/**
 * Definición de un atributo dinámico, tal como la publica
 * `GET /categories` ya resuelta (esquema propio + heredado del padre).
 * El formulario se arma a partir de ella y no de constantes locales, que es lo
 * que permite añadir una clase de joya o cambiar la lista de quilates sin
 * desplegar frontend (docs/09 §2).
 */
interface AttributeDefinition {
  key: string;
  type: 'number' | 'string' | 'boolean' | 'enum';
  required: boolean;
  label?: string;
  values?: string[];
  default?: string;
  min?: number;
  unit?: string;
}

interface Category {
  id: string;
  name: string;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  /** Código de la clase en el sistema legado (C-03): `00102` GARGANTILLA. */
  legacyCode: string | null;
  attributeSchema: { attributes: AttributeDefinition[] };
}

interface ItemAttribute {
  key: string;
  value: string;
  dataType: string;
}

interface Item {
  id: string;
  status: string;
  description: string | null;
  serialNumber: string | null;
  category: { id: string; name: string };
  attributes: ItemAttribute[];
}

const STATUS_LABELS: Record<string, string> = {
  Received: 'Recibido',
  Appraised: 'Avaluado',
  InPledgeCustody: 'En custodia (empeño)',
  InStock: 'Disponible',
  Sold: 'Vendido',
  Released: 'Liberado',
};

/**
 * Solo por si la base todavía no tiene el catálogo sembrado. La lista buena es
 * la del `attributeSchema` de la categoría; esta reproduce el grupo de radios
 * del legado (C-04) para que la pantalla no quede inservible mientras tanto.
 */
const KARATS_FALLBACK = ['10k', '12k', '14k', '16k', '18k', '22k', '24k', 'Platino', 'Plata', 'Otro'];
const KARATS_DEFAULT = '18k';

function definitionOf(category: Category | undefined, key: string): AttributeDefinition | undefined {
  return category?.attributeSchema?.attributes?.find((a) => a.key === key);
}

/** "00102 · GARGANTILLA". El operador del negocio conoce los códigos del legado. */
function classLabel(category: Category): string {
  return category.legacyCode ? `${category.legacyCode} · ${category.name}` : category.name;
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const { data: items } = useQuery({ queryKey: ['items'], queryFn: () => api.get<Item[]>('/items') });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [weightGrams, setWeightGrams] = useState('');
  const [karats, setKarats] = useState(KARATS_DEFAULT);

  /**
   * Clases de joya = las subcategorías del catálogo (las 15 de C-03 cuelgan de
   * la línea "Oro"). Si la base aún no está sembrada con el árbol, se ofrecen
   * todas las categorías para no dejar la pantalla sin opciones.
   */
  const jewelryClasses = (categories ?? []).filter((c) => c.parentCategoryId !== null);
  const selectableClasses = jewelryClasses.length > 0 ? jewelryClasses : (categories ?? []);
  const selectedClass = selectableClasses.find((c) => c.id === categoryId);

  const weightDefinition = definitionOf(selectedClass, 'weightGrams');
  const karatsDefinition = definitionOf(selectedClass, 'karats');

  const karatOptions = karatsDefinition?.values ?? KARATS_FALLBACK;
  // 18k viene preseleccionado por política del negocio (RN-06/RN-19): el resto
  // de quilajes existe, pero no estorba.
  const karatValue = karatOptions.includes(karats)
    ? karats
    : (karatsDefinition?.default ?? KARATS_DEFAULT);
  const weightRequired = weightDefinition?.required ?? true;
  const weightMin = weightDefinition?.min ?? 0.01;

  const createItem = useMutation({
    mutationFn: () => {
      // Solo se envían los atributos que la clase declara: el backend rechaza
      // cualquiera que no esté en el esquema.
      const attributes: { key: string; value: string }[] = [];
      if (weightDefinition) attributes.push({ key: 'weightGrams', value: weightGrams });
      if (karatsDefinition) attributes.push({ key: 'karats', value: karatValue });

      return api.post('/items', {
        categoryId,
        description: description || undefined,
        serialNumber: serialNumber || undefined,
        attributes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setDescription('');
      setSerialNumber('');
      setWeightGrams('');
      setKarats(KARATS_DEFAULT);
    },
  });

  const [appraisingItemId, setAppraisingItemId] = useState<string | null>(null);
  const [appraisedValue, setAppraisedValue] = useState('');
  const [loanablePercentage, setLoanablePercentage] = useState('60');

  const createAppraisal = useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/items/${itemId}/appraisal`, {
        appraisedValue: Number(appraisedValue),
        loanablePercentage: Number(loanablePercentage),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setAppraisingItemId(null);
      setAppraisedValue('');
    },
  });

  function handleCreateItem(e: FormEvent) {
    e.preventDefault();
    if (!categoryId) return;
    createItem.mutate();
  }

  const inputClass = 'rounded-md border border-slate-300 px-3 py-2 text-sm';
  const labelClass = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Inventario</h2>

      <form onSubmit={handleCreateItem} className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass} htmlFor="clase-articulo">
              Clase de artículo
            </label>
            <select
              id="clase-articulo"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={`${inputClass} w-56`}
              autoFocus
              required
            >
              <option value="">Elija la clase…</option>
              {selectableClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="peso-gramos">
              {weightDefinition?.label ?? 'Peso en gramos'}
              {weightRequired ? ' *' : ''}
            </label>
            <input
              id="peso-gramos"
              value={weightGrams}
              onChange={(e) => setWeightGrams(e.target.value)}
              type="number"
              step="0.01"
              min={weightMin}
              placeholder="0,00"
              className={`${inputClass} w-28`}
              required={weightRequired}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="quilataje">
              {karatsDefinition?.label ?? 'Quilataje'}
            </label>
            <select
              id="quilataje"
              value={karatValue}
              onChange={(e) => setKarats(e.target.value)}
              className={`${inputClass} w-28`}
            >
              {karatOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[16rem] flex-1">
            <label className={labelClass} htmlFor="novedades">
              Novedades de la pieza (opcional)
            </label>
            <input
              id="novedades"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej.: tiene piedra roja, está partida"
              className={`${inputClass} w-full`}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="serie">
              Serie / IMEI (opcional)
            </label>
            <input
              id="serie"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className={`${inputClass} w-40`}
            />
          </div>

          <button
            type="submit"
            disabled={createItem.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {createItem.isPending ? 'Guardando…' : 'Ingresar artículo'}
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          La clase se elige de la lista; el peso es el dato con el que se valora la pieza. Las
          novedades van en texto libre.
        </p>

        {createItem.isError && (
          <p className="mt-2 text-sm text-red-600">{(createItem.error as ApiError).message}</p>
        )}
      </form>

      <div className="space-y-2">
        {items?.map((item) => {
          const weight = item.attributes?.find((a) => a.key === 'weightGrams')?.value;
          const karat = item.attributes?.find((a) => a.key === 'karats')?.value;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-slate-800">
                  {item.category.name}
                  {weight ? ` · ${weight} g` : ''}
                  {karat ? ` · ${karat}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {item.description || 'sin novedades'} · {item.serialNumber ?? 'sin serie'} ·{' '}
                  <span className="font-medium">{STATUS_LABELS[item.status] ?? item.status}</span>
                </p>
              </div>

              {item.status === 'Received' && (
                <div>
                  {appraisingItemId === item.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={appraisedValue}
                        onChange={(e) => setAppraisedValue(e.target.value)}
                        placeholder="Valor avaluado"
                        type="number"
                        aria-label="Valor avaluado"
                        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <input
                        value={loanablePercentage}
                        onChange={(e) => setLoanablePercentage(e.target.value)}
                        placeholder="% prestable"
                        type="number"
                        aria-label="Porcentaje prestable"
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => createAppraisal.mutate(item.id)}
                        disabled={createAppraisal.isPending}
                        className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                      >
                        {createAppraisal.isPending ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAppraisingItemId(item.id)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Avaluar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

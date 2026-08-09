import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { formatCOP } from '../lib/format';
import { Modal } from '../components/Modal';
import { BarcodeScanButton } from '../components/BarcodeScanButton';
import { useAuth } from '../lib/auth-context';
import { WeightUnit, WEIGHT_UNIT_LABELS, toGrams } from '../lib/weight';

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
  qrCode: string | null;
  category: { id: string; name: string };
  attributes: ItemAttribute[];
}

interface MetalPriceRow {
  id: string;
  metal: 'Gold' | 'Silver' | 'Platinum';
  pricePerGramFine: string | number;
  createdAt: string;
}

type MetalPricesCurrent = Record<'Gold' | 'Silver' | 'Platinum', MetalPriceRow | null>;

const METAL_LABELS: Record<'Gold' | 'Silver' | 'Platinum', string> = {
  Gold: 'Oro',
  Silver: 'Plata',
  Platinum: 'Platino',
};

interface SuggestedValue {
  suggestedValue: number | null;
  reason?: string;
  metal?: string;
  purity?: number;
  weightGrams?: number;
  pricePerGramFine?: number;
}

const STATUS_LABELS: Record<string, string> = {
  Received: 'Recibido',
  Appraised: 'Avaluado',
  InPledgeCustody: 'En custodia (empeño)',
  InStock: 'Disponible',
  Sold: 'Vendido',
  Released: 'Liberado',
  Returned: 'Devuelto (pendiente de revisión)',
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

/**
 * Franja compacta con la cotización vigente de cada metal, editable solo por
 * BranchManager/Admin (CV-032): "abrir la caja del día" para el avalúo, no
 * una pantalla de configuración aparte.
 */
function MetalPricesStrip() {
  const queryClient = useQueryClient();
  const { data: current } = useQuery({
    queryKey: ['metal-prices-current'],
    queryFn: () => api.get<MetalPricesCurrent>('/metal-prices/current'),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const setPrice = useMutation({
    mutationFn: (metal: 'Gold' | 'Silver' | 'Platinum') =>
      api.post('/metal-prices', { metal, pricePerGramFine: Number(drafts[metal]) }),
    onSuccess: (_data, metal) => {
      queryClient.invalidateQueries({ queryKey: ['metal-prices-current'] });
      setDrafts((d) => ({ ...d, [metal]: '' }));
    },
  });

  const metals: ('Gold' | 'Silver' | 'Platinum')[] = ['Gold', 'Silver', 'Platinum'];

  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {metals.map((metal) => {
        const row = current?.[metal];
        return (
          <div key={metal} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">Cotización {METAL_LABELS[metal]} (por gramo puro)</p>
            <p className="text-sm font-semibold text-slate-800">
              {row ? formatCOP(row.pricePerGramFine) : 'Sin cotización hoy'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={drafts[metal] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [metal]: e.target.value }))}
                type="number"
                min={0}
                placeholder="Nuevo precio/g"
                aria-label={`Nuevo precio por gramo de ${METAL_LABELS[metal]}`}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={() => setPrice.mutate(metal)}
                disabled={!drafts[metal] || setPrice.isPending}
                className="whitespace-nowrap rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Actualizar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: items } = useQuery({ queryKey: ['items'], queryFn: () => api.get<Item[]>('/items') });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeSearch, setCodeSearch] = useState('');

  // Funciona igual con un lector físico (escribe y termina en Enter, como un
  // teclado) que con la cámara (llena el mismo campo al leer). Coincidencia
  // por substring, no exacta: sirve tanto para pegar un código completo como
  // para teclear el final de un serial a mano.
  const visibleItems = codeSearch.trim()
    ? (items ?? []).filter((i) => {
        const needle = codeSearch.trim().toLowerCase();
        return (
          i.id.toLowerCase().includes(needle) ||
          (i.qrCode ?? '').toLowerCase().includes(needle) ||
          (i.serialNumber ?? '').toLowerCase().includes(needle)
        );
      })
    : items;
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [weightGrams, setWeightGrams] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('g');
  const [karats, setKarats] = useState(KARATS_DEFAULT);

  function closeModal() {
    setIsModalOpen(false);
    setError(null);
  }

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
      if (weightDefinition) {
        const grams = weightGrams ? toGrams(Number(weightGrams), weightUnit) : NaN;
        attributes.push({ key: 'weightGrams', value: Number.isFinite(grams) ? String(grams) : weightGrams });
      }
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
      // La clase NO se limpia: quien recibe joyas suele ingresar varias piezas
      // de la misma clase seguidas, y volver a elegirla cada vez es fricción
      // gratuita en el mostrador.
      setDescription('');
      setSerialNumber('');
      setWeightGrams('');
      setWeightUnit('g');
      setKarats(KARATS_DEFAULT);
      closeModal();
    },
    // El backend acumula todos los errores de validación de atributos en un solo
    // mensaje (peso faltante, quilataje inválido…): se muestra tal cual.
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Error al ingresar el artículo'),
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editSerialNumber, setEditSerialNumber] = useState('');
  const [editWeightGrams, setEditWeightGrams] = useState('');
  const [editWeightUnit, setEditWeightUnit] = useState<WeightUnit>('g');
  const [editKarats, setEditKarats] = useState(KARATS_DEFAULT);
  const [editError, setEditError] = useState<string | null>(null);

  const editingItem = items?.find((i) => i.id === editingItemId);
  const editingCategory = (categories ?? []).find((c) => c.id === editingItem?.category.id);
  const editWeightDefinition = definitionOf(editingCategory, 'weightGrams');
  const editKaratsDefinition = definitionOf(editingCategory, 'karats');
  const editKaratOptions = editKaratsDefinition?.values ?? KARATS_FALLBACK;

  function openEdit(item: Item) {
    setEditingItemId(item.id);
    setEditDescription(item.description ?? '');
    setEditSerialNumber(item.serialNumber ?? '');
    setEditWeightGrams(item.attributes?.find((a) => a.key === 'weightGrams')?.value ?? '');
    setEditWeightUnit('g');
    setEditKarats(item.attributes?.find((a) => a.key === 'karats')?.value ?? KARATS_DEFAULT);
    setEditError(null);
  }

  const updateItem = useMutation({
    mutationFn: () => {
      const attributes: { key: string; value: string }[] = [];
      if (editWeightDefinition) {
        const grams = editWeightGrams ? toGrams(Number(editWeightGrams), editWeightUnit) : NaN;
        attributes.push({ key: 'weightGrams', value: Number.isFinite(grams) ? String(grams) : editWeightGrams });
      }
      if (editKaratsDefinition) attributes.push({ key: 'karats', value: editKarats });

      return api.patch(`/items/${editingItemId}`, {
        description: editDescription || undefined,
        serialNumber: editSerialNumber || undefined,
        attributes: attributes.length > 0 ? attributes : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setEditingItemId(null);
    },
    onError: (err) =>
      setEditError(err instanceof ApiError ? err.message : 'Error al corregir el artículo'),
  });

  const restockItem = useMutation({
    mutationFn: (itemId: string) => api.post(`/items/${itemId}/restock`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
  });

  const [appraisingItemId, setAppraisingItemId] = useState<string | null>(null);
  const [appraisedValue, setAppraisedValue] = useState('');
  const [loanablePercentage, setLoanablePercentage] = useState('60');

  // Sugerencia de avalúo (CV-032): solo se pide mientras el formulario de un
  // artículo está abierto, no para toda la lista.
  const { data: suggested } = useQuery({
    queryKey: ['appraisal-suggested-value', appraisingItemId],
    queryFn: () => api.get<SuggestedValue>(`/items/${appraisingItemId}/appraisal/suggested-value`),
    enabled: !!appraisingItemId,
  });

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
    setError(null);
    createItem.mutate();
  }

  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm';
  const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Inventario</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nuevo artículo
        </button>
      </div>

      {user?.role !== 'SalesAdvisor' && <MetalPricesStrip />}

      <div className="mb-4 flex items-center gap-2">
        <input
          value={codeSearch}
          onChange={(e) => setCodeSearch(e.target.value)}
          placeholder="Buscar por código (lector físico o pegar código)…"
          aria-label="Buscar artículo por código"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <BarcodeScanButton onScan={setCodeSearch} />
        {codeSearch && (
          <button
            type="button"
            onClick={() => setCodeSearch('')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            Limpiar
          </button>
        )}
      </div>
      {codeSearch && (
        <p className="mb-2 text-xs text-slate-500">
          {visibleItems?.length ?? 0} artículo(s) coinciden con «{codeSearch}».
        </p>
      )}

      <div className="space-y-2">
        {visibleItems?.map((item) => {
          const weight = item.attributes?.find((a) => a.key === 'weightGrams')?.value;
          const karat = item.attributes?.find((a) => a.key === 'karats')?.value;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-slate-800">
                  <span
                    className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                    title="Código para buscar este artículo (escanéalo o pégalo en el buscador)"
                  >
                    {item.id.slice(0, 8)}
                  </span>
                  {item.category.name}
                  {weight ? ` · ${weight} g` : ''}
                  {karat ? ` · ${karat}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {item.description || 'sin novedades'} · {item.serialNumber ?? 'sin serie'} ·{' '}
                  <span className="font-medium">{STATUS_LABELS[item.status] ?? item.status}</span>
                </p>
              </div>

              {item.status === 'Returned' && user?.role !== 'SalesAdvisor' && (
                <button
                  onClick={() => {
                    if (window.confirm('¿El artículo está en condiciones de volver a la vitrina?')) {
                      restockItem.mutate(item.id);
                    }
                  }}
                  disabled={restockItem.isPending}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Reponer a disponible
                </button>
              )}

              {item.status === 'Received' && (
                <div>
                  {appraisingItemId === item.id ? (
                    <div className="flex flex-col items-end gap-1">
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
                          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                          {createAppraisal.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                      {suggested?.suggestedValue != null ? (
                        <p className="text-xs text-slate-500">
                          Sugerido: {formatCOP(suggested.suggestedValue)} (
                          {suggested.weightGrams}g × {Math.round((suggested.purity ?? 0) * 100)}% ×{' '}
                          {formatCOP(suggested.pricePerGramFine ?? 0)}/g de{' '}
                          {METAL_LABELS[suggested.metal as 'Gold' | 'Silver' | 'Platinum'] ?? suggested.metal})
                          {' · '}
                          <button
                            type="button"
                            onClick={() => setAppraisedValue(String(suggested.suggestedValue))}
                            className="font-medium text-slate-700 underline hover:text-slate-900"
                          >
                            Usar sugerido
                          </button>
                        </p>
                      ) : suggested?.reason ? (
                        <p className="text-xs text-slate-400">{suggested.reason}</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setAppraisingItemId(item.id)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Avaluar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <Modal title="Ingresar artículo" onClose={closeModal}>
          <form onSubmit={handleCreateItem} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="clase-articulo">
                Clase de artículo
              </label>
              <select
                id="clase-articulo"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputClass}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="peso-gramos">
                  {weightDefinition?.label ?? 'Peso en gramos'}
                  {weightRequired ? ' *' : ''}
                </label>
                <div className="flex gap-1">
                  <input
                    id="peso-gramos"
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(e.target.value)}
                    type="number"
                    step="0.01"
                    min={weightUnit === 'g' ? weightMin : undefined}
                    placeholder="0,00"
                    className={inputClass}
                    required={weightRequired}
                  />
                  <select
                    value={weightUnit}
                    onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
                    aria-label="Unidad de peso"
                    className="rounded-md border border-slate-300 px-1 text-sm"
                  >
                    {(Object.keys(WEIGHT_UNIT_LABELS) as WeightUnit[]).map((u) => (
                      <option key={u} value={u}>
                        {WEIGHT_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </div>
                {weightUnit !== 'g' && weightGrams && (
                  <p className="mt-1 text-xs text-slate-500">
                    = {toGrams(Number(weightGrams), weightUnit).toLocaleString('es-CO', { maximumFractionDigits: 2 })} g
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass} htmlFor="quilataje">
                  {karatsDefinition?.label ?? 'Quilataje'}
                </label>
                <select
                  id="quilataje"
                  value={karatValue}
                  onChange={(e) => setKarats(e.target.value)}
                  className={inputClass}
                >
                  {karatOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="novedades">
                Novedades de la pieza (opcional)
              </label>
              <input
                id="novedades"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej.: tiene piedra roja, está partida"
                className={inputClass}
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
                className={inputClass}
              />
            </div>

            <p className="text-xs text-slate-500">
              El peso es el dato con el que se valora la pieza. Las novedades van en texto libre.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createItem.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {createItem.isPending ? 'Guardando…' : 'Ingresar artículo'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingItemId && (
        <Modal title={`Corregir · ${editingItem?.category.name ?? ''}`} onClose={() => setEditingItemId(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEditError(null);
              updateItem.mutate();
            }}
            className="space-y-4"
          >
            {editWeightDefinition && (
              <div>
                <label className={labelClass} htmlFor="edit-peso">
                  Peso
                </label>
                <div className="flex gap-1">
                  <input
                    id="edit-peso"
                    value={editWeightGrams}
                    onChange={(e) => setEditWeightGrams(e.target.value)}
                    type="number"
                    step="0.01"
                    min={editWeightUnit === 'g' ? (editWeightDefinition.min ?? 0.01) : undefined}
                    className={inputClass}
                    autoFocus
                    required={editWeightDefinition.required}
                  />
                  <select
                    value={editWeightUnit}
                    onChange={(e) => setEditWeightUnit(e.target.value as WeightUnit)}
                    aria-label="Unidad de peso"
                    className="rounded-md border border-slate-300 px-1 text-sm"
                  >
                    {(Object.keys(WEIGHT_UNIT_LABELS) as WeightUnit[]).map((u) => (
                      <option key={u} value={u}>
                        {WEIGHT_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </div>
                {editWeightUnit !== 'g' && editWeightGrams && (
                  <p className="mt-1 text-xs text-slate-500">
                    = {toGrams(Number(editWeightGrams), editWeightUnit).toLocaleString('es-CO', { maximumFractionDigits: 2 })} g
                  </p>
                )}
              </div>
            )}
            {editKaratsDefinition && (
              <div>
                <label className={labelClass} htmlFor="edit-quilataje">
                  Quilataje
                </label>
                <select
                  id="edit-quilataje"
                  value={editKarats}
                  onChange={(e) => setEditKarats(e.target.value)}
                  className={inputClass}
                >
                  {editKaratOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="edit-descripcion">
                Novedades
              </label>
              <input
                id="edit-descripcion"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="edit-serie">
                Número de serie
              </label>
              <input
                id="edit-serie"
                value={editSerialNumber}
                onChange={(e) => setEditSerialNumber(e.target.value)}
                className={inputClass}
              />
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItemId(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateItem.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {updateItem.isPending ? 'Guardando…' : 'Guardar corrección'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

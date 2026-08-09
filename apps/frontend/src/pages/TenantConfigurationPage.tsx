import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';

interface ActiveModules {
  workshop: boolean;
  layaway: boolean;
  crm: boolean;
  electronicBilling: boolean;
  advancedCollections: boolean;
  consignment: boolean;
}

interface TenantConfiguration {
  id: string | null;
  tenantId: string;
  activeModules: ActiveModules;
  maxLegalRate: number | string;
  usuryCapPolicy: 'Block' | 'Warn';
  gracePeriodDays: number;
  defaultLoanablePercentage: number | string;
  defaultMonthlyInterestRate: number | string;
  defaultTermMonths: number;
  forfeitureThresholdMonths: number;
  interestAccrualPolicy: 'FullMonthCeil' | 'FullMonth' | 'ProRata';
  interestRounding: 'None' | 'NearestPeso' | 'NearestHundred';
  contractNumberOffset: number;
  withholdingTaxEnabled: boolean;
  withholdingTaxRate: number | string;
  withholdingTaxMinBase: number | string;
}

const MODULE_LABELS: Record<keyof ActiveModules, string> = {
  workshop: 'Taller',
  layaway: 'Plan separe',
  crm: 'CRM',
  electronicBilling: 'Facturación electrónica',
  advancedCollections: 'Cartera avanzada',
  consignment: 'Consignación',
};

const USURY_POLICY_LABELS: Record<TenantConfiguration['usuryCapPolicy'], string> = {
  Block: 'Bloquear (rechaza el contrato)',
  Warn: 'Advertir (permite y avisa)',
};

const ACCRUAL_POLICY_LABELS: Record<TenantConfiguration['interestAccrualPolicy'], string> = {
  FullMonthCeil: 'Mes completo hacia arriba (cobra el mes empezado)',
  FullMonth: 'Solo mes cumplido',
  ProRata: 'Proporcional a los días',
};

const ROUNDING_LABELS: Record<TenantConfiguration['interestRounding'], string> = {
  None: 'Sin redondeo',
  NearestPeso: 'Al peso más cercano',
  NearestHundred: 'A la centena más cercana',
};

// El backend guarda maxLegalRate y defaultMonthlyInterestRate como decimales
// (0.1950 = 19.5%, 0.0400 = 4%), pero el operador piensa en porcentaje. Estas
// dos funciones son la única frontera de conversión — nunca mandar/mostrar el
// decimal crudo en el formulario, ni el porcentaje crudo al servidor.
function decimalToPercentInput(value: number | string): string {
  return (Number(value) * 100).toString();
}
function percentInputToDecimal(value: string): number {
  return Number(value) / 100;
}

export function TenantConfigurationPage() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['tenant-configuration'],
    queryFn: () => api.get<TenantConfiguration>('/tenant-configuration'),
  });

  const [form, setForm] = useState<TenantConfiguration | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const updateConfig = useMutation({
    mutationFn: (payload: Partial<TenantConfiguration>) => api.patch<TenantConfiguration>('/tenant-configuration', payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-configuration'] });
      setForm(data);
      setErrorMessage(null);
      setSuccessMessage('Configuración guardada.');
    },
    onError: (error) => {
      setSuccessMessage(null);
      setErrorMessage(error instanceof ApiError ? error.message : 'No se pudo guardar la configuración.');
    },
  });

  if (!form) {
    return <p className="text-sm text-slate-500">Cargando configuración…</p>;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    updateConfig.mutate({
      activeModules: form.activeModules,
      maxLegalRate: Number(form.maxLegalRate),
      usuryCapPolicy: form.usuryCapPolicy,
      gracePeriodDays: Number(form.gracePeriodDays),
      defaultLoanablePercentage: Number(form.defaultLoanablePercentage),
      defaultMonthlyInterestRate: Number(form.defaultMonthlyInterestRate),
      defaultTermMonths: Number(form.defaultTermMonths),
      forfeitureThresholdMonths: Number(form.forfeitureThresholdMonths),
      interestAccrualPolicy: form.interestAccrualPolicy,
      interestRounding: form.interestRounding,
      contractNumberOffset: Number(form.contractNumberOffset),
      withholdingTaxEnabled: form.withholdingTaxEnabled,
      withholdingTaxRate: Number(form.withholdingTaxRate),
      withholdingTaxMinBase: Number(form.withholdingTaxMinBase),
    });
  }

  function toggleModule(key: keyof ActiveModules) {
    setForm((prev) => (prev ? { ...prev, activeModules: { ...prev.activeModules, [key]: !prev.activeModules[key] } } : prev));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">Configuración del negocio</h2>

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{successMessage}</div>
      )}
      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{errorMessage}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Módulos activos</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {(Object.keys(MODULE_LABELS) as (keyof ActiveModules)[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.activeModules[key]} onChange={() => toggleModule(key)} />
                {MODULE_LABELS[key]}
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Tasas e intereses</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm text-slate-700">
              Tasa mensual por defecto (%)
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={decimalToPercentInput(form.defaultMonthlyInterestRate)}
                onChange={(e) => setForm({ ...form, defaultMonthlyInterestRate: percentInputToDecimal(e.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              Tope de usura, efectivo anual (%)
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={decimalToPercentInput(form.maxLegalRate)}
                onChange={(e) => setForm({ ...form, maxLegalRate: percentInputToDecimal(e.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              Porcentaje prestable por defecto (%)
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.defaultLoanablePercentage}
                onChange={(e) => setForm({ ...form, defaultLoanablePercentage: e.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Plazos</h3>
          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm text-slate-700">
              Plazo por defecto (meses)
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.defaultTermMonths}
                onChange={(e) => setForm({ ...form, defaultTermMonths: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              Días de gracia
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.gracePeriodDays}
                onChange={(e) => setForm({ ...form, gracePeriodDays: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              Antigüedad para remate (meses)
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.forfeitureThresholdMonths}
                onChange={(e) => setForm({ ...form, forfeitureThresholdMonths: Number(e.target.value) })}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Política de mora / redondeo</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-sm text-slate-700">
              Ante tasa que supera el tope de usura
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.usuryCapPolicy}
                onChange={(e) => setForm({ ...form, usuryCapPolicy: e.target.value as TenantConfiguration['usuryCapPolicy'] })}
              >
                {Object.entries(USURY_POLICY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Causación de interés en mora
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.interestAccrualPolicy}
                onChange={(e) =>
                  setForm({ ...form, interestAccrualPolicy: e.target.value as TenantConfiguration['interestAccrualPolicy'] })
                }
              >
                {Object.entries(ACCRUAL_POLICY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Redondeo del interés
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.interestRounding}
                onChange={(e) => setForm({ ...form, interestRounding: e.target.value as TenantConfiguration['interestRounding'] })}
              >
                {Object.entries(ROUNDING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Retención en la fuente</h3>
          <p className="mb-3 text-xs text-slate-500">
            Solo configuración — todavía no se aplica automáticamente a ninguna compra. La tarifa y el piso de UVT
            cambian cada año; confírmalos con tu contador antes de activarla.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.withholdingTaxEnabled}
                onChange={(e) => setForm({ ...form, withholdingTaxEnabled: e.target.checked })}
              />
              Aplica retención en compras
            </label>
            <label className="text-sm text-slate-700">
              Tarifa (%)
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={decimalToPercentInput(form.withholdingTaxRate)}
                onChange={(e) => setForm({ ...form, withholdingTaxRate: percentInputToDecimal(e.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              Monto mínimo de la compra (pesos)
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.withholdingTaxMinBase}
                onChange={(e) => setForm({ ...form, withholdingTaxMinBase: e.target.value })}
              />
            </label>
          </div>
        </section>

        <button
          type="submit"
          disabled={updateConfig.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {updateConfig.isPending ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>
    </div>
  );
}

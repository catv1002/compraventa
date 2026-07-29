import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { formatCOP, formatDate } from '../lib/format';
import { useAuth } from '../lib/auth-context';
import { Modal } from '../components/Modal';

/**
 * Remate de joyas (RN-05, RN-11 · CV-010).
 *
 * El sistema **propone**, la persona **decide**. Esta pantalla nunca remata por
 * antigüedad ni ofrece una acción masiva: lista los candidatos que el servidor
 * calcula con el umbral configurado (`TenantConfiguration.forfeitureThresholdMonths`),
 * la dueña marca uno por uno los que quiere rematar y confirma en un diálogo que
 * dice exactamente lo que va a pasar. Es el mismo flujo observado en el sistema
 * legado (docs/11 §3.3), donde la dueña filtra por antigüedad y selecciona
 * manualmente contrato por contrato.
 *
 * Rematar es irreversible y le quita la joya a una persona: de ahí la doble
 * acción deliberada (casilla de entendimiento + botón) antes de enviar.
 */

interface Cliente {
  id: string;
  fullName: string;
  identificationNumber: string;
}

interface Joya {
  id: string;
  description: string | null;
}

interface Candidato {
  id: string;
  contractNumber: number;
  status: string;
  principalAmount: string;
  createdAt: string;
  dueDate: string | null;
  customer: Cliente;
  item: Joya;
}

/** GET /contracts/forfeiture/candidates */
interface RespuestaCandidatos {
  thresholdMonths: number;
  cutoff: string;
  count: number;
  candidates: Candidato[];
}

interface AtributoJoya {
  key: string;
  value: string;
}

/** GET /items?status=InPledgeCustody — de aquí sale el peso de la joya. */
interface JoyaInventario {
  id: string;
  attributes: AtributoJoya[];
}

/** GET /contracts/:id/quote — importes calculados por el servidor. */
interface Cotizacion {
  currentPrincipal: number;
  interestOwed: number;
  monthsOwed: number;
  settlementTotal: number;
}

// Roles que el backend acepta en GET/POST /contracts/forfeiture/* (@Roles del
// controlador). No es la autorización real —esa la impone el servidor—, sirve
// para explicar en vez de estrellar la pantalla contra un 403.
const ROLES_QUE_REMATAN = ['Admin', 'BranchManager'];

const ESTADO_LABELS: Record<string, string> = {
  Active: 'Vigente',
  Renewed: 'Vigente (renovado)',
  Overdue: 'Vencido',
};

const POR_PAGINA = 20;

/** Antigüedad en meses cumplidos desde la firma. Cálculo presentacional. */
function mesesDesde(fechaIso: string, hoy: Date = new Date()): number {
  const firma = new Date(fechaIso);
  let meses =
    (hoy.getUTCFullYear() - firma.getUTCFullYear()) * 12 + (hoy.getUTCMonth() - firma.getUTCMonth());
  if (hoy.getUTCDate() < firma.getUTCDate()) {
    meses -= 1;
  }
  return Math.max(meses, 0);
}

function textoMeses(meses: number): string {
  return meses === 1 ? '1 mes' : `${meses} meses`;
}

function pesoDeLaJoya(joya: JoyaInventario | undefined): string | null {
  const atributo = joya?.attributes.find((a) => a.key.toLowerCase() === 'weightgrams');
  if (!atributo) {
    return null;
  }
  const gramos = Number(atributo.value);
  if (Number.isNaN(gramos)) {
    return atributo.value;
  }
  return `${gramos.toLocaleString('es-CO', { maximumFractionDigits: 2 })} g`;
}

export function ForfeiturePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const puedeRematar = ROLES_QUE_REMATAN.includes(user?.role ?? '');

  const {
    data: datos,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['forfeiture-candidates'],
    queryFn: () => api.get<RespuestaCandidatos>('/contracts/forfeiture/candidates'),
    enabled: puedeRematar,
  });

  // El peso de la joya no viene en el listado de candidatos (el backend incluye
  // `item` pero no sus atributos dinámicos); se cruza con el inventario en
  // custodia, que sí los trae.
  const { data: joyasEnCustodia } = useQuery({
    queryKey: ['items', 'InPledgeCustody'],
    queryFn: () => api.get<JoyaInventario[]>('/items?status=InPledgeCustody'),
    enabled: puedeRematar,
  });

  const pesosPorJoya = useMemo(() => {
    const mapa = new Map<string, JoyaInventario>();
    joyasEnCustodia?.forEach((j) => mapa.set(j.id, j));
    return mapa;
  }, [joyasEnCustodia]);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [minMeses, setMinMeses] = useState('');
  const [pagina, setPagina] = useState(0);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [entiendeConsecuencias, setEntiendeConsecuencias] = useState(false);
  const [rematados, setRematados] = useState<number[] | null>(null);

  const candidatos = datos?.candidates ?? [];

  // El umbral base lo fija el servidor (parámetro de configuración); aquí solo
  // se puede estrechar más, nunca duplicarlo como constante del frontend.
  const umbral = datos?.thresholdMonths ?? 0;
  const minEfectivo = minMeses === '' ? umbral : Math.max(Number(minMeses), umbral);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return candidatos.filter((c) => {
      if (mesesDesde(c.createdAt) < minEfectivo) {
        return false;
      }
      if (!texto) {
        return true;
      }
      return (
        c.customer.fullName.toLowerCase().includes(texto) ||
        c.customer.identificationNumber.toLowerCase().includes(texto) ||
        String(c.contractNumber).includes(texto) ||
        (c.item.description ?? '').toLowerCase().includes(texto)
      );
    });
  }, [candidatos, busqueda, minEfectivo]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const visibles = filtrados.slice(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA);

  const seleccionados = useMemo(
    () => candidatos.filter((c) => seleccion.has(c.id)),
    [candidatos, seleccion],
  );
  // Suma presentacional del capital ya prestado, para dimensionar la decisión.
  // No es un importe a cobrar: rematar no mueve caja.
  const capitalSeleccionado = seleccionados.reduce((total, c) => total + Number(c.principalAmount), 0);

  const rematar = useMutation({
    mutationFn: (contractIds: string[]) =>
      api.post<{ forfeited: string[] }>('/contracts/forfeiture/process', { contractIds }),
    // El backend procesa contrato por contrato y sin transacción: si uno falla,
    // los anteriores ya quedaron rematados. Por eso se refresca pase lo que pase.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['forfeiture-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  function alternar(id: string) {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (siguiente.has(id)) {
        siguiente.delete(id);
      } else {
        siguiente.add(id);
      }
      return siguiente;
    });
    setRematados(null);
  }

  function abrirConfirmacion() {
    setEntiendeConsecuencias(false);
    setRematados(null);
    rematar.reset();
    setModalAbierto(true);
  }

  function confirmarRemate() {
    const numeroPorId = new Map(seleccionados.map((c) => [c.id, c.contractNumber]));
    rematar.mutate(
      seleccionados.map((c) => c.id),
      {
        onSuccess: (respuesta) => {
          setRematados(
            respuesta.forfeited
              .map((id) => numeroPorId.get(id))
              .filter((n): n is number => typeof n === 'number'),
          );
          setSeleccion(new Set());
          setModalAbierto(false);
          setEntiendeConsecuencias(false);
        },
      },
    );
  }

  if (!puedeRematar) {
    return (
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Remate de joyas</h2>
        <p className="mb-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu usuario ({user?.role ?? 'sin rol'}) no puede rematar contratos. El remate es una decisión de
          Gerencia: solo los usuarios con rol Administrador o Gerente de sucursal pueden ver los candidatos y
          procesarlos. Pídele a Gerencia que revise este listado.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Remate de joyas</h2>
      <p className="mb-4 max-w-3xl text-xs text-slate-500">
        El sistema propone los contratos con más antigüedad; la decisión de rematar es de Gerencia y se toma
        contrato por contrato. Nada se remata solo.
      </p>

      {isLoading && <p className="text-sm text-slate-500">Consultando candidatos…</p>}

      {isError && (
        <p className="mb-4 text-sm text-red-600">{(error as ApiError).message}</p>
      )}

      {datos && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs text-slate-500">Umbral configurado</p>
              <p className="font-semibold text-slate-800">{textoMeses(datos.thresholdMonths)} desde la firma</p>
              <p className="text-xs text-slate-500">
                Se listan los contratos firmados el {formatDate(datos.cutoff)} o antes. El umbral es un
                parámetro de la configuración del negocio; se cambia allí, no en esta pantalla.
              </p>
            </div>
            <div>
              <label htmlFor="min-meses" className="block text-xs text-slate-500">
                Ver solo con al menos
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="min-meses"
                  type="number"
                  min={datos.thresholdMonths}
                  value={minMeses}
                  onChange={(e) => {
                    setMinMeses(e.target.value);
                    setPagina(0);
                  }}
                  placeholder={String(datos.thresholdMonths)}
                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-sm text-slate-600">meses de antigüedad</span>
              </div>
            </div>
            <div className="flex-1">
              <label htmlFor="buscar-candidato" className="block text-xs text-slate-500">
                Buscar
              </label>
              <input
                id="buscar-candidato"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setPagina(0);
                }}
                placeholder="Cliente, cédula, N.º de contrato o joya"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          {rematados && (
            <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {rematados.length === 1
                ? 'Se remató 1 contrato'
                : `Se remataron ${rematados.length} contratos`}
              : N.º {rematados.join(', N.º ')}. Las joyas quedaron en inventario del negocio y los contratos
              bloqueados para el mostrador.
            </p>
          )}

          {rematar.isError && (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(rematar.error as ApiError).message} — el proceso se detuvo en ese contrato; los anteriores de
              la selección sí pudieron quedar rematados. Revisa el listado, que ya está actualizado.
            </p>
          )}

          {filtrados.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              {candidatos.length === 0
                ? `No hay contratos vigentes con ${textoMeses(datos.thresholdMonths)} o más desde la firma.`
                : 'Ningún candidato coincide con el filtro.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <th scope="col" className="px-3 py-2">N.º</th>
                    <th scope="col" className="px-3 py-2">Cliente</th>
                    <th scope="col" className="px-3 py-2">Firma / antigüedad</th>
                    <th scope="col" className="px-3 py-2">Estado</th>
                    <th scope="col" className="px-3 py-2 text-right">Capital prestado</th>
                    <th scope="col" className="px-3 py-2 text-right">Intereses acumulados</th>
                    <th scope="col" className="px-3 py-2">Joya</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((candidato) => (
                    <FilaCandidato
                      key={candidato.id}
                      candidato={candidato}
                      peso={pesoDeLaJoya(pesosPorJoya.get(candidato.item.id))}
                      seleccionado={seleccion.has(candidato.id)}
                      bloqueado={rematar.isPending}
                      onAlternar={() => alternar(candidato.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              {filtrados.length} candidato{filtrados.length === 1 ? '' : 's'}
              {filtrados.length !== candidatos.length && ` de ${candidatos.length}`}
            </span>
            {totalPaginas > 1 && (
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setPagina(paginaActual - 1)}
                  disabled={paginaActual === 0}
                  className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
                >
                  Anteriores
                </button>
                <span>
                  Página {paginaActual + 1} de {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina(paginaActual + 1)}
                  disabled={paginaActual >= totalPaginas - 1}
                  className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
                >
                  Siguientes
                </button>
              </span>
            )}
          </div>

          {seleccionados.length > 0 && (
            <div className="sticky bottom-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-lg">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {seleccionados.length} contrato{seleccionados.length === 1 ? '' : 's'} seleccionado
                  {seleccionados.length === 1 ? '' : 's'} para rematar
                </p>
                <p className="text-xs text-slate-500">
                  Capital prestado en juego: <span className="font-semibold">{formatCOP(capitalSeleccionado)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSeleccion(new Set())}
                  disabled={rematar.isPending}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Quitar selección
                </button>
                <button
                  onClick={abrirConfirmacion}
                  disabled={rematar.isPending}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Revisar y rematar…
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {modalAbierto && (
        <Modal
          title={`Rematar ${seleccionados.length} contrato${seleccionados.length === 1 ? '' : 's'}`}
          onClose={() => {
            if (!rematar.isPending) {
              setModalAbierto(false);
            }
          }}
        >
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
              <p className="font-semibold">Esta operación no se puede deshacer.</p>
              <p className="mt-1">
                Al rematar, {seleccionados.length === 1 ? 'la joya pasa' : 'las joyas pasan'} a ser propiedad
                del negocio y {seleccionados.length === 1 ? 'entra' : 'entran'} al inventario para la venta. El
                cliente pierde el derecho a recuperar{seleccionados.length === 1 ? 'la' : 'las'} pagando, y el
                contrato queda bloqueado: no se le podrán recibir más intereses ni liquidarlo.
              </p>
            </div>

            <p className="text-xs text-slate-600">
              Antes de rematar debe haberse avisado al cliente con al menos 15 días de anticipación (art. 1943
              del Código Civil). El sistema todavía no registra ese aviso: verifícalo por fuera.
            </p>

            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th scope="col" className="px-2 py-1">N.º</th>
                    <th scope="col" className="px-2 py-1">Cliente</th>
                    <th scope="col" className="px-2 py-1">Joya</th>
                    <th scope="col" className="px-2 py-1 text-right">Capital</th>
                  </tr>
                </thead>
                <tbody>
                  {seleccionados.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-mono">{c.contractNumber}</td>
                      <td className="px-2 py-1">{c.customer.fullName}</td>
                      <td className="px-2 py-1 text-slate-600">{c.item.description ?? 'Sin descripción'}</td>
                      <td className="px-2 py-1 text-right">{formatCOP(c.principalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-slate-700">
              Capital prestado en juego: <span className="font-semibold">{formatCOP(capitalSeleccionado)}</span>
            </p>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={entiendeConsecuencias}
                onChange={(e) => setEntiendeConsecuencias(e.target.checked)}
                className="mt-1"
              />
              <span>
                Entiendo que {seleccionados.length === 1 ? 'esta joya deja' : 'estas joyas dejan'} de ser del
                cliente y que el remate no se puede deshacer.
              </span>
            </label>

            {rematar.isError && (
              <p className="text-sm text-red-600">{(rematar.error as ApiError).message}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalAbierto(false)}
                disabled={rematar.isPending}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRemate}
                disabled={!entiendeConsecuencias || rematar.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rematar.isPending
                  ? 'Rematando…'
                  : `Rematar ${seleccionados.length} contrato${seleccionados.length === 1 ? '' : 's'} definitivamente`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Una fila del listado. Los intereses acumulados no vienen en el listado de
 * candidatos, así que cada fila visible consulta el estado de cuenta del
 * servidor (`GET /contracts/:id/quote`) — nunca se calculan aquí. Solo se pide
 * para las filas de la página actual, para no disparar una petición por cada
 * contrato del histórico.
 */
function FilaCandidato({
  candidato,
  peso,
  seleccionado,
  bloqueado,
  onAlternar,
}: {
  candidato: Candidato;
  peso: string | null;
  seleccionado: boolean;
  bloqueado: boolean;
  onAlternar: () => void;
}) {
  const { data: cuenta, isLoading } = useQuery({
    queryKey: ['contract-quote', candidato.id],
    queryFn: () => api.get<Cotizacion>(`/contracts/${candidato.id}/quote`),
  });

  const meses = mesesDesde(candidato.createdAt);
  const vencido = candidato.status === 'Overdue';

  return (
    <tr className={`border-b border-slate-100 last:border-0 ${seleccionado ? 'bg-slate-50' : ''}`}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={seleccionado}
          disabled={bloqueado}
          onChange={onAlternar}
          aria-label={`Seleccionar para rematar el contrato N.º ${candidato.contractNumber} de ${candidato.customer.fullName}`}
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-600">{candidato.contractNumber}</td>
      <td className="px-3 py-2">
        <span className="font-medium text-slate-800">{candidato.customer.fullName}</span>
        <span className="block text-xs text-slate-500">C.C. {candidato.customer.identificationNumber}</span>
      </td>
      <td className="px-3 py-2 text-slate-700">
        {formatDate(candidato.createdAt)}
        <span className="block text-xs text-slate-500">{textoMeses(meses)} desde la firma</span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            vencido ? 'bg-amber-100 text-amber-800' : 'text-slate-600'
          }`}
        >
          {ESTADO_LABELS[candidato.status] ?? candidato.status}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-medium text-slate-800">
        {formatCOP(candidato.principalAmount)}
      </td>
      <td className="px-3 py-2 text-right">
        {isLoading || !cuenta ? (
          <span className="text-xs text-slate-400">calculando…</span>
        ) : (
          <>
            <span className="font-medium text-slate-800">{formatCOP(cuenta.interestOwed)}</span>
            <span className="block text-xs text-slate-500">
              {cuenta.monthsOwed === 0 ? 'al día' : `${textoMeses(cuenta.monthsOwed)} sin pagar`}
            </span>
          </>
        )}
      </td>
      <td className="px-3 py-2 text-slate-700">
        {candidato.item.description ?? 'Sin descripción'}
        <span className="block text-xs text-slate-500">{peso ?? 'peso no registrado'}</span>
      </td>
    </tr>
  );
}

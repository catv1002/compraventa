import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api-client';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  // El cliente de API manda aquí cuando el token expira o deja de ser válido, y
  // guarda a dónde iba el operador para devolverlo a esa misma pantalla.
  const [searchParams] = useSearchParams();
  const sesionExpirada = searchParams.get('expirada') === '1';
  const destino = searchParams.get('redirect');
  const [email, setEmail] = useState('admin@compraventa.demo');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password, mfaCode || undefined);
      if (result.mfaSetupRequired) {
        navigate('/perfil/mfa');
      } else {
        // Vuelve a donde estaba antes de que se le cayera la sesión. Solo rutas
        // internas: un `redirect` a otro dominio sería un salto abierto.
        navigate(destino?.startsWith('/') ? destino : '/');
      }
    } catch (err) {
      if (err instanceof ApiError && err.data?.mfaRequired) {
        setMfaRequired(true);
        setError(mfaRequired ? 'Código MFA inválido, intenta de nuevo' : 'Ingresa el código de tu app de autenticación');
      } else {
        setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Compraventa</h1>
        <p className="mb-6 text-sm text-slate-500">Inicia sesión para continuar</p>

        {sesionExpirada && (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Tu sesión se venció. Vuelve a entrar y sigues donde ibas.
          </p>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={mfaRequired}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          required
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={mfaRequired}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          required
        />

        {mfaRequired && (
          <>
            <label className="mb-1 block text-sm font-medium text-slate-700">Código de autenticación (MFA)</label>
            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
              autoFocus
              className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </>
        )}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

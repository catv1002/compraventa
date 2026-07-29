import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';

interface SetupResponse {
  otpauthUrl: string;
  qrDataUrl: string;
}

export function MfaSetupPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startSetup = useMutation({
    mutationFn: () => api.post<SetupResponse>('/auth/mfa/setup'),
    onSuccess: setSetup,
  });

  const enable = useMutation({
    mutationFn: () => api.post<{ mfaEnabled: boolean }>('/auth/mfa/enable', { code }),
    onSuccess: () => {
      const stored = localStorage.getItem('user');
      if (stored) {
        localStorage.setItem('user', JSON.stringify({ ...JSON.parse(stored), mfaEnabled: true }));
      }
      refreshUser();
      navigate('/');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Código inválido'),
  });

  function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    enable.mutate();
  }

  if (user?.mfaEnabled) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-700">MFA ya está activo para tu cuenta.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-2 text-lg font-semibold text-slate-800">Configurar autenticación de dos pasos</h2>
      <p className="mb-4 text-sm text-slate-500">
        Tu rol requiere MFA activo (ver docs/10-roadmap.md, Fase 2). Escanea el código con Google
        Authenticator, Authy o similar, y confirma con el código generado.
      </p>

      {!setup ? (
        <button
          onClick={() => startSetup.mutate()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Generar código QR
        </button>
      ) : (
        <form onSubmit={handleVerify}>
          <img src={setup.qrDataUrl} alt="Código QR MFA" className="mb-4 h-40 w-40" />
          <label className="mb-1 block text-sm font-medium text-slate-700">Código de 6 dígitos</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={enable.isPending}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Activar MFA
          </button>
        </form>
      )}
    </div>
  );
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  return localStorage.getItem('accessToken');
}

export class ApiError extends Error {
  constructor(message: string, public readonly data: any, public readonly status?: number) {
    super(message);
  }
}

/**
 * Sesión inválida o expirada: se limpia y se manda al login.
 *
 * Por qué existe: el token dura 15 minutos y además deja de valer si rota el
 * secreto de firma del servidor. Sin esto, la aplicación se queda mostrando
 * "Unauthorized" en cada pantalla —con la sesión muerta guardada en
 * localStorage— y el operador no tiene ninguna forma de saber que lo único que
 * necesita es volver a entrar. En un mostrador con el cliente enfrente eso es
 * una llamada al soporte.
 *
 * La redirección es un `location.assign` y no el router de React porque este
 * módulo no vive dentro del árbol de componentes; además interesa descartar
 * cualquier estado en memoria que se haya poblado con la sesión anterior.
 */
function cerrarSesionExpirada(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  if (window.location.pathname !== '/login') {
    // `redirect` conserva a dónde iba, para volver ahí después de entrar.
    const destino = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?expirada=1&redirect=${encodeURIComponent(destino)}`);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Evita la página de advertencia HTML de ngrok en túneles free tier.
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    const message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Error de red');

    // Un 401 en el login no es una sesión expirada: son credenciales malas o un
    // código MFA pendiente, y esa pantalla necesita mostrar el mensaje tal cual.
    const esLogin = path.startsWith('/auth/login');
    if (response.status === 401 && !esLogin && token) {
      cerrarSesionExpirada();
    }

    throw new ApiError(message, body, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
};

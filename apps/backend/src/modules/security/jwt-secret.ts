/**
 * Resolución del secreto de firma de los JWT.
 *
 * Por qué existe: el código caía a un literal (`'change-me-in-production'`)
 * cuando `JWT_SECRET` no estaba definido, y el `.env` del repo traía ese mismo
 * placeholder copiado del `.env.example`. Con un secreto conocido, cualquiera
 * firma un token con `role: Admin` y el `tenantId` que quiera: es el fallo más
 * grave posible en un sistema multi-tenant que mueve dinero, y es silencioso —
 * la aplicación arranca y funciona igual de bien.
 *
 * Por eso aquí no hay valor por defecto: si el secreto falta o es un
 * placeholder conocido, el proceso **no arranca**. Un despliegue que se cae al
 * arrancar es un incidente de diez minutos; uno que arranca con la puerta
 * abierta no se descubre hasta que ya pasó algo.
 *
 * Ver `.claude/skills/seguridad-aplicacion/SKILL.md`.
 */

/** Valores que alguna vez estuvieron en el repo o en el `.env.example`. */
const SECRETOS_PROHIBIDOS = new Set(['change-me-in-production', 'secret', 'changeme', '']);

const LONGITUD_MINIMA = 32;

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET?.trim() ?? '';

  if (SECRETOS_PROHIBIDOS.has(secret)) {
    throw new Error(
      'JWT_SECRET no está configurado o conserva el valor de ejemplo. ' +
        'Genera uno con `openssl rand -base64 48` y ponlo en apps/backend/.env. ' +
        'El proceso no arranca con un secreto conocido: cualquiera podría firmar un token de Admin.',
    );
  }

  if (secret.length < LONGITUD_MINIMA) {
    throw new Error(
      `JWT_SECRET es demasiado corto (${secret.length} caracteres, mínimo ${LONGITUD_MINIMA}). ` +
        'Genera uno con `openssl rand -base64 48`.',
    );
  }

  return secret;
}

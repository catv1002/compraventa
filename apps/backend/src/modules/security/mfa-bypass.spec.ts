import { isMfaBypassed } from './auth.service';

/**
 * El bypass de MFA es una comodidad de desarrollo que, mal puesta, apaga un
 * control de seguridad en producción. Estas pruebas fijan que haga falta pedirlo
 * explícitamente y que el entorno de producción lo ignore pase lo que pase.
 */
describe('isMfaBypassed', () => {
  const original = { bypass: process.env.MFA_BYPASS, nodeEnv: process.env.NODE_ENV };

  afterEach(() => {
    process.env.MFA_BYPASS = original.bypass;
    process.env.NODE_ENV = original.nodeEnv;
  });

  const escenario = (bypass: string | undefined, nodeEnv: string | undefined) => {
    if (bypass === undefined) delete process.env.MFA_BYPASS;
    else process.env.MFA_BYPASS = bypass;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    return isMfaBypassed();
  };

  it('se activa en local solo cuando se pide explícitamente', () => {
    expect(escenario('true', 'development')).toBe(true);
    expect(escenario('true', undefined)).toBe(true);
  });

  it('NO se activa por el simple hecho de no estar en producción', () => {
    expect(escenario(undefined, 'development')).toBe(false);
    expect(escenario('false', 'development')).toBe(false);
  });

  it('producción lo ignora aunque la variable esté puesta', () => {
    expect(escenario('true', 'production')).toBe(false);
  });

  it('no acepta valores ambiguos como activación', () => {
    // Evita que un `MFA_BYPASS=1` o `MFA_BYPASS=yes` copiado de otro proyecto
    // apague la verificación sin que nadie lo note.
    expect(escenario('1', 'development')).toBe(false);
    expect(escenario('yes', 'development')).toBe(false);
    expect(escenario('TRUE', 'development')).toBe(false);
  });
});

import { resolveJwtSecret } from './jwt-secret';

// Estas pruebas cuidan un control de seguridad, no una función: lo que se está
// protegiendo es que nadie devuelva el valor por defecto "para que arranque
// local" sin darse cuenta de que eso permite firmar un token de Admin.

// Valor sintético a propósito: describe su propia forma y no se parece a
// ningún secreto real. Nunca pegues aquí un fragmento del secreto de un
// entorno — un repositorio es para siempre.
const secretoValido = 'secreto-de-prueba-suficientemente-largo-para-pasar-el-minimo';

describe('resolveJwtSecret', () => {
  it('devuelve el secreto cuando es fuerte', () => {
    expect(resolveJwtSecret({ JWT_SECRET: secretoValido } as NodeJS.ProcessEnv)).toBe(secretoValido);
  });

  it('aborta si el secreto no está definido', () => {
    expect(() => resolveJwtSecret({} as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET no está configurado/);
  });

  it('aborta si conserva el placeholder del .env.example', () => {
    expect(() =>
      resolveJwtSecret({ JWT_SECRET: 'change-me-in-production' } as NodeJS.ProcessEnv),
    ).toThrow(/valor de ejemplo/);
  });

  it('aborta con secretos triviales', () => {
    for (const trivial of ['', '   ', 'secret', 'changeme']) {
      expect(() => resolveJwtSecret({ JWT_SECRET: trivial } as NodeJS.ProcessEnv)).toThrow();
    }
  });

  it('aborta si el secreto es demasiado corto para ser aleatorio', () => {
    expect(() => resolveJwtSecret({ JWT_SECRET: 'abc123' } as NodeJS.ProcessEnv)).toThrow(
      /demasiado corto/,
    );
  });
});

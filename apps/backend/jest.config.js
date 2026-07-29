/**
 * Pruebas del backend (CV-014).
 *
 * El objetivo declarado en docs/12 es que "el pipeline falle si una regla de
 * dinero se rompe". Por eso el foco inicial son las reglas puras de dominio
 * (motor de intereses), que no necesitan base de datos y por tanto no tienen
 * excusa para no estar cubiertas.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};

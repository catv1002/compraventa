---
name: levantamiento-cliente
description: Convierte material crudo de campo (transcripciones de audio, capturas, notas de visita, llamadas con el cliente) en documentación del repo — fuente íntegra en docs/fuentes/, documento derivado que separa hecho de inferencia, IDs estables RN-xx/D-xx/CV-xxx, nivel de confianza y evidencia textual por regla, y sección final de vacíos. Úsala al recibir una transcripción, un audio, capturas del sistema legado o notas de una sesión con el negocio, o al actualizar docs/11 y docs/12.
---

# Levantamiento de campo → documentación

Ejemplo canónico a imitar, léelo antes de escribir:
[docs/fuentes/2026-07-transcripcion-carrera113.md](../../../docs/fuentes/2026-07-transcripcion-carrera113.md) (fuente cruda) →
[docs/11-levantamiento-campo-carrera113.md](../../../docs/11-levantamiento-campo-carrera113.md) (documento derivado).

## Regla rectora

Toda afirmación del documento derivado debe poder **rastrearse hasta un fragmento literal** de la
fuente cruda. Si no hay cita, es inferencia y se marca como tal. Nunca "limpies" la realidad para
que encaje con el diseño ya documentado: cuando choquen, gana lo observado y se abre una fila en la
tabla de divergencias.

## Paso 1 — Guardar la fuente cruda íntegra

Archivo nuevo en `docs/fuentes/` con nombre `AAAA-MM-<tipo>-<cliente>.md`
(p. ej. `2026-07-transcripcion-carrera113.md`). Encabezado obligatorio en blockquote, con estos
cuatro bloques:

- **Qué es esto**: tipo de material, quién participó, contexto de la sesión y qué documentos
  derivados salen de aquí (enlace relativo `../11-...md`).
- **Calidad**: honestidad brutal sobre el medio. Ejemplo real: *"transcripción sin editar, generada
  por ASR... errores de reconocimiento (p. ej. 'pollas' = 'joyas', 'lucidar' = 'liquidar')"*.
  Lista el glosario de errores frecuentes. **No corrijas el texto**: se deja tal cual para que toda
  interpretación sea rastreable.
- **Material faltante**: lo que no se pudo capturar (video perdido, capturas pendientes).
- **Fecha de incorporación**: `AAAA-MM-DD`.

Después, la transcripción/notas bajo un `## Transcripción` o `## Notas`, sin editar.

## Paso 2 — Documento derivado

Numerado en `docs/` (`11-`, `12-`, …), con encabezado que declare:
`> **Fuente primaria**: enlace a docs/fuentes/...`,
`> **Naturaleza del documento**: descriptivo, no prescriptivo` (las decisiones de diseño van al
gap-analysis/backlog),
`> **Confianza**: alta para X, media para Y, baja para todo lo marcado *[por confirmar]*`.

Secciones, en este orden:

1. **Contexto del negocio** — tabla de personas/roles y qué puede hacer cada una hoy; alcance real
   del negocio (qué hacen de verdad vs. qué menús tiene el software).
2. **Reglas de negocio observadas** — tabla `| # | Regla | Evidencia | Confianza |` con IDs
   `RN-01`, `RN-02`… La columna Evidencia es **cita textual entre comillas y en cursiva**, tomada de
   la fuente. La confianza es Alta / Media / Baja, y toda Media o Baja lleva `**Media — por confirmar**`.
3. **Flujos operativos observados** — un diagrama Mermaid `flowchart TD` del ciclo diario más prosa
   por subflujo (caja, remate, anulaciones, integraciones).
4. **Dolores identificados (voz del usuario)** — tabla `| # | Dolor | Impacto | Cita |` con IDs
   `D-01`, `D-02`… El impacto es Bajo/Medio/Alto/**Crítico** y va justificado en una frase.
5. **Contraste con el diseño ya documentado** — dos bloques: coincidencias que **validan** (con
   enlaces a docs/02 y docs/03) y una tabla de divergencias
   `| Diseño actual | Realidad observada | Acción |`.
6. **Vacíos por cerrar** — lista numerada de preguntas abiertas concretas. Cerrar siempre con esta
   sección; un documento de levantamiento sin vacíos está mintiendo.

## IDs estables

| Prefijo | Qué identifica | Dónde vive |
|---|---|---|
| `RN-xx` | Regla de negocio observada | tabla §2 del doc de levantamiento (`docs/11`) |
| `D-xx` | Dolor del usuario | tabla §4 del doc de levantamiento |
| `CV-xxx` | Ítem de backlog derivado | `docs/12-gap-analysis-y-backlog.md` |

Los IDs son **inmutables**: nunca renumeres ni reutilices. Si una regla se invalida, se deja la fila
y se marca como derogada indicando qué la reemplaza. Los ítems `CV-xxx` citan los `RN-xx`/`D-xx` que
los originan, y el código y los commits pueden referenciarlos igual (`RN-03`, `CV-014`).

## Hecho observado vs. inferencia

- **Hecho observado** = visto en pantalla o dicho explícitamente → confianza Alta, con cita.
- **Referido verbalmente sin captura** → confianza Media.
- **Inferido de un ejemplo** → confianza Media + `[por confirmar]`, y la columna Evidencia dice
  "Inferido del flujo ..." en vez de una cita (ver RN-13 en docs/11).
- **Ambiguo** → explica la ambigüedad en la propia fila (ver RN-14: *"puede significar 'se marca
  anulado' y no 'se libera'"*) y añade la pregunta a §6.

Nunca conviertas una inferencia en regla implementable sin confirmarla con el cliente. La skill
`reglas-negocio-empeno` lista los "no asumir" vigentes; si tu levantamiento cierra uno de esos
puntos, actualiza también esa skill.

## Al terminar

- [ ] Fuente cruda íntegra en `docs/fuentes/` con nota de calidad, material faltante y fecha
- [ ] Documento derivado con las 6 secciones, enlazando a la fuente y esta a él
- [ ] Cada `RN-xx` con cita textual y nivel de confianza; cada `D-xx` con impacto y cita
- [ ] Divergencias contra docs/02 y docs/03 explicitadas con acción
- [ ] Sección de vacíos y preguntas abiertas, numerada
- [ ] Índice de [docs/README.md](../../../docs/README.md) actualizado con la entrada nueva
- [ ] Si el material altera una invariante, actualizar `docs/12-gap-analysis-y-backlog.md` (referenciado desde docs/11 y desde la fuente, pero **aún no existe** — créalo con el mismo esquema de IDs `CV-xxx` si te toca escribirlo)

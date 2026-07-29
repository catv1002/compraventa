import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:entity';

export interface AuditMetadata {
  entity: string;
  action: string;
  /**
   * Recuperar el estado previo de la entidad antes de ejecutar el handler, para
   * que el AuditLog guarde `oldValue` además de `newValue`. Requiere que la ruta
   * tenga `:id`.
   *
   * Sin esto la auditoría solo dice "quedó así", no "cambió de esto a esto" —
   * que es exactamente lo que hace falta para revisar una corrección de contrato
   * (CV-003) y lo que faltaba en el interceptor original (CV-017).
   */
  capturePrevious?: boolean;
}

// Marca un endpoint de escritura para que el AuditInterceptor genere un AuditLog
// automáticamente a partir de la respuesta. Ver docs/05-multisucursal-auditoria.md.
export const Audited = (entity: string, action: string, options: { capturePrevious?: boolean } = {}) =>
  SetMetadata(AUDIT_KEY, { entity, action, ...options } satisfies AuditMetadata);

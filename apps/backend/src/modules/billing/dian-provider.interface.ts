// Puerto hacia un proveedor tecnológico autorizado DIAN (Resolución 000165/2023).
// La implementación real requiere una cuenta paga con un proveedor (ej. Factus,
// Alegra, el software gratuito de la DIAN) — no incluida en este scaffold.
// Ver docs/01-investigacion-negocio.md (1. Marco legal) y
// docs/08-arquitectura-tecnica.md. Reemplazar MockDianProvider por un adapter
// real implementando esta misma interfaz antes de ir a producción.
export interface DianSubmissionResult {
  cufe: string;
  accepted: boolean;
}

export interface DianProvider {
  submitInvoice(invoice: { id: string; total: number; vatTotal: number }): Promise<DianSubmissionResult>;
}

export const DIAN_PROVIDER = 'DIAN_PROVIDER';

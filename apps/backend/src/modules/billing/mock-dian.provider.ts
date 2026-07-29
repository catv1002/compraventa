import { Injectable, Logger } from '@nestjs/common';
import { DianProvider, DianSubmissionResult } from './dian-provider.interface';

// Implementación de desarrollo/demo — NO envía nada a la DIAN real. Genera un
// CUFE simulado para que el resto del sistema (frontend, reportes) pueda
// operar como si la factura estuviera emitida. Sustituir por un adapter real
// antes de producción — ver dian-provider.interface.ts.
@Injectable()
export class MockDianProvider implements DianProvider {
  private readonly logger = new Logger(MockDianProvider.name);

  async submitInvoice(invoice: { id: string; total: number; vatTotal: number }): Promise<DianSubmissionResult> {
    this.logger.warn(
      `MockDianProvider: simulando emisión de factura ${invoice.id} — reemplazar por proveedor DIAN real antes de producción`,
    );
    const fakeCufe = `MOCK-${invoice.id.slice(0, 8)}-${Date.now()}`;
    return { cufe: fakeCufe, accepted: true };
  }
}

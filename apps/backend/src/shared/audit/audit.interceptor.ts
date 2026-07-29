import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, concatMap } from 'rxjs';
import { AUDIT_KEY, AuditMetadata } from './audited.decorator';
import { AuditService } from './audit.service';
import { AuthenticatedUser } from '../../modules/security/current-user.decorator';

// Interceptor global: cualquier endpoint marcado con @Audited(...) genera un
// AuditLog inmutable tras una respuesta exitosa, en la misma request que la
// operación de negocio (no en un job aparte). Ver docs/05-multisucursal-auditoria.md.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    // El estado anterior hay que leerlo ANTES de ejecutar el handler: después ya
    // está pisado. Si la lectura falla no se aborta la operación —dejar al
    // cliente esperando en el mostrador por un problema de auditoría es peor—
    // pero queda constancia de que no se pudo capturar.
    let oldValue: unknown = undefined;
    if (meta.capturePrevious && request.params?.id) {
      try {
        oldValue = await this.auditService.loadSnapshot(meta.entity, request.params.id);
      } catch (error) {
        this.logger.error(
          `No se pudo capturar el estado previo de ${meta.entity} ${request.params.id}: ${error}`,
        );
      }
    }

    return next.handle().pipe(
      // concatMap, en vez del `tap` con `void` anterior, espera realmente a que
      // el AuditLog se escriba. Antes, si el registro fallaba, la operación se
      // reportaba exitosa y el rastro simplemente no existía.
      concatMap((responseBody: any) =>
        from(
          this.auditService
            .record({
              userId: user?.userId,
              branchId: user?.homeBranchId,
              entity: meta.entity,
              entityId: responseBody?.id ?? request.params?.id ?? 'unknown',
              action: meta.action,
              oldValue,
              newValue: responseBody,
            })
            .then(() => responseBody)
            .catch((error) => {
              // Limitación conocida: la operación de negocio ya se confirmó en su
              // propia transacción, así que esto NO la revierte. Lo que garantiza
              // es que nadie reciba un 200 sobre una operación sin rastro — el
              // descuadre queda visible en vez de silencioso. La atomicidad real
              // exige escribir el AuditLog dentro de la transacción de negocio,
              // que sigue pendiente (docs/12, CV-017).
              this.logger.error(
                `AUDITORÍA FALLIDA — ${meta.action} sobre ${meta.entity} ` +
                  `${responseBody?.id ?? request.params?.id}: ${error}`,
              );
              throw new InternalServerErrorException(
                'La operación se ejecutó pero no se pudo registrar en la auditoría. Verifíquela antes de continuar.',
              );
            }),
        ),
      ),
    );
  }
}

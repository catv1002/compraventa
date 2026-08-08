import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from './current-user.decorator';

// Roles de aprobación que deben tener MFA activo — ver docs/10-roadmap.md (Fase 2).
export const MFA_REQUIRED_ROLES: UserRole[] = [UserRole.Admin, UserRole.BranchManager];

/**
 * ¿Se omite la verificación del código MFA en este arranque?
 *
 * Solo cuando se cumplen **las dos** condiciones a la vez:
 *   1. `MFA_BYPASS=true` — hay que pedirlo explícitamente, no basta con no estar
 *      en producción. Un despliegue mal configurado no lo activa por descuido.
 *   2. `NODE_ENV` distinto de `production` — aunque alguien ponga la variable en
 *      un servidor real, ahí no tiene efecto.
 *
 * Sirve para no tener que sacar el teléfono en cada login mientras se desarrolla.
 * No desactiva MFA en la base: `mfaEnabled` sigue igual y el flujo de activación
 * y desactivación sigue exigiendo un código válido — lo único que se omite es la
 * verificación del código durante el login local.
 */
export function isMfaBypassed(): boolean {
  return process.env.MFA_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    if (process.env.MFA_BYPASS === 'true' && process.env.NODE_ENV === 'production') {
      // No se lanza excepción para no dejar el negocio sin sistema por una
      // variable mal puesta, pero tiene que ser imposible no verlo en el log.
      this.logger.error(
        'MFA_BYPASS=true está IGNORADO porque NODE_ENV=production. Quita esa variable del entorno.',
      );
    }
  }

  async login(email: string, password: string, mfaCode?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.mfaEnabled && !isMfaBypassed()) {
      if (!mfaCode) {
        throw new UnauthorizedException({ message: 'Se requiere código MFA', mfaRequired: true });
      }
      const valid = authenticator.verify({ token: mfaCode, secret: user.mfaSecret! });
      if (!valid) {
        throw new UnauthorizedException({ message: 'Código MFA inválido', mfaRequired: true });
      }
    } else if (user.mfaEnabled) {
      this.logger.warn(`[MFA_BYPASS] login de ${user.email} sin verificar el código — solo desarrollo`);
    }

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      homeBranchId: user.homeBranchId,
      role: user.role,
      email: user.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      // Con el bypass activo tampoco se empuja a la pantalla de configuración:
      // en local no tiene sentido obligar a montar un autenticador.
      mfaSetupRequired: MFA_REQUIRED_ROLES.includes(user.role) && !user.mfaEnabled && !isMfaBypassed(),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        homeBranchId: user.homeBranchId,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  async setupMfa(currentUser: AuthenticatedUser) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: currentUser.userId }, data: { mfaSecret: secret } });

    const otpauthUrl = authenticator.keyuri(currentUser.email, 'Compraventa', secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    return { otpauthUrl, qrDataUrl };
  }

  async enableMfa(currentUser: AuthenticatedUser, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.userId } });
    if (!user?.mfaSecret) {
      throw new BadRequestException('Primero debes iniciar la configuración de MFA');
    }

    const valid = authenticator.verify({ token: code, secret: user.mfaSecret });
    if (!valid) {
      throw new BadRequestException('Código MFA inválido');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    return { mfaEnabled: true };
  }

  async disableMfa(currentUser: AuthenticatedUser, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.userId } });
    if (!user?.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA no está activo');
    }

    const valid = authenticator.verify({ token: code, secret: user.mfaSecret });
    if (!valid) {
      throw new BadRequestException('Código MFA inválido');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
    return { mfaEnabled: false };
  }
}

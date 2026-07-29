import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from './current-user.decorator';

// Roles de aprobación que deben tener MFA activo — ver docs/10-roadmap.md (Fase 2).
export const MFA_REQUIRED_ROLES: UserRole[] = [UserRole.Admin, UserRole.BranchManager, UserRole.Accountant];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string, mfaCode?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.mfaEnabled) {
      if (!mfaCode) {
        throw new UnauthorizedException({ message: 'Se requiere código MFA', mfaRequired: true });
      }
      const valid = authenticator.verify({ token: mfaCode, secret: user.mfaSecret! });
      if (!valid) {
        throw new UnauthorizedException({ message: 'Código MFA inválido', mfaRequired: true });
      }
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
      mfaSetupRequired: MFA_REQUIRED_ROLES.includes(user.role) && !user.mfaEnabled,
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

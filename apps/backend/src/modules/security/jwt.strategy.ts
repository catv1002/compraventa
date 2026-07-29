import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './current-user.decorator';
import { resolveJwtSecret } from './jwt-secret';

interface JwtPayload {
  sub: string;
  tenantId: string;
  homeBranchId: string;
  role: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Mismo secreto que firma en SecurityModule, resuelto por la misma función
      // que aborta el arranque si es un placeholder.
      secretOrKey: resolveJwtSecret(),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      homeBranchId: payload.homeBranchId,
      role: payload.role,
      email: payload.email,
    };
  }
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { resolveJwtSecret } from './jwt-secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      // Sin valor por defecto a propósito: si el secreto falta o es el
      // placeholder, la aplicación no arranca. Ver `jwt-secret.ts`.
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: process.env.JWT_ACCESS_TOKEN_TTL ?? '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class SecurityModule {}

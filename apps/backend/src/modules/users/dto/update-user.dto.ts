import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { UserRole } from '@prisma/client';

// Deliberadamente NO incluye email ni password: el cambio de correo y el
// restablecimiento de contraseña son alcance futuro (autoservicio), no algo
// que un Admin haga por este endpoint. Ver tarea de gestión de usuarios.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  homeBranchId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [BranchesController, TransfersController],
  providers: [BranchesService, TransfersService],
  exports: [BranchesService],
})
export class BranchesModule {}

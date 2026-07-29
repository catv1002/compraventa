import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ItemStatus } from '@prisma/client';
import { InventoryService } from '../inventory.service';
import {
  ContractDefaultedEvent,
  ContractSettledEvent,
  DomainEventNames,
} from '../../../shared/domain-events/events';

// Ejemplo concreto de comunicación entre bounded contexts por eventos de
// dominio (Contracts -> Inventory), sin llamadas directas entre módulos.
// Ver docs/02-ciclos-de-vida.md (2.4) y docs/07-api-rest-graphql-eventos.md.
@Injectable()
export class ContractEventsListener {
  constructor(private readonly inventoryService: InventoryService) {}

  @OnEvent(DomainEventNames.ContractSettled)
  async onContractSettled(event: ContractSettledEvent) {
    await this.inventoryService.transitionStatus(event.itemId, ItemStatus.Released);
  }

  @OnEvent(DomainEventNames.ContractDefaulted)
  async onContractDefaulted(event: ContractDefaultedEvent) {
    await this.inventoryService.transitionStatus(event.itemId, ItemStatus.InStock);
  }
}

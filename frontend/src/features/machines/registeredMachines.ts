export interface RegisteredMachineIdentity {
  id: string;
  name: string;
  status?: string | null;
  is_active?: boolean;
}

/** Missing legacy status values are treated as active; explicit inactive states are excluded from selectors. */
export function isMachineActive(machine: RegisteredMachineIdentity): boolean {
  return machine.is_active !== false && (!machine.status || machine.status.trim().toUpperCase() === 'ACTIVE');
}

export function selectableMachines<T extends RegisteredMachineIdentity>(machines: readonly T[]): T[] {
  return machines
    .filter(isMachineActive)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function machineOptionLabel(machine: { name: string; code?: string | null }): string {
  return machine.code ? `${machine.name} · ${machine.code}` : machine.name;
}

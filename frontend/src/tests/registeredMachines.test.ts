import { describe, expect, it } from 'vitest';
import { machineOptionLabel, selectableMachines } from '../features/machines/registeredMachines';

describe('registered machine catalog', () => {
  it('keeps every active registered machine and preserves the real ID and display name', () => {
    const machines = selectableMachines([
      { id: 'mri-real-id', name: 'MRI', code: 'MRI-001' },
      { id: 'ultrasound-id', name: 'Ultrasound', code: 'US-001' },
      { id: 'inactive-id', name: 'Inactive unit', status: 'MAINTENANCE' },
      { id: 'archived-id', name: 'Archived unit', status: 'ACTIVE', is_active: false },
    ]);

    expect(machines.map(machine => [machine.id, machine.name])).toEqual([
      ['mri-real-id', 'MRI'],
      ['ultrasound-id', 'Ultrasound'],
    ]);
    expect(machineOptionLabel(machines[1])).toBe('Ultrasound · US-001');
  });

  it('treats explicit offline and maintenance machines as unselectable', () => {
    expect(selectableMachines([
      { id: 'offline', name: 'Offline', status: 'OFFLINE' },
      { id: 'maintenance', name: 'Maintenance', status: 'MAINTENANCE' },
      { id: 'archived', name: 'Archived', status: 'ACTIVE', is_active: false },
    ])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { getSupportedMachineOptions } from '../features/machines/supportedMachines';

describe('supported machine configuration', () => {
  it('maps supported labels to real registered machine IDs and excludes unrelated machines', () => {
    const options = getSupportedMachineOptions([
      { id: 'mri-real-id', name: 'MRI', code: 'MRI-001' },
      { id: 'cityscan-real-id', name: 'CitySCan', code: 'CITYSCAN-001' },
      { id: 'xray-real-id', name: 'Xray', code: 'XRAY-001' },
      { id: 'ecg-real-id', name: 'ECG', code: 'ECG-001' },
      { id: 'unrelated-real-id', name: 'MRI training simulator', code: 'MRI-SIM-001' },
      { id: 'cnc-real-id', name: 'CNC Mill', code: 'CNC-001' },
    ]);

    expect(options.map(option => option.label)).toEqual(['MRI', 'CT-Scan', 'Xray', 'ECG']);
    expect(options.map(option => option.machine?.id)).toEqual([
      'mri-real-id', 'cityscan-real-id', 'xray-real-id', 'ecg-real-id',
    ]);
  });

  it('keeps missing supported machines unavailable instead of inventing database IDs', () => {
    const options = getSupportedMachineOptions([
      { id: 'mri-real-id', name: 'MRI', code: 'MRI-001' },
      { id: 'cnc-real-id', name: 'CNC Mill', code: 'CNC-001' },
    ]);

    expect(options.map(option => option.label)).toEqual(['MRI', 'CT-Scan', 'Xray', 'ECG']);
    expect(options.map(option => option.machine?.id ?? null)).toEqual([
      'mri-real-id', null, null, null,
    ]);
  });
});

import { api } from '../../lib/api/client';
import type { MediaAsset } from '../knowledge-capture/media/types';
import { SUPPORTED_MACHINES } from '../machines/supportedMachines';

// Kept as a compatibility export for other machine diary consumers.
export const MACHINE_DIARY_MACHINE_LABELS = SUPPORTED_MACHINES.map(machine => machine.label);

export interface MachineDiaryCounts {
  video: number;
  audio: number;
  transcript: number;
  image: number;
  document: number;
  notes: number;
  total: number;
}

export interface MachineDiaryMachine {
  id: string;
  name: string;
  code?: string | null;
  model_number?: string | null;
  serial_number?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  category_name?: string | null;
  location?: string | null;
  status: string;
  is_demo: boolean;
  counts: MachineDiaryCounts;
}

export function fetchMachineDiaryLibrary(machineId?: string): Promise<MachineDiaryMachine[]> {
  const query = machineId ? `?machine_id=${encodeURIComponent(machineId)}` : '';
  return api.get<MachineDiaryMachine[]>(`/machine-knowledge/library${query}`);
}

export function fetchMachineDiaryAssets(machineId: string): Promise<MediaAsset[]> {
  return api.get<MediaAsset[]>(`/machine-knowledge/${encodeURIComponent(machineId)}/media`);
}

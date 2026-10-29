import React from 'react';
import { Cpu, ChevronDown } from 'lucide-react';
import { useMachines } from '../../knowledge-capture/hooks';
import { selectableMachines } from '../../machines/registeredMachines';

interface MachineOption {
  id: string;
  name: string;
  code?: string;
  category?: string;
}

interface MachineContextFilterProps {
  selectedMachineId: string | null;
  onSelectMachine: (machineId: string | null) => void;
  disabled?: boolean;
}

export const MachineContextFilter: React.FC<MachineContextFilterProps> = ({
  selectedMachineId,
  onSelectMachine,
  disabled = false,
}) => {
  const { data, isLoading: loading, isError } = useMachines();
  const machines = selectableMachines(data?.items ?? []) as MachineOption[];

  return (
    <div className="flex items-center space-x-2">
      <div className="relative inline-flex items-center">
        <Cpu className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
        <select
          value={selectedMachineId || ''}
          onChange={(e) => onSelectMachine(e.target.value || null)}
          disabled={disabled || loading}
          className="appearance-none text-xs pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-2xs"
          title="Filter RAG retrieval context by specific machine asset"
        >
          <option value="">Target: All Machines (General Shopfloor)</option>
          {loading && <option value="__loading" disabled>Loading registered machines…</option>}
          {!loading && !isError && machines.length === 0 && <option value="__empty" disabled>No active machines registered</option>}
          {machines.map((mach) => (
            <option key={mach.id} value={mach.id}>
              {mach.name} {mach.code ? `(${mach.code})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
      </div>
      {isError && <span role="alert" className="text-[11px] text-rose-700">Registered machines could not be loaded.</span>}
    </div>
  );
};

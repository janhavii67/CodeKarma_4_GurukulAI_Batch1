import React, { useEffect, useState } from 'react';
import { Cpu, ChevronDown } from 'lucide-react';
import { api } from '../../../lib/api/client';

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
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api
      .get<{ items: MachineOption[] }>('/machines?page_size=100')
      .then((res) => {
        if (isMounted) {
          setMachines(res.items || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[MachineContextFilter] Failed to fetch machines list:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
          {machines.map((mach) => (
            <option key={mach.id} value={mach.id}>
              {mach.name} {mach.code ? `(${mach.code})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
      </div>
    </div>
  );
};

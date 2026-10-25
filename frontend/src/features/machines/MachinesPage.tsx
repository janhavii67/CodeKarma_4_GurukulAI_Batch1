import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api/client';
import { Wrench, MapPin, Tag, RefreshCw } from 'lucide-react';


interface Tool {
  id: string;
  name: string;
  tool_number: string;
  description?: string;
  specifications?: string;
}

interface Machine {
  id: string;
  name: string;
  model_number: string;
  serial_number?: string;
  manufacturer?: string;
  category_id: string;
  category_name?: string;
  location?: string;
  status: string;
  specifications?: string;
  tools: Tool[];
}

export const MachinesPage: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMachines = () => {
    setLoading(true);
    api
      .get<Machine[]>('/machines')
      .then((data) => {
        setMachines(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchMachines();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-100">Equipment & Machine Assets</h1>
            <Badge variant="brand" size="sm">
              Live Database
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Catalog of industrial CNC milling, turning, and forming equipment with verified toolings.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchMachines}
          icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
        >
          Refresh Catalog
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading equipment assets...</div>
      ) : machines.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-xs text-slate-400">No machines registered in catalog.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {machines.map((m) => (
            <Card
              key={m.id}
              title={m.name}
              subtitle={`${m.manufacturer || 'Industrial'} · Model ${m.model_number}`}
              badge={
                <Badge
                  variant={
                    m.status === 'ACTIVE'
                      ? 'success'
                      : m.status === 'MAINTENANCE'
                      ? 'warning'
                      : 'danger'
                  }
                  size="sm"
                  dot
                >
                  {m.status}
                </Badge>
              }
            >
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2 py-2 border-y border-slate-800/80 bg-slate-900/30 rounded p-2.5">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Tag className="w-3.5 h-3.5 text-slate-500" />
                    <span>Category:</span>
                    <span className="font-semibold text-slate-200">{m.category_name || 'Standard'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cell:</span>
                    <span className="text-slate-200">{m.location || 'Main Floor'}</span>
                  </div>
                  <div className="col-span-2 text-[11px] font-mono text-slate-400 truncate">
                    SN: {m.serial_number || 'N/A'}
                  </div>
                </div>

                {m.specifications && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Operating Specifications:
                    </span>
                    <p className="text-[11px] text-slate-300 font-mono bg-slate-900/80 p-2 rounded border border-slate-800">
                      {m.specifications}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <Wrench className="w-3.5 h-3.5 text-brand-400" />
                    Associated Tooling ({m.tools.length}):
                  </span>
                  {m.tools.length === 0 ? (
                    <span className="text-slate-500 italic">No tools assigned.</span>
                  ) : (
                    <div className="space-y-1.5">
                      {m.tools.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800 text-[11px]"
                        >
                          <span className="font-medium text-slate-200">{t.name}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-brand-300 border border-slate-700">
                            {t.tool_number}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

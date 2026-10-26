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
            <h1 className="text-2xl font-bold text-[#17324D]">Equipment &amp; Machine Assets</h1>
            <Badge variant="brand" size="sm">
              Live Database
            </Badge>
          </div>
          <p className="text-xs text-[#5D7188]">
            Catalog of industrial laboratory analyzers, centrifuges, and diagnostic equipment with verified toolings.
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
        <div className="py-12 text-center text-xs text-[#7C8DA1]">Loading equipment assets...</div>
      ) : machines.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-xs text-[#7C8DA1]">No machines registered in catalog.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {machines.map((m) => (
            <Card
              key={m.id}
              title={m.name}
              subtitle={`${m.manufacturer || 'Medical Diagnostics'} · Model ${m.model_number}`}
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
                <div className="grid grid-cols-2 gap-2 py-2 border-y border-[#E8EEF5] bg-[#F3F8FE] rounded p-2.5">
                  <div className="flex items-center gap-1.5 text-[#5D7188]">
                    <Tag className="w-3.5 h-3.5 text-[#1976D2]" />
                    <span>Category:</span>
                    <span className="font-semibold text-[#17324D]">{m.category_name || 'Standard'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#5D7188]">
                    <MapPin className="w-3.5 h-3.5 text-[#1976D2]" />
                    <span>Cell:</span>
                    <span className="text-[#17324D]">{m.location || 'Diagnostic Wing'}</span>
                  </div>
                  <div className="col-span-2 text-[11px] font-mono text-[#5D7188] truncate">
                    SN: {m.serial_number || 'N/A'}
                  </div>
                </div>

                {m.specifications && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#5D7188] block mb-1">
                      Operating Specifications:
                    </span>
                    <p className="text-[11px] text-[#17324D] font-mono bg-[#F3F8FE] p-2.5 rounded-lg border border-[#DCE6F0]">
                      {m.specifications}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-[#5D7188] flex items-center gap-1.5 mb-1.5">
                    <Wrench className="w-3.5 h-3.5 text-[#1976D2]" />
                    Associated Tooling ({m.tools.length}):
                  </span>
                  {m.tools.length === 0 ? (
                    <span className="text-[#7C8DA1] italic">No tools assigned.</span>
                  ) : (
                    <div className="space-y-1.5">
                      {m.tools.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#F3F8FE] border border-[#DCE6F0] text-[11px]"
                        >
                          <span className="font-medium text-[#17324D]">{t.name}</span>
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#EAF3FF] text-[#1976D2] border border-[#BCD7F5]">
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

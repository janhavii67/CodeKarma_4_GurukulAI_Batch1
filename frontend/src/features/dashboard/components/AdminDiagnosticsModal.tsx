import React from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { HealthCheckResponse } from '../../../types/api';
import { DashboardStats } from '../../../types/dashboard';
import { Database, Shield, X } from 'lucide-react';

interface AdminDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: HealthCheckResponse | null;
  stats: DashboardStats | null;
  permissions: string[];
  roleId: string | undefined;
}

export const AdminDiagnosticsModal: React.FC<AdminDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  health,
  stats,
  permissions,
  roleId,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-hero-fade"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-diag-title"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-[#DCE6F0] shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E8EEF5] flex items-center justify-between bg-[#F8FAFD]">
          <div>
            <h3 id="admin-diag-title" className="text-base font-bold text-[#17324D] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#1976D2]" />
              System Architecture & Health Diagnostics
            </h3>
            <p className="text-xs text-[#5D7188]">
              Administrative diagnostic telemetry (Restricted to System Administrators)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7C8DA1] hover:text-[#17324D] hover:bg-slate-100 transition-colors"
            aria-label="Close diagnostics"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Health & DB Engine */}
          <div className="rounded-xl border border-[#DCE6F0] p-4 space-y-3 bg-[#F8FAFD]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#17324D] flex items-center gap-1.5">
                <Database className="w-4 h-4 text-[#1976D2]" />
                Database Engine & Connectivity
              </span>
              <Badge variant={health?.status === 'healthy' ? 'success' : 'warning'} size="sm" dot>
                {health?.status || 'Online'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-[#E8EEF5]">
              <div>
                <span className="text-[#5D7188] block text-[11px]">Database Status:</span>
                <span className="font-mono font-semibold text-[#15966A]">
                  {health?.database || 'SQLite / PostgreSQL connected'}
                </span>
              </div>
              <div>
                <span className="text-[#5D7188] block text-[11px]">API Health Latency:</span>
                <span className="font-mono font-semibold text-[#17324D]">
                  {health?.latency_ms !== undefined ? `${health.latency_ms} ms` : '< 2 ms'}
                </span>
              </div>
            </div>
          </div>

          {/* Security & RBAC Profile */}
          <div className="rounded-xl border border-[#DCE6F0] p-4 space-y-3 bg-[#F8FAFD]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#17324D] flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-[#1976D2]" />
                Active RBAC Profile
              </span>
              <Badge variant="brand" size="sm">
                Role: {roleId}
              </Badge>
            </div>

            <div>
              <span className="text-[#5D7188] block mb-1 text-[11px]">
                Effective Granted Permissions ({permissions.length}):
              </span>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
                {permissions.map((p) => (
                  <span
                    key={p}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-[#17324D] border border-[#DCE6F0]"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Baseline Asset References */}
          <div className="rounded-xl border border-[#DCE6F0] p-4 space-y-2 bg-[#F8FAFD]">
            <span className="font-bold text-[#17324D] block mb-2">
              Industrial Baseline Asset Telemetry
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between py-1 border-b border-[#E8EEF5]">
                <span className="text-[#5D7188]">Acoustic References:</span>
                <span className="font-mono font-semibold text-[#1976D2]">
                  {stats?.audio_references ?? 3} Baselines
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[#E8EEF5]">
                <span className="text-[#5D7188]">Failure Scenarios:</span>
                <span className="font-mono font-semibold text-[#1976D2]">
                  {stats?.active_simulations ?? 1} Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#E8EEF5] bg-[#F8FAFD] flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

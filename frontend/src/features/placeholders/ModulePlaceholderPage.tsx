import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { MODULE_CONFIGS } from './moduleConfigs';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ArrowLeft, Clock, ShieldAlert, Cpu, Sparkles, CheckCircle2 } from 'lucide-react';

interface ModulePlaceholderPageProps {
  moduleKeyOverride?: string;
}

export const ModulePlaceholderPage: React.FC<ModulePlaceholderPageProps> = ({ moduleKeyOverride }) => {
  const { moduleKey: paramKey } = useParams<{ moduleKey: string }>();
  const key = moduleKeyOverride || paramKey || 'knowledge';
  const config = MODULE_CONFIGS[key] || MODULE_CONFIGS['knowledge'];

  return (
    <div className="w-full space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DCE6F0]">
        <div className="flex items-center gap-3">
          <Link to="/app">
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
              Dashboard
            </Button>
          </Link>
          <div className="h-4 w-[1px] bg-[#DCE6F0]" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#EAF3FF] text-[#1976D2] font-semibold border border-[#BCD7F5]">
              Module {config.id}
            </span>
            <h1 className="text-xl font-bold text-[#17324D]">{config.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="neutral" size="sm">
            Phase {config.phase}
          </Badge>
          <Badge variant="warning" size="sm" dot>
            Planned · Unimplemented
          </Badge>
        </div>
      </div>

      {/* Honest Phase Status Alert */}
      <Alert
        variant="warning"
        title={`Module ${config.id} Status: Planned for Phase ${config.phase} (${config.hackathonRole})`}
      >
        Under <strong>Phase 1 Foundation</strong>, this route is active to verify backend-enforced RBAC, session handling,
        and application navigation. The AI structuring, data processing, and live integration will be implemented in subsequent phases.
        No fabricated AI outputs or pretend data are permitted.
      </Alert>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Summary & Capabilities */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Module Overview & Architecture" subtitle={config.summary}>
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5D7188] mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#1976D2]" />
                  Planned Core Capabilities
                </h4>
                <ul className="space-y-2">
                  {config.featuresPlanned.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-[#17324D]">
                      <CheckCircle2 className="w-4 h-4 text-[#15966A] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-[#DCE6F0]">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5D7188] mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#1976D2]" />
                  Workflow Execution Plan
                </h4>
                <div className="p-4 rounded-lg bg-[#F3F8FE] border border-[#DCE6F0] font-mono text-xs text-[#17324D] overflow-x-auto whitespace-pre">
                  {config.workflowDiagram}
                </div>
              </div>
            </div>
          </Card>

          {/* Interactive Simulation / Mock Area (Cleanly Disabled) */}
          <Card title="Interface Preview (Execution Gated)" subtitle="Actions disabled until Phase activation">
            <div className="p-8 text-center border border-dashed border-[#DCE6F0] rounded-lg bg-[#F8FAFC]">
              <Clock className="w-10 h-10 text-[#7C8DA1] mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-[#17324D]">
                Interactive Components Locked
              </h4>
              <p className="text-xs text-[#5D7188] mt-1 max-w-md mx-auto">
                This feature domain requires backend services scheduled for Phase {config.phase}.
                All inputs are gated to prevent mock hallucinations.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Button variant="secondary" size="sm" disabled>
                  Execute Action (Disabled)
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Upload Payload (Disabled)
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Governance Invariants & Requirements */}
        <div className="space-y-6">
          <Card title="Governance & Invariants">
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[#5D7188] block mb-1">Required Permissions:</span>
                {config.requiredPermission ? (
                  <code className="px-2 py-1 rounded bg-[#EAF3FF] text-[#1976D2] font-mono text-[11px] border border-[#BCD7F5] block">
                    {config.requiredPermission}
                  </code>
                ) : (
                  <span className="text-[#7C8DA1] italic">Public authenticated session</span>
                )}
              </div>

              <div>
                <span className="text-[#5D7188] block mb-1">Hackathon Deliverable:</span>
                <Badge variant={config.hackathonRole.includes('Build') ? 'brand' : 'neutral'} size="sm">
                  {config.hackathonRole}
                </Badge>
              </div>

              <div className="pt-3 border-t border-[#DCE6F0]">
                <h5 className="font-semibold text-[#D94848] mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  System Architectural Invariants
                </h5>
                <ul className="space-y-2">
                  {config.invariants.map((inv, idx) => (
                    <li key={idx} className="p-2.5 rounded bg-[#F3F8FE] border border-[#DCE6F0] text-[11px] text-[#17324D] leading-relaxed">
                      {inv}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

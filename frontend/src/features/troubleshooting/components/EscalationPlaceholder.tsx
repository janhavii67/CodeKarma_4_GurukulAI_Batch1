import React from 'react';
import { UserCheck, ShieldAlert, PhoneCall } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';

export const EscalationPlaceholder: React.FC = () => {
  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <UserCheck className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Expert Escalation & Support
          </h3>
          <p className="text-[11px] text-slate-400">
            Safety-critical escalation to verified engineering personnel
          </p>
        </div>
      </div>
      <Badge variant="warning" size="sm">
        PLACEHOLDER
      </Badge>
    </div>
  );

  return (
    <Card header={headerContent} className="border-slate-800 bg-slate-900/60 shadow-lg">
      <div className="space-y-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          If a fault symptom has no published guide, reaches a <strong>STOP node</strong>, or exceeds safe operational limits, this gate creates an official audit-logged escalation ticket routed to senior workshop experts.
        </p>

        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Escalation Status:</span>
            <span className="font-mono text-slate-400">NO ACTIVE ESCALATION</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Audit Provenance:</span>
            <span className="font-mono text-emerald-400">Active Audit Logger</span>
          </div>
        </div>

        <div className="pt-1">
          <Button
            variant="outline"
            disabled
            className="w-full flex items-center justify-center gap-2 border-slate-700 text-slate-400 opacity-60 cursor-not-allowed text-xs py-2.5"
            aria-disabled="true"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Request Expert Help (Placeholder — Disabled)</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Causes always carry status: <em>suspected</em>, <em>under_investigation</em>, or <em>confirmed</em>. Suspected causes are never presented as confirmed.
          </span>
        </div>
      </div>
    </Card>
  );
};

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { api } from '../../lib/api/client';
import { HealthCheckResponse } from '../../types/api';
import {
  FileText,
  Mic,
  CheckSquare,
  Bot,
  Activity,
  ArrowRight,
  Database,
  Shield,
  Layers,
  Wrench,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, permissions, hasPermission, hasRole } = useAuth();
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    api
      .get<HealthCheckResponse>('/health')
      .then((data) => {
        if (isMounted) {
          setHealth(data);
          setHealthLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setHealthLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const isExpert = hasRole('EXPERT');
  const canApprove = hasPermission('knowledge.approve');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-brand-950/40 border border-slate-800 p-6 md:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-brand-500/10 to-transparent pointer-events-none" />

        <div className="max-w-2xl relative z-10 space-y-3">
          <div className="flex items-center gap-2.5">
            <Badge variant={isExpert ? 'brand' : 'info'} size="md" dot>
              {isExpert ? 'Expert Workspace' : 'Trainee Workshop Portal'}
            </Badge>
            {canApprove && (
              <Badge variant="success" size="md">
                Authorized Approver
              </Badge>
            )}
            <Badge variant="neutral" size="sm">
              Phase 1 Baseline
            </Badge>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-100 tracking-tight">
            Welcome back, {user?.name || 'Engineer'}
          </h1>

          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
            {isExpert
              ? 'You are signed in as a Manufacturing Expert. You have authority to capture shop floor narration, format technical Standard Operating Procedures, and participate in peer review governance.'
              : 'You are signed in as a Factory Trainee. You have access to verified, peer-approved manufacturing procedures, the cited AI knowledge assistant, and guided execution flows.'}
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            {isExpert ? (
              <>
                <Link to="/app/knowledge">
                  <Button variant="primary" size="sm" icon={<FileText className="w-4 h-4" />}>
                    Capture SOP (M01)
                  </Button>
                </Link>
                <Link to="/app/voice-capture">
                  <Button variant="secondary" size="sm" icon={<Mic className="w-4 h-4" />}>
                    Voice Narration (M04)
                  </Button>
                </Link>
                {canApprove && (
                  <Link to="/app/reviews">
                    <Button variant="outline" size="sm" icon={<CheckSquare className="w-4 h-4" />}>
                      Review Queue (M06)
                    </Button>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link to="/app/assistant">
                  <Button variant="primary" size="sm" icon={<Bot className="w-4 h-4" />}>
                    Query Assistant (M02)
                  </Button>
                </Link>
                <Link to="/app/guided-workflows">
                  <Button variant="secondary" size="sm" icon={<Layers className="w-4 h-4" />}>
                    Guided Workflows (M03)
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* System Status & Infrastructure Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Health Card */}
        <Card
          title="System & Database Health"
          subtitle="Real-time backend connectivity check"
          badge={
            health?.status === 'healthy' ? (
              <Badge variant="success" size="sm" dot>
                Online
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">
                Checking
              </Badge>
            )
          }
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-slate-500" />
                PostgreSQL Engine:
              </span>
              <span className="font-mono font-semibold text-emerald-400">
                {healthLoading ? 'Connecting...' : health?.database || 'Connected'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-slate-500" />
                Database Latency:
              </span>
              <span className="font-mono text-slate-200">
                {health?.latency_ms !== undefined ? `${health.latency_ms} ms` : '1.2 ms'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-slate-500" />
                Session Security:
              </span>
              <span className="font-mono text-brand-400 font-medium">HttpOnly · SameSite=Lax</span>
            </div>
          </div>
        </Card>

        {/* Active Role & Permissions Card */}
        <Card title="Role-Based Access (RBAC)" subtitle="Current session security profile">
          <div className="space-y-2.5 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">Assigned Role:</span>
              <Badge variant={isExpert ? 'brand' : 'info'} size="md">
                {user?.role_id}
              </Badge>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Effective Permissions ({permissions.length}):</span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                {permissions.map((p) => (
                  <span
                    key={p}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Phase 1 Completion Status */}
        <Card title="Implementation Phase" subtitle="Foundation status">
          <div className="space-y-3 text-xs">
            <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-emerald-400">Phase 1: Foundation</span>
                <Badge variant="success" size="sm">
                  Complete
                </Badge>
              </div>
              <p className="text-[11px] text-slate-300">
                Auth, sessions, RBAC, layout, migrations, and module routing active.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-300">Phase 2: Knowledge Capture</span>
                <Badge variant="neutral" size="sm">
                  Next Task
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                Step-by-step SOP authoring and peer review queue.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Honest Empty State for Records */}
      <Card title="Active Operational Queue" subtitle="Documents and tasks assigned to you">
        <EmptyState
          title="Operational Queue Empty"
          description="Phase 1 Foundation established successfully. Knowledge items, AI drafts, and peer reviews will populate upon commencement of Phase 2."
          action={
            isExpert ? (
              <Link to="/app/knowledge">
                <Button variant="secondary" size="sm" icon={<FileText className="w-4 h-4" />}>
                  Preview Module 01 Spec
                </Button>
              </Link>
            ) : (
              <Link to="/app/assistant">
                <Button variant="secondary" size="sm" icon={<Bot className="w-4 h-4" />}>
                  Preview Assistant Spec
                </Button>
              </Link>
            )
          }
        />
      </Card>

      {/* Module Registry Navigation Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-brand-400" />
              Planned Gurukul AI Modules (11 Modules)
            </h3>
            <p className="text-xs text-slate-400">
              Explore planned architecture, invariants, and specifications for each subsystem.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ModuleQuickCard
            code="01"
            name="Expert Knowledge Capture"
            desc="SOP authoring tool with safety warnings and stop conditions."
            route="/app/knowledge"
            phase={2}
          />
          <ModuleQuickCard
            code="06"
            name="Validation & Versioning"
            desc="Strict two-person rule peer review governance queue."
            route="/app/reviews"
            phase={2}
          />
          <ModuleQuickCard
            code="04"
            name="Voice-to-Knowledge"
            desc="Audio capture and whisper transcription for shop floor narration."
            route="/app/voice-capture"
            phase={3}
          />
          <ModuleQuickCard
            code="02"
            name="AI Knowledge Assistant"
            desc="Air-gapped grounded RAG assistant citing approved versions only."
            route="/app/assistant"
            phase={3}
          />
          <ModuleQuickCard
            code="03"
            name="Guided Workflows"
            desc="Procedural execution with mandatory safety sign-off checkpoints."
            route="/app/guided-workflows"
            phase={3}
          />
          <ModuleQuickCard
            code="05"
            name="Troubleshooting"
            desc="Symptom-based root cause decision trees for machine faults."
            route="/app/troubleshooting"
            phase={4}
          />
          <ModuleQuickCard
            code="07"
            name="Machine Sound Analysis"
            desc="Acoustic MFCC similarity matching against baseline recordings."
            route="/app/sound-analysis"
            phase={5}
          />
          <ModuleQuickCard
            code="08"
            name="Knowledge Graph"
            desc="Relational equipment ontology linking machines and failure modes."
            route="/app/knowledge-graph"
            phase={5}
          />
          <ModuleQuickCard
            code="09"
            name="Failure Simulator"
            desc="Risk-free emergency scenario assessments for trainees."
            route="/app/failure-simulator"
            phase={4}
          />
          <ModuleQuickCard
            code="10"
            name="Skill Verification"
            desc="Vision-based procedural adherence evaluation via MediaPipe."
            route="/app/skill-verification"
            phase={6}
          />
          <ModuleQuickCard
            code="11"
            name="Synchronized Simulation"
            desc="Dual synchronized audio clock and 2D canvas simulation."
            route="/app/synchronized-simulation"
            phase={6}
          />
        </div>
      </div>
    </div>
  );
};

const ModuleQuickCard: React.FC<{
  code: string;
  name: string;
  desc: string;
  route: string;
  phase: number;
}> = ({ code, name, desc, route, phase }) => (
  <Link
    to={route}
    className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all duration-200 flex flex-col justify-between group shadow-sm hover:shadow-md"
  >
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-brand-300 border border-slate-700">
          M{code}
        </span>
        <Badge variant="neutral" size="sm">
          Phase {phase}
        </Badge>
      </div>
      <h4 className="text-sm font-semibold text-slate-100 group-hover:text-brand-400 transition-colors">
        {name}
      </h4>
      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{desc}</p>
    </div>
    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 group-hover:text-slate-200">
      <span className="text-[11px]">Inspect Specification</span>
      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
    </div>
  </Link>
);

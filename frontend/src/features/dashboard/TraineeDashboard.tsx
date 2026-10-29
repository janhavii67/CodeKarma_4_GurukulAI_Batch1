import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AudioLines, BookOpen, Bot, CheckCircle2, CircleHelp, GraduationCap, Home, Layers, RefreshCw, Workflow } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { api } from '../../lib/api/client';
import { User } from '../../types/auth';

interface LearningAssignment {
  id: string;
  path_title: string;
  path_description: string;
  status: string;
  progress_percentage: number;
  total_items: number;
}

interface ActiveProcedure {
  run_id: string;
  procedure_id: string;
  procedure_title: string;
  machine_name?: string | null;
  completed_steps: number;
  total_steps: number;
  progress_percentage: number;
}

interface LearningActivity {
  id: string;
  type: string;
  title: string;
  status: string;
  timestamp: string;
}

interface TraineeMetrics {
  welcome_message: string;
  user_name: string;
  assigned_paths_count: number;
  completed_tasks_count: number;
  assigned_paths: LearningAssignment[];
  in_progress_procedures: ActiveProcedure[];
  recent_activity: LearningActivity[];
}

interface TraineeDashboardProps {
  user: User | null;
  hasPermission: (permission: string) => boolean;
}

const destinations: Array<{ label: string; description: string; to: string; permission?: string; permissions?: string[]; always?: boolean; icon: typeof BookOpen }> = [
  { label: 'Dashboard', description: 'Return to your training overview.', to: '/app', always: true, icon: Home },
  { label: 'Knowledge Library', description: 'Find approved equipment knowledge and procedures.', to: '/app/knowledge', permissions: ['knowledge.view_published', 'knowledge.create', 'knowledge.approve'], icon: BookOpen },
  { label: 'AI Tutor', description: 'Ask questions grounded in approved sources.', to: '/app/assistant', permission: 'assistant.use', icon: Bot },
  { label: 'Troubleshooting', description: 'Work through evidence-based investigations.', to: '/app/troubleshooting', permission: 'troubleshoot.use', icon: CircleHelp },
  { label: 'Guided Workflow', description: 'Continue an approved step-by-step procedure.', to: '/app/guided-workflows', permission: 'procedure.execute', icon: Workflow },
  { label: 'Audio Matching', description: 'Compare a machine recording with approved references.', to: '/app/sound-analysis', permission: 'audio.analyze', icon: AudioLines },
];

export const TraineeDashboard: React.FC<TraineeDashboardProps> = ({ user, hasPermission }) => {
  const [metrics, setMetrics] = useState<TraineeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMetrics(await api.get<TraineeMetrics>('/learning/dashboard'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your learning progress.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const activeProcedure = metrics?.in_progress_procedures[0];
  const assignedPaths = metrics?.assigned_paths ?? [];
  const recentActivity = metrics?.recent_activity ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <section className="rounded-2xl border border-[#DCE6F0] bg-white p-6 shadow-xs md:p-8" aria-labelledby="trainee-dashboard-heading">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-[#1976C9]">Trainee dashboard</p>
            <h1 id="trainee-dashboard-heading" className="mt-2 text-2xl font-bold tracking-tight text-[#17324D] md:text-3xl">
              Welcome, {user?.name || metrics?.user_name || 'Trainee'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#5D7188]">{metrics?.welcome_message || 'Continue learning from approved procedures and expert knowledge.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!loading && (activeProcedure ? (
              <Link to="/app/guided-workflows"><Button variant="primary" icon={<Layers className="h-4 w-4" />}>Continue workflow</Button></Link>
            ) : hasPermission('procedure.execute') ? (
              <Link to="/app/guided-workflows"><Button variant="primary" icon={<Layers className="h-4 w-4" />}>Browse workflows</Button></Link>
            ) : null)}
            {error && <Button variant="secondary" onClick={() => void loadMetrics()} icon={<RefreshCw className="h-4 w-4" />}>Retry</Button>}
          </div>
        </div>
      </section>

      {error && <Alert variant="error" title="Learning progress unavailable">{error}</Alert>}

      {loading && <Card><LoadingSpinner size="md" message="Loading your learning progress…" /></Card>}
      {!loading && metrics && (
        <>
          <section className="grid gap-4 sm:grid-cols-2" aria-label="Learning summary">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1976C9]"><GraduationCap className="h-5 w-5" /></span>
                <div><p className="text-xs font-medium text-[#5D7188]">Assigned learning paths</p><p className="text-2xl font-bold text-[#17324D]">{metrics?.assigned_paths_count ?? 0}</p></div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span>
                <div><p className="text-xs font-medium text-[#5D7188]">Completed training tasks</p><p className="text-2xl font-bold text-[#17324D]">{metrics?.completed_tasks_count ?? 0}</p></div>
              </div>
            </Card>
          </section>

          {activeProcedure && (
            <Card title="Continue learning" subtitle="An in-progress procedure is ready to resume." className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-[#17324D]">{activeProcedure.procedure_title}</h2>
                  <p className="mt-1 text-xs text-[#5D7188]">{activeProcedure.machine_name || 'Approved procedure'} · {activeProcedure.completed_steps} of {activeProcedure.total_steps} steps completed</p>
                  <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-[#EAF3FF]" role="progressbar" aria-label={`${activeProcedure.procedure_title} progress`} aria-valuenow={activeProcedure.progress_percentage} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-[#1976C9]" style={{ width: `${Math.max(0, Math.min(100, activeProcedure.progress_percentage))}%` }} />
                  </div>
                </div>
                <Link to="/app/guided-workflows" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#1976C9] hover:underline">
                  Resume <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          )}

          <section aria-labelledby="assigned-paths-heading">
            <h2 id="assigned-paths-heading" className="mb-3 text-lg font-bold text-[#17324D]">Your learning paths</h2>
            {assignedPaths.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {assignedPaths.map((path) => (
                  <Card key={path.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="font-semibold text-[#17324D]">{path.path_title}</h3><p className="mt-1 text-xs text-[#5D7188]">{path.path_description}</p></div>
                      <span className="shrink-0 text-sm font-bold text-[#1976C9]">{path.progress_percentage}%</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EAF3FF]" role="progressbar" aria-label={`${path.path_title} progress`} aria-valuenow={path.progress_percentage} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-[#1976C9]" style={{ width: `${Math.max(0, Math.min(100, path.progress_percentage))}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[#5D7188]">{path.total_items} learning items · {path.status.toLowerCase().replace(/_/g, ' ')}</p>
                  </Card>
                ))}
              </div>
            ) : <EmptyState title="No learning paths assigned yet" description="Your assigned learning paths will appear here when they are available." />}
          </section>

          <section aria-labelledby="recent-activity-heading">
            <h2 id="recent-activity-heading" className="mb-3 text-lg font-bold text-[#17324D]">Recent activity</h2>
            {recentActivity.length ? (
              <Card className="divide-y divide-[#E8EEF5] p-0">
                {recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-medium text-[#17324D]">{activity.title}</p><p className="text-xs text-[#5D7188]">{activity.type.replace(/_/g, ' ')} · {activity.status.toLowerCase().replace(/_/g, ' ')}</p></div>
                    <time className="text-xs text-[#6B7F95]" dateTime={activity.timestamp}>{new Date(activity.timestamp).toLocaleDateString()}</time>
                  </div>
                ))}
              </Card>
            ) : <EmptyState title="No recent activity yet" description="Completed and in-progress procedure activity will appear here." />}
          </section>
        </>
      )}

      <section aria-labelledby="trainee-shortcuts-heading">
        <h2 id="trainee-shortcuts-heading" className="mb-3 text-lg font-bold text-[#17324D]">Your training tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.filter((destination) => destination.always || (destination.permission
            ? hasPermission(destination.permission)
            : destination.permissions?.some(hasPermission) ?? false)
          ).map(({ label, description, to, icon: Icon }) => (
            <Link key={to} to={to} className="group rounded-xl border border-[#DCE6F0] bg-white p-4 shadow-xs transition hover:border-[#1976C9]/50 hover:shadow-md">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF3FF] text-[#1976C9]"><Icon className="h-4 w-4" /></span>
              <span className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold text-[#17324D] group-hover:text-[#1976C9]">{label}<ArrowRight className="h-4 w-4" /></span>
              <span className="mt-1 block text-xs leading-relaxed text-[#5D7188]">{description}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

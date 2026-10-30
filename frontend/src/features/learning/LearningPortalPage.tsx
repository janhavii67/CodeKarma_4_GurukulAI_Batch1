import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { api, ApiClientError } from '../../lib/api/client';
import {
  GraduationCap,
  BookOpen,
  Award,
  Layers,
  CheckCircle2,
  CheckCheck,
  Search,
  RefreshCw,
  Eye,
  Trash2,
  Plus,
  AlertTriangle,
  X,
  Play,
  Sparkles,
} from 'lucide-react';

interface LearningItem {
  id: string;
  item_type: string;
  reference_id: string;
  order_index: number;
  title: string;
}

interface LearningAssignment {
  id: string;
  path_id: string;
  path_title: string;
  path_description: string;
  status: string;
  progress_percentage: number;
  assigned_at: string;
  due_at?: string;
  completed_at?: string;
  total_items: number;
  items: LearningItem[];
}

interface InProgressProcedure {
  run_id: string;
  procedure_id: string;
  procedure_title: string;
  machine_name?: string;
  status: string;
  started_at: string;
  completed_steps: number;
  total_steps: number;
  progress_percentage: number;
}

interface UpcomingAssessment {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  due_at?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

interface TraineeDashboardMetrics {
  welcome_message: string;
  user_name: string;
  role_id: string;
  assigned_paths_count: number;
  in_progress_procedures_count: number;
  completed_tasks_count: number;
  upcoming_assessments_count: number;
  available_procedures_count: number;
  unread_notifications_count: number;
  assigned_paths: LearningAssignment[];
  in_progress_procedures: InProgressProcedure[];
  upcoming_assessments: UpcomingAssessment[];
  recent_activity: Array<{
    id: string;
    type: string;
    title: string;
    status: string;
    timestamp: string;
  }>;
  notifications: NotificationItem[];
}

interface LearningProgressRecord {
  user_id: string;
  name: string;
  role_id: string;
  procedure_runs: Array<{
    run_id: string;
    procedure_title: string;
    machine_name?: string;
    status: string;
    started_at: string;
    completed_at?: string;
    completed_steps: number;
    total_steps: number;
  }>;
  assignments: Array<{
    assignment_id: string;
    path_title: string;
    status: string;
    progress_percentage: number;
    assigned_at: string;
    completed_at?: string;
  }>;
}

export const LearningPortalPage: React.FC = () => {
  // Tab: 'dashboard' | 'assignments' | 'progress'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'assignments' | 'progress'>('dashboard');

  // Dashboard state
  const [metrics, setMetrics] = useState<TraineeDashboardMetrics | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Assignments tab state
  const [assignments, setAssignments] = useState<LearningAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [searchPath, setSearchPath] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');

  // Progress tab state
  const [progressData, setProgressData] = useState<LearningProgressRecord | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  // Detail / Inspect curriculum modal
  const [inspectPath, setInspectPath] = useState<LearningAssignment | null>(null);

  // Notification action state
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  // Backend gap modals
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState<LearningAssignment | null>(null);

  // Fetch Trainee Dashboard Metrics
  const fetchDashboard = () => {
    setLoadingDashboard(true);
    setDashboardError(null);
    api
      .get<TraineeDashboardMetrics>('/learning/dashboard')
      .then((data) => {
        setMetrics(data);
        setLoadingDashboard(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to retrieve learning dashboard metrics.';
        setDashboardError(msg);
        setLoadingDashboard(false);
      });
  };

  // Fetch Assignments List
  const fetchAssignments = () => {
    setLoadingAssignments(true);
    setAssignmentsError(null);
    api
      .get<LearningAssignment[]>('/learning/assignments')
      .then((data) => {
        setAssignments(Array.isArray(data) ? data : []);
        setLoadingAssignments(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to retrieve learning assignments.';
        setAssignmentsError(msg);
        setLoadingAssignments(false);
      });
  };

  // Fetch Progress & Verification Records
  const fetchProgress = () => {
    setLoadingProgress(true);
    setProgressError(null);
    api
      .get<LearningProgressRecord>('/learning/my-progress')
      .then((data) => {
        setProgressData(data);
        setLoadingProgress(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to retrieve learning progress records.';
        setProgressError(msg);
        setLoadingProgress(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'assignments') {
      fetchAssignments();
    } else if (activeTab === 'progress') {
      fetchProgress();
    }
  }, [activeTab]);

  // Mark single notification read
  const handleMarkNotificationRead = async (id: string) => {
    setMarkingReadId(id);
    try {
      await api.post(`/learning/notifications/${id}/read`);
      if (metrics) {
        setMetrics({
          ...metrics,
          unread_notifications_count: Math.max(0, metrics.unread_notifications_count - 1),
          notifications: metrics.notifications.map((n) =>
            n.id === id ? { ...n, is_read: true } : n
          ),
        });
      }
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    } finally {
      setMarkingReadId(null);
    }
  };

  // Mark all notifications read
  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await api.post('/learning/notifications/mark-all-read');
      if (metrics) {
        setMetrics({
          ...metrics,
          unread_notifications_count: 0,
          notifications: metrics.notifications.map((n) => ({ ...n, is_read: true })),
        });
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
    } finally {
      setMarkingAllRead(false);
    }
  };

  // Filtered assignments
  const filteredAssignments = assignments.filter((a) => {
    const matchesSearch =
      !searchPath.trim() ||
      a.path_title.toLowerCase().includes(searchPath.toLowerCase()) ||
      a.path_description.toLowerCase().includes(searchPath.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#DCE6F0]">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2] shadow-xs">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-[#17324D]">Trainee Learning &amp; Curriculum</h1>
                <Badge variant="brand" size="sm">
                  Module 10 · Active Learning Engine
                </Badge>
              </div>
              <p className="text-xs text-[#5D7188] mt-0.5">
                Structured laboratory apprenticeship, assigned curriculum milestones, and verified skill records.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'dashboard'
                ? 'bg-white text-[#17324D] font-semibold shadow-xs'
                : 'text-[#5D7188] hover:text-[#17324D]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1976D2]" />
            <span>Dashboard</span>
            {metrics && metrics.unread_notifications_count > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#1976D2] text-white text-[9px] flex items-center justify-center font-bold">
                {metrics.unread_notifications_count}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assignments')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'assignments'
                ? 'bg-white text-[#17324D] font-semibold shadow-xs'
                : 'text-[#5D7188] hover:text-[#17324D]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#1976D2]" />
            <span>My Curriculum</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('progress')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'progress'
                ? 'bg-white text-[#17324D] font-semibold shadow-xs'
                : 'text-[#5D7188] hover:text-[#17324D]'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-[#1976D2]" />
            <span>Progress &amp; Records</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TRAINEE DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {dashboardError && (
            <Alert variant="error" title="Failed to Load Learning Dashboard">
              {dashboardError}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={fetchDashboard}>
                  Retry Request
                </Button>
              </div>
            </Alert>
          )}

          {loadingDashboard ? (
            <div className="py-16 text-center">
              <LoadingSpinner size="lg" message="Loading trainee learning curriculum metrics..." />
            </div>
          ) : metrics ? (
            <>
              {/* Welcome Hero Card */}
              <div className="rounded-2xl bg-gradient-to-r from-white via-[#F3F8FE] to-[#EAF3FF] border border-[#BCD7F5] p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="brand" size="sm" dot>
                      Active Workshop Trainee
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      Role: {metrics.role_id}
                    </Badge>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#17324D]">
                    Welcome back, {metrics.user_name}
                  </h2>
                  <p className="text-xs text-[#5D7188] max-w-2xl leading-relaxed">
                    {metrics.welcome_message}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={fetchDashboard}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Refresh
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setActiveTab('assignments')}
                    icon={<BookOpen className="w-3.5 h-3.5" />}
                  >
                    View Curriculum
                  </Button>
                </div>
              </div>

              {/* KPI Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 border-[#DCE6F0]">
                  <div className="flex items-center justify-between text-[#5D7188] mb-1.5">
                    <span className="text-xs font-semibold">Assigned Paths</span>
                    <BookOpen className="w-4 h-4 text-[#1976D2]" />
                  </div>
                  <div className="text-2xl font-black text-[#17324D] font-mono">
                    {metrics.assigned_paths_count}
                  </div>
                  <span className="text-[11px] text-[#7C8DA1]">Curriculum Tracks</span>
                </Card>

                <Card className="p-4 border-[#DCE6F0]">
                  <div className="flex items-center justify-between text-[#5D7188] mb-1.5">
                    <span className="text-xs font-semibold">In Progress</span>
                    <Layers className="w-4 h-4 text-[#D98B13]" />
                  </div>
                  <div className="text-2xl font-black text-[#17324D] font-mono">
                    {metrics.in_progress_procedures_count}
                  </div>
                  <span className="text-[11px] text-[#7C8DA1]">Active Procedure Runs</span>
                </Card>

                <Card className="p-4 border-[#DCE6F0]">
                  <div className="flex items-center justify-between text-[#5D7188] mb-1.5">
                    <span className="text-xs font-semibold">Completed Tasks</span>
                    <CheckCircle2 className="w-4 h-4 text-[#15966A]" />
                  </div>
                  <div className="text-2xl font-black text-[#17324D] font-mono">
                    {metrics.completed_tasks_count}
                  </div>
                  <span className="text-[11px] text-[#7C8DA1]">Verified Executions</span>
                </Card>

                <Card className="p-4 border-[#DCE6F0]">
                  <div className="flex items-center justify-between text-[#5D7188] mb-1.5">
                    <span className="text-xs font-semibold">Upcoming Tests</span>
                    <Award className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-2xl font-black text-[#17324D] font-mono">
                    {metrics.upcoming_assessments_count}
                  </div>
                  <span className="text-[11px] text-[#7C8DA1]">Simulation Scenarios</span>
                </Card>
              </div>

              {/* Main 2-Column Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Active Procedures & Assigned Paths */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Active In-Progress Procedures */}
                  <Card
                    title="Active Procedure Runs"
                    subtitle="Currently executing equipment checkpoints"
                    badge={
                      <Badge variant="warning" size="sm">
                        {metrics.in_progress_procedures.length} Active
                      </Badge>
                    }
                  >
                    {metrics.in_progress_procedures.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[#7C8DA1]">
                        No procedures currently in progress. You can start one from Guided Workflows.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {metrics.in_progress_procedures.map((p) => (
                          <div
                            key={p.run_id}
                            className="p-3.5 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#17324D]">{p.procedure_title}</span>
                                <Badge variant="warning" size="sm">
                                  {p.status}
                                </Badge>
                              </div>
                              <span className="text-[11px] text-[#5D7188] block">
                                Target: {p.machine_name || 'Standard Equipment'} · Started {new Date(p.started_at).toLocaleTimeString()}
                              </span>
                              {/* Progress bar */}
                              <div className="w-full bg-[#DCE6F0] h-1.5 rounded-full overflow-hidden mt-1">
                                <div
                                  className="bg-[#1976D2] h-full rounded-full transition-all"
                                  style={{ width: `${p.progress_percentage}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-[#7C8DA1]">
                                {p.completed_steps} of {p.total_steps} steps verified ({p.progress_percentage}%)
                              </span>
                            </div>

                            <Link to="/app/guided-workflows" className="shrink-0">
                              <Button variant="primary" size="sm" icon={<Play className="w-3.5 h-3.5" />}>
                                Resume Run
                              </Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Assigned Learning Paths */}
                  <Card
                    title="Assigned Learning Curriculum"
                    subtitle="Required manufacturing skill tracks and verification checkpoints"
                    badge={
                      <Badge variant="brand" size="sm">
                        {metrics.assigned_paths.length} Enrolled
                      </Badge>
                    }
                  >
                    {metrics.assigned_paths.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[#7C8DA1]">
                        No curriculum tracks assigned. Platform supervisors assign tracks upon onboarding.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {metrics.assigned_paths.map((path) => (
                          <div
                            key={path.id}
                            className="p-4 rounded-xl border border-[#DCE6F0] bg-white hover:border-[#BCD7F5] transition-all text-xs space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="font-bold text-sm text-[#17324D]">{path.path_title}</h4>
                                <p className="text-xs text-[#5D7188] mt-0.5 line-clamp-2">{path.path_description}</p>
                              </div>
                              <Badge
                                variant={
                                  path.status === 'COMPLETED'
                                    ? 'success'
                                    : path.status === 'IN_PROGRESS'
                                    ? 'warning'
                                    : 'neutral'
                                }
                                size="sm"
                              >
                                {path.status}
                              </Badge>
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-[#5D7188]">
                                <span>Track Progress ({path.total_items} items)</span>
                                <span className="font-mono font-bold text-[#1976D2]">{path.progress_percentage}%</span>
                              </div>
                              <div className="w-full bg-[#E8EEF5] h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-[#1976D2] to-[#15966A] h-full rounded-full transition-all"
                                  style={{ width: `${path.progress_percentage}%` }}
                                />
                              </div>
                            </div>

                            <div className="pt-2 border-t border-[#E8EEF5] flex items-center justify-between text-[11px] text-[#7C8DA1]">
                              <span>
                                Assigned: {new Date(path.assigned_at).toLocaleDateString()}
                                {path.due_at && ` · Due: ${new Date(path.due_at).toLocaleDateString()}`}
                              </span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setInspectPath(path)}
                                icon={<Eye className="w-3.5 h-3.5 text-[#1976D2]" />}
                              >
                                View Modules ({path.total_items})
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                {/* Right 1 Col: Notifications & Upcoming Assessments */}
                <div className="space-y-6">
                  {/* Notifications Inbox */}
                  <Card
                    title="Trainee Notifications"
                    subtitle="System announcements and mentor feedback"
                    badge={
                      metrics.unread_notifications_count > 0 ? (
                        <Badge variant="brand" size="sm">
                          {metrics.unread_notifications_count} New
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          All Read
                        </Badge>
                      )
                    }
                  >
                    <div className="space-y-3 text-xs">
                      {metrics.unread_notifications_count > 0 && (
                        <div className="flex justify-end pb-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={markingAllRead}
                            onClick={handleMarkAllRead}
                            icon={<CheckCheck className="w-3.5 h-3.5 text-[#1976D2]" />}
                            className="text-[11px]"
                          >
                            {markingAllRead ? 'Marking...' : 'Mark All Read'}
                          </Button>
                        </div>
                      )}

                      {metrics.notifications.length === 0 ? (
                        <div className="py-6 text-center text-xs text-[#7C8DA1]">No notifications received.</div>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                          {metrics.notifications.map((n) => (
                            <div
                              key={n.id}
                              className={`p-3 rounded-xl border text-xs transition-all ${
                                !n.is_read
                                  ? 'bg-[#EAF3FF]/80 border-[#BCD7F5]'
                                  : 'bg-white border-[#DCE6F0]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className={`font-semibold ${!n.is_read ? 'text-[#124A78]' : 'text-[#17324D]'}`}>
                                  {n.title}
                                </span>
                                {!n.is_read && (
                                  <button
                                    onClick={() => handleMarkNotificationRead(n.id)}
                                    disabled={markingReadId === n.id}
                                    title="Mark as read"
                                    className="text-[10px] text-[#1976D2] hover:underline shrink-0"
                                  >
                                    Read
                                  </button>
                                )}
                              </div>
                              <p className="text-[11px] text-[#5D7188] mt-1 leading-relaxed">{n.message}</p>
                              <span className="text-[10px] text-[#7C8DA1] block mt-1.5">
                                {new Date(n.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Upcoming Assessments */}
                  <Card
                    title="Upcoming Assessments"
                    subtitle="Simulated diagnostic tests"
                    badge={
                      <Badge variant="neutral" size="sm">
                        {metrics.upcoming_assessments.length} Scheduled
                      </Badge>
                    }
                  >
                    <div className="space-y-2.5 text-xs">
                      {metrics.upcoming_assessments.length === 0 ? (
                        <div className="py-6 text-center text-xs text-[#7C8DA1]">
                          No upcoming simulation assessments scheduled.
                        </div>
                      ) : (
                        metrics.upcoming_assessments.map((a) => (
                          <div
                            key={a.id}
                            className="p-3 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0] space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#17324D]">{a.title}</span>
                              <Badge
                                variant={
                                  a.difficulty === 'ADVANCED'
                                    ? 'danger'
                                    : a.difficulty === 'INTERMEDIATE'
                                    ? 'warning'
                                    : 'success'
                                }
                                size="sm"
                              >
                                {a.difficulty}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-[#5D7188] block">
                              Type: {a.type} {a.due_at && `· Target Due: ${new Date(a.due_at).toLocaleDateString()}`}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 2: MY CURRICULUM ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          {/* Search & Actions */}
          <div className="bg-white p-3.5 rounded-xl border border-[#DCE6F0] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative">
              <Input
                value={searchPath}
                onChange={(e) => setSearchPath(e.target.value)}
                placeholder="Search curriculum tracks by title or description..."
                leftIcon={<Search className="w-4 h-4 text-[#7C8DA1]" />}
                className="w-full text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                aria-label="Filter assignments by status"
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs bg-[#F3F8FE] border border-[#DCE6F0] rounded-lg px-3 py-2.5 text-[#17324D] focus:outline-none focus:border-[#1976D2]"
              >
                <option value="ALL">All Statuses</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>

              <Button
                variant="secondary"
                size="sm"
                onClick={fetchAssignments}
                icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingAssignments ? 'animate-spin' : ''}`} />}
              >
                Refresh
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsEnrollModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Request Path
              </Button>
            </div>
          </div>

          {assignmentsError && (
            <Alert variant="error" title="Failed to Load Curriculum">
              {assignmentsError}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={fetchAssignments}>
                  Retry Request
                </Button>
              </div>
            </Alert>
          )}

          {loadingAssignments ? (
            <div className="py-16 text-center">
              <LoadingSpinner size="lg" message="Loading assigned curriculum paths..." />
            </div>
          ) : filteredAssignments.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="w-6 h-6 text-[#1976D2]" />}
              title="No Curriculum Paths Found"
              description={
                searchPath || statusFilter !== 'ALL'
                  ? 'No assigned curriculum matches your search filters.'
                  : 'You have no curriculum paths assigned yet. Contact your workshop supervisor or request a path.'
              }
              action={
                searchPath || statusFilter !== 'ALL' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchPath('');
                      setStatusFilter('ALL');
                    }}
                  >
                    Reset Filters
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setIsEnrollModalOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>
                    Request Curriculum Track
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAssignments.map((a) => (
                <Card
                  key={a.id}
                  title={a.path_title}
                  subtitle={`Enrolled: ${new Date(a.assigned_at).toLocaleDateString()}`}
                  badge={
                    <Badge
                      variant={
                        a.status === 'COMPLETED'
                          ? 'success'
                          : a.status === 'IN_PROGRESS'
                          ? 'warning'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {a.status}
                    </Badge>
                  }
                >
                  <div className="space-y-3 text-xs">
                    <p className="text-[#5D7188] leading-relaxed line-clamp-2">{a.path_description}</p>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-[#5D7188]">
                        <span>Curriculum Progress</span>
                        <span className="font-mono font-bold text-[#1976D2]">{a.progress_percentage}%</span>
                      </div>
                      <div className="w-full bg-[#E8EEF5] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-[#1976D2] to-[#15966A] h-full rounded-full transition-all"
                          style={{ width: `${a.progress_percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#7C8DA1] pt-1">
                      <span>Curriculum Modules: {a.total_items} Items</span>
                      {a.due_at && <span>Target Due: {new Date(a.due_at).toLocaleDateString()}</span>}
                    </div>

                    <div className="pt-2 border-t border-[#E8EEF5] flex items-center justify-between">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setInspectPath(a)}
                        icon={<Eye className="w-3.5 h-3.5 text-[#1976D2]" />}
                      >
                        Inspect Modules ({a.total_items})
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteAssignmentTarget(a)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        Unenroll
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROGRESS & RECORDS */}
      {activeTab === 'progress' && (
        <div className="space-y-6">
          {progressError && (
            <Alert variant="error" title="Failed to Load Progress Records">
              {progressError}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={fetchProgress}>
                  Retry Request
                </Button>
              </div>
            </Alert>
          )}

          {loadingProgress ? (
            <div className="py-16 text-center">
              <LoadingSpinner size="lg" message="Loading verified training records from audit log..." />
            </div>
          ) : progressData ? (
            <div className="space-y-6">
              {/* Summary Profile Card */}
              <div className="p-5 rounded-2xl bg-white border border-[#DCE6F0] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15966A] flex items-center justify-center font-bold text-lg shadow-xs">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[#17324D]">{progressData.name}</h3>
                    <p className="text-xs text-[#5D7188]">
                      Certified Medical Diagnostics Training Record · User ID: {progressData.user_id.slice(0, 8)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block">Total Executions</span>
                    <span className="font-mono font-black text-lg text-[#17324D]">
                      {progressData.procedure_runs.length} Runs
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block">Curriculums</span>
                    <span className="font-mono font-black text-lg text-[#15966A]">
                      {progressData.assignments.length} Paths
                    </span>
                  </div>
                </div>
              </div>

              {/* Verified Procedure Run Executions Table */}
              <Card
                title="Verified Procedure Run Executions"
                subtitle="Complete audit history of standard operating procedure runs"
                badge={
                  <Badge variant="success" size="sm">
                    {progressData.procedure_runs.length} Runs Logged
                  </Badge>
                }
              >
                {progressData.procedure_runs.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#7C8DA1]">
                    No procedure runs completed yet.
                  </div>
                ) : (
                  <div className="border border-[#DCE6F0] rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAFD] border-b border-[#DCE6F0] text-[#5D7188]">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Run ID</th>
                          <th className="py-2.5 px-3 font-semibold">Operating Procedure</th>
                          <th className="py-2.5 px-3 font-semibold">Equipment Asset</th>
                          <th className="py-2.5 px-3 font-semibold">Status</th>
                          <th className="py-2.5 px-3 font-semibold">Checkpoints</th>
                          <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EEF5]">
                        {progressData.procedure_runs.map((r) => (
                          <tr key={r.run_id} className="hover:bg-[#F3F8FE]/60">
                            <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-[#1976D2]">
                              #{r.run_id.slice(0, 8)}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-[#17324D]">{r.procedure_title}</td>
                            <td className="py-2.5 px-3 text-[#5D7188]">{r.machine_name || 'Laboratory Analyzer'}</td>
                            <td className="py-2.5 px-3">
                              <Badge variant={r.status === 'COMPLETED' ? 'success' : 'warning'} size="sm" dot>
                                {r.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#17324D]">
                              {r.completed_steps} / {r.total_steps}
                            </td>
                            <td className="py-2.5 px-3 text-[#5D7188] text-[11px]">
                              {new Date(r.completed_at || r.started_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          ) : null}
        </div>
      )}

      {/* INSPECT CURRICULUM ITEMS MODAL */}
      {inspectPath && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#BCD7F5] shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#DCE6F0] flex items-center justify-between bg-[#F8FAFD]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#17324D]">{inspectPath.path_title}</h3>
                  <p className="text-xs text-[#5D7188]">Ordered Curriculum Modules ({inspectPath.total_items})</p>
                </div>
              </div>
              <button
                onClick={() => setInspectPath(null)}
                className="w-8 h-8 rounded-lg hover:bg-[#E8EEF5] flex items-center justify-center text-[#5D7188]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0]">
                <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-1">Track Description</span>
                <p className="text-xs text-[#17324D] leading-relaxed">{inspectPath.path_description}</p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#17324D] block">Curriculum Sequence:</span>

                {!inspectPath.items || inspectPath.items.length === 0 ? (
                  <div className="p-6 text-center text-[#7C8DA1] border border-dashed border-[#DCE6F0] rounded-xl">
                    No curriculum items registered for this track.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {inspectPath.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl border border-[#DCE6F0] bg-white flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-lg bg-[#EAF3FF] text-[#1976D2] font-mono font-bold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-semibold text-xs text-[#17324D] block">{item.title}</span>
                            <span className="text-[10px] text-[#7C8DA1] uppercase font-mono">
                              Type: {item.item_type} · ID: {item.reference_id.slice(0, 8)}
                            </span>
                          </div>
                        </div>

                        <Badge
                          variant={
                            item.item_type === 'PROCEDURE'
                              ? 'brand'
                              : item.item_type === 'SIMULATION'
                              ? 'warning'
                              : 'success'
                          }
                          size="sm"
                        >
                          {item.item_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-[#DCE6F0] bg-[#F8FAFD] flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setInspectPath(null)}>
                Close Curriculum View
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST ENROLLMENT MODAL (WITH BACKEND GAP FLAG) */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#BCD7F5] shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] text-[#1976D2] flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#17324D]">Request Curriculum Track</h3>
                <p className="text-xs text-[#5D7188] mt-0.5">Apprenticeship enrollment governance</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-5 leading-relaxed">
              <span className="font-semibold block mb-1">Backend Notice:</span>
              Self-enrollment via <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[10px]">POST /api/v1/learning/assignments</code> is not exposed in this release. Under medical laboratory governance, curriculum tracks are assigned by platform administrators or certified clinical supervisors based on hospital onboarding policies.
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsEnrollModalOpen(false)}>
                Understood &amp; Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* UNENROLL MODAL (WITH BACKEND GAP FLAG) */}
      {deleteAssignmentTarget && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D98B13] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#17324D]">Curriculum Unenrollment Request</h3>
                <p className="text-xs text-[#5D7188] mt-0.5">
                  Track: <span className="font-semibold text-[#17324D]">{deleteAssignmentTarget.path_title}</span>
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-5 leading-relaxed">
              <span className="font-semibold block mb-1">Compliance Invariant:</span>
              The backend does not permit deleting learning assignments (<code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[10px]">DELETE /api/v1/learning/assignments/&#123;id&#125;</code>). Medical shopfloor accreditation requires indelible records of all assigned competencies and milestone attempts.
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleteAssignmentTarget(null)}>
                Understood &amp; Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

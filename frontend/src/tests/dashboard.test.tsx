import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { api } from '../lib/api/client';
import * as useAuthHook from '../hooks/useAuth';

// Mock API client
vi.mock('../lib/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiClientError: class extends Error {
    code = 'test_error';
    status = 400;
  },
}));

const mockExpertStats = {
  total_machines: 4,
  approved_articles: 6,
  procedures_count: 5,
  pending_reviews: 2,
  audio_references: 3,
  active_simulations: 1,
  user_sops_created: 4,
  user_sops_approved: 3,
  user_sops_pending: 1,
  user_sops_draft: 1,
  user_revisions_count: 7,
  user_machines_contributed: 2,
  user_captured_duration_seconds: 780.0, // 13m
  pending_reviews_for_user: 2,
  user_reviews_completed: 4,
  user_procedures_completed: 1,
  latest_draft_id: 'draft-sop-123',
  latest_draft_title: 'Centrifuge Calibration Protocol',
  recent_articles: [
    {
      id: 'art-1',
      title: 'Centrifuge High-Speed Calibration SOP',
      category: 'CALIBRATION',
      status: 'APPROVED',
      author_name: 'Dr. Jane Smith',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      machine_name: 'Beckman Coulter Optima',
      version_no: 2,
    },
    {
      id: 'art-2',
      title: 'Spectrophotometer Alignment Protocol',
      category: 'MAINTENANCE',
      status: 'PENDING_REVIEW',
      author_name: 'Dr. Jane Smith',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      machine_name: 'Thermo Scientific NanoDrop',
      version_no: 1,
    },
  ],
};

const mockTraineeMetrics = {
  welcome_message: 'Continue learning from approved procedures.',
  user_name: 'Devendra Verma',
  role_id: 'TRAINEE',
  assigned_paths_count: 1,
  completed_tasks_count: 2,
  assigned_paths: [{
    id: 'assignment-1', path_id: 'path-1', path_title: 'Equipment Basics',
    path_description: 'Approved equipment learning path.', status: 'IN_PROGRESS',
    progress_percentage: 40, assigned_at: '2026-10-01T00:00:00Z', total_items: 5, items: [],
  }],
  in_progress_procedures: [{
    run_id: 'run-1', procedure_id: 'procedure-1', procedure_title: 'Daily Safety Check',
    machine_name: 'MRI', status: 'IN_PROGRESS', started_at: '2026-10-01T00:00:00Z',
    completed_steps: 2, total_steps: 5, progress_percentage: 40,
  }],
  recent_activity: [{
    id: 'activity-1', type: 'PROCEDURE_RUN', title: 'Daily Safety Check',
    status: 'IN_PROGRESS', timestamp: '2026-10-01T00:00:00Z',
  }],
};

describe('Redesigned Operational Dashboard Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Expert Author dashboard with real greeting, role, and genuine contribution metrics', async () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'u-expert',
        name: 'Dr. Jane Smith',
        email: 'jane.smith@hospital.org',
        role_id: 'EXPERT',
        is_active: true,
        created_at: '2026-01-01',
      },
      permissions: [
        'knowledge.create',
        'knowledge.edit_own_draft',
        'knowledge.submit_review',
        'knowledge.approve',
        'procedure.execute',
        'audio.analyze',
      ],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: (perm: string) =>
        [
          'knowledge.create',
          'knowledge.edit_own_draft',
          'knowledge.submit_review',
          'knowledge.approve',
          'procedure.execute',
          'audio.analyze',
        ].includes(perm),
      hasRole: (role: string) => role === 'EXPERT',
    });

    (api.get as any).mockResolvedValueOnce(mockExpertStats);

    const { container } = render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    // Primary headline and editorial messaging
    expect(screen.getByText(/Your Experience./i)).toBeInTheDocument();
    expect(screen.getByText(/Their Future./i)).toBeInTheDocument();

    // Primary action buttons for expert
    expect(screen.getAllByText(/Capture Knowledge/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Explore My Knowledge/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Capture Knowledge/i })).toHaveAttribute(
      'href',
      '/app/knowledge-assets?kind=notes'
    );
    expect(screen.getByRole('link', { name: /Video$/ })).toHaveAttribute(
      'href',
      '/app/knowledge-assets?kind=video'
    );
    expect(screen.getByRole('link', { name: /Audio$/ })).toHaveAttribute(
      'href',
      '/app/knowledge-assets?kind=audio'
    );
    expect(screen.getByRole('link', { name: /Notes$/ })).toHaveAttribute(
      'href',
      '/app/knowledge-assets?kind=notes'
    );
    expect(screen.getByRole('link', { name: /Photos$/ })).toHaveAttribute(
      'href',
      '/app/knowledge-assets?kind=image'
    );

    // The redesigned Expert Home keeps its four intended capture and knowledge sections.
    expect(screen.queryByText(/Review & Verify Knowledge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Knowledge Assistant/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/My Knowledge Overview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View My Knowledge \(/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending Review')).not.toBeInTheDocument();
    expect(screen.queryByText('To Capture')).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue a Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recently Shared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resume Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending peer evaluations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View History/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Knowledge Entries Recorded/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('section')).toHaveLength(4);
    expect(Array.from(container.querySelectorAll('div')).some((element) =>
      element.className.includes('w-full') && element.className.includes('space-y-7'),
    )).toBe(true);
    expect(screen.getByRole('link', { name: /Explore My Knowledge/i })).toHaveAttribute('href', '/app/knowledge');
    expect(screen.queryByText(/Ask Assistant/i)).not.toBeInTheDocument();

    // MANDATORY REMOVALS: Verify the 6 legacy metrics are completely ABSENT from DOM
    expect(screen.queryByText('SOPs Created')).not.toBeInTheDocument();
    expect(screen.queryByText('Approved SOPs')).not.toBeInTheDocument();
    expect(screen.queryByText('Assigned Reviews')).not.toBeInTheDocument();
    expect(screen.queryByText('Expertise Captured')).not.toBeInTheDocument();
    expect(screen.queryByText('SOP Revisions')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipment Covered')).not.toBeInTheDocument();

    // MANDATORY REMOVALS: Verify the Quality & Governance panel is ABSENT from DOM
    expect(screen.queryByText(/Peer Approval Rate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Approved Contributions/i)).not.toBeInTheDocument();

    // Verify the THREE removed technical cards are NOT present on dashboard
    expect(screen.queryByText(/System & Database Health/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Role-Based Access \(RBAC\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grounded Industrial Assets/i)).not.toBeInTheDocument();

    expect(screen.queryByText(/Centrifuge High-Speed Calibration SOP/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Spectrophotometer Alignment Protocol/i)).not.toBeInTheDocument();
  });

  it('renders Trainee dashboard with trainee-scoped metrics and safe guided actions', async () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'u-trainee',
        name: 'Devendra Verma',
        email: 'trainee@demo.local',
        role_id: 'TRAINEE',
        is_active: true,
        created_at: '2026-01-01',
      },
      permissions: ['knowledge.view_published', 'procedure.execute', 'assistant.use', 'troubleshoot.use', 'audio.analyze'],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: (perm: string) =>
        ['knowledge.view_published', 'procedure.execute', 'assistant.use', 'troubleshoot.use', 'audio.analyze'].includes(perm),
      hasRole: (role: string) => role === 'TRAINEE',
    });

    (api.get as any).mockResolvedValueOnce(mockTraineeMetrics);

    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: 'Welcome, Devendra Verma' })).toBeInTheDocument();
    expect(screen.getByText(/Trainee dashboard/i)).toBeInTheDocument();

    // Trainees must NOT see Expert-only draft capture or review queue buttons
    expect(screen.queryByText(/Capture New Knowledge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Review Queue \(/i)).not.toBeInTheDocument();

    // Real progress, recent activity, and an in-progress workflow are shown.
    expect(await screen.findByRole('link', { name: /Continue workflow/i })).toHaveAttribute('href', '/app/guided-workflows');

    await waitFor(() => {
      expect(screen.getByText('Equipment Basics')).toBeInTheDocument();
      expect(screen.getByText('Completed training tasks')).toBeInTheDocument();
      expect(screen.getAllByText('Daily Safety Check')).toHaveLength(2);
    });

    for (const [label, href] of [
      ['Knowledge Library', '/app/knowledge'], ['AI Tutor', '/app/assistant'],
      ['Troubleshooting', '/app/troubleshooting'], ['Guided Workflow', '/app/guided-workflows'],
      ['Audio Matching', '/app/sound-analysis'],
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('href', href);
    }

    // Technical cards remain removed
    expect(screen.queryByText(/System & Database Health/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Role-Based Access \(RBAC\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grounded Industrial Assets/i)).not.toBeInTheDocument();
  });

  it('shows useful empty states without inventing trainee progress', async () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: { id: 'u-trainee', name: 'Devendra Verma', email: 'trainee@demo.local', role_id: 'TRAINEE', is_active: true, created_at: '2026-01-01' },
      permissions: ['knowledge.view_published', 'procedure.execute', 'assistant.use', 'troubleshoot.use', 'audio.analyze'],
      isAuthenticated: true, isLoading: false, error: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
      hasPermission: (perm: string) => ['knowledge.view_published', 'procedure.execute', 'assistant.use', 'troubleshoot.use', 'audio.analyze'].includes(perm),
      hasRole: (role: string) => role === 'TRAINEE',
    });
    (api.get as any).mockResolvedValueOnce({
      ...mockTraineeMetrics, assigned_paths_count: 0, completed_tasks_count: 0,
      assigned_paths: [], in_progress_procedures: [], recent_activity: [],
    });

    render(<BrowserRouter><DashboardPage /></BrowserRouter>);

    expect(await screen.findByText('No learning paths assigned yet')).toBeInTheDocument();
    expect(screen.getByText('No recent activity yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Continue workflow/i })).not.toBeInTheDocument();
    expect(screen.getByText('Completed training tasks')).toBeInTheDocument();
  });

  it('renders the administrator dashboard instead of the expert author workspace', async () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'u-admin',
        name: 'Platform Admin',
        email: 'admin@demo.local',
        role_id: 'ADMIN',
        is_active: true,
        created_at: '2026-01-01',
      },
      permissions: ['knowledge.view_published', 'assistant.use', 'procedure.execute', 'admin.manage'],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: (perm: string) => ['knowledge.view_published', 'assistant.use', 'procedure.execute', 'admin.manage'].includes(perm),
      hasRole: (role: string) => role === 'ADMIN',
    });

    (api.get as any).mockResolvedValueOnce(mockExpertStats).mockResolvedValueOnce(null);

    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Welcome back, Platform Admin/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your Experience\./i)).not.toBeInTheDocument();
    expect(screen.getByText(/Open System Health & Diagnostic Telemetry/i)).toBeInTheDocument();
  });

  it('keeps removed home sections absent when there are no drafts or shared entries', async () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'u-expert',
        name: 'Dr. Jane Smith',
        email: 'jane.smith@hospital.org',
        role_id: 'EXPERT',
        is_active: true,
        created_at: '2026-01-01',
      },
      permissions: ['knowledge.create'],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: (perm: string) => perm === 'knowledge.create',
      hasRole: (role: string) => role === 'EXPERT',
    });

    (api.get as any).mockResolvedValueOnce({
      ...mockExpertStats,
      recent_articles: [],
    });

    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Start Capturing/i })).toBeInTheDocument();
    });
    expect(screen.queryByText('My Knowledge Overview')).not.toBeInTheDocument();
    expect(screen.queryByText(/Review & Verify Knowledge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue a Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recently Shared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Knowledge Entries Recorded/i)).not.toBeInTheDocument();
  });
});

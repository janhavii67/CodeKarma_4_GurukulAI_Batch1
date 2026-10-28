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

const mockTraineeStats = {
  ...mockExpertStats,
  user_sops_created: 0,
  user_sops_approved: 0,
  user_sops_pending: 0,
  user_sops_draft: 0,
  user_revisions_count: 0,
  user_machines_contributed: 0,
  user_captured_duration_seconds: 0,
  pending_reviews_for_user: 0,
  user_reviews_completed: 0,
  user_procedures_completed: 3,
  latest_draft_id: null,
  latest_draft_title: null,
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

    // The expert Home keeps its capture, overview, and hero sections only.
    expect(screen.queryByText(/Review & Verify Knowledge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Knowledge Assistant/i)).not.toBeInTheDocument();
    expect(screen.getByText(/My Knowledge Overview/i)).toBeInTheDocument();
    expect(screen.queryByText(/Continue a Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recently Shared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resume Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending peer evaluations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View History/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Knowledge Entries Recorded/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('section')).toHaveLength(3);
    expect(Array.from(container.querySelectorAll('div')).some((element) =>
      element.className.includes('max-w-6xl'),
    )).toBe(true);
    expect(Array.from(container.querySelectorAll('div')).some((element) =>
      element.className.includes('sm:grid-cols-2') && element.className.includes('lg:grid-cols-3'),
    )).toBe(true);
    expect(screen.getByText(/Start Capturing →/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start Capturing/i })).toHaveAttribute(
      'href',
      '/app/knowledge-assets'
    );
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
      permissions: ['knowledge.view_published', 'procedure.execute', 'assistant.use'],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: (perm: string) =>
        ['knowledge.view_published', 'procedure.execute', 'assistant.use'].includes(perm),
      hasRole: (role: string) => role === 'TRAINEE',
    });

    (api.get as any).mockResolvedValueOnce(mockTraineeStats);

    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Welcome back, Devendra Verma/i)).toBeInTheDocument();
    expect(screen.getByText(/Laboratory & Clinical Trainee/i)).toBeInTheDocument();

    // Trainees must NOT see Expert-only draft capture or review queue buttons
    expect(screen.queryByText(/Capture New Knowledge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Review Queue \(/i)).not.toBeInTheDocument();

    // Guided workflow execution is prominent for Trainees
    expect(screen.getByText(/Start Guided Workflow/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Guided Checklists')).toBeInTheDocument();
      expect(screen.getByText('Checklists Completed')).toBeInTheDocument();
      expect(screen.getByText('Active Machines')).toBeInTheDocument();
    });

    // Technical cards remain removed
    expect(screen.queryByText(/System & Database Health/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Role-Based Access \(RBAC\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grounded Industrial Assets/i)).not.toBeInTheDocument();
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
      expect(screen.getByText('My Knowledge Overview')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Review & Verify Knowledge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue a Draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recently Shared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Knowledge Entries Recorded/i)).not.toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeDetailPage } from '../features/knowledge/KnowledgeDetailPage';
import type { KnowledgeItemDetail, KnowledgeVersion } from '../features/knowledge-capture/types';

// Mock Auth
const authState = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string; role_id: string },
  permissions: [] as string[],
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    ...authState,
    hasRole: (role: string) => authState.user?.role_id === role,
    hasPermission: (permission: string) => authState.permissions.includes(permission),
  }),
}));

// Mock API client
const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('../lib/api/client', () => ({
  api: {
    get: mockGet,
    post: mockPost,
    postForm: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status?: number;
    code?: string;
    constructor(message: string, status?: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

const mockPublishedVersion: KnowledgeVersion = {
  id: 'ver-published-1',
  item_id: 'item-mri-1',
  version_no: 2,
  title: 'MRI Cryocooler Coldhead Replacement SOP',
  machine_id: 'mach-mri-1',
  status: 'published',
  summary: 'Certified procedure for replacing the coldhead displacer under pressurized helium loop.',
  description: 'Maintains cryostat vacuum integrity and coldhead stroke efficiency on 1.5T MRI systems.',
  content: null,
  operating_conditions: 'Helium return pressure 2.1 bar · Room temp 20°C ± 2°C',
  prerequisites: 'Safety goggles, cryogenic non-magnetic gloves, calibrated torque wrench, vacuum leak detector.',
  safety_warnings: 'Extreme cold burn hazard! Wear cryogenic PPE. Never break helium seal under positive line pressure.',
  common_mistakes: 'Failure to de-energize gradient coil power supply before handling coldhead leads.',
  corrective_actions: 'Execute helium top-up protocol SOP-HE-02 if return pressure drops below 1.8 bar.',
  steps: [
    {
      order: 1,
      title: 'De-energize Compressor & Relieve Pressure',
      instruction: 'Switch compressor circuit breaker to OFF and tag out. Connect recovery line to manifold relief valve.',
      tools: ['Pressure manifold gauge', 'Safety tag'],
      safety_warning: 'Ensure relief valve points away from personnel.',
      expected_result: 'Manifold pressure gauge reads 0.0 bar.',
      stop_condition: 'Do not proceed if valve shows helium vent frosting.',
      needs_review: false,
      source_segment_ids: [],
      ai_generated: false,
      note: 'Log baseline pressure in equipment logbook.',
    },
    {
      order: 2,
      title: 'Disengage Coldhead Flange Bolts',
      instruction: 'Loosen 8x M10 brass non-magnetic bolts in cross-diagonal sequence.',
      tools: ['Non-magnetic torque wrench', '17mm brass socket'],
      safety_warning: 'Do not use ferromagnetic steel tools near magnet bore.',
      expected_result: 'Flange disengages smoothly without vacuum seal tearing.',
      stop_condition: null,
      needs_review: false,
      source_segment_ids: [],
      ai_generated: false,
      note: null,
    },
  ],
  source_refs: [
    {
      source_title: 'Siemens Magnetom Aera Field Service Guide',
      manual_number: 'MN-MR-AERA-901',
      revision: 'Rev 4.2',
      pdf_pages: [142, 143],
      section: 'Section 8.4 Cryostat Maintenance',
      verification: {
        status: 'verified',
        audience_clearance: 'trainee_authorized',
        verified_by_name: 'Dr. Sarah Lin (Chief Biomedical Engineer)',
        verified_at: '2026-08-15T10:00:00Z',
      },
    },
  ],
  origin: 'expert',
  revision_reason: 'Updated torque specifications',
  created_by: 'user-expert-1',
  submitted_at: '2026-08-14T09:00:00Z',
  published_at: '2026-08-15T10:00:00Z',
  created_at: '2026-08-14T08:00:00Z',
  updated_at: '2026-08-15T10:00:00Z',
};

const mockItemDetail: KnowledgeItemDetail = {
  id: 'item-mri-1',
  title: 'MRI Cryocooler Coldhead Replacement SOP',
  machine_id: 'mach-mri-1',
  author_id: 'user-expert-1',
  current_published_version_id: 'ver-published-1',
  is_demo: false,
  status: 'published',
  rag_indexed: true,
  rag_chunks_count: 4,
  created_at: '2026-08-14T08:00:00Z',
  updated_at: '2026-08-15T10:00:00Z',
  version: mockPublishedVersion,
  machine: {
    id: 'mach-mri-1',
    name: 'Magnetom Aera 1.5T',
    code: 'MRI-AERA-01',
    model_number: 'Aera-2023',
    manufacturer: 'Siemens Healthineers',
    category: 'Magnetic Resonance Imaging',
    is_demo: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
};

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const renderDetail = (
  role = 'TRAINEE',
  permissions = ['knowledge.view_published'],
  item = mockItemDetail
) => {
  mockGet.mockImplementation((path: string) => {
    if (path.startsWith('/knowledge/item-mri-1/versions/') && path.endsWith('/media')) {
      return Promise.resolve([]);
    }
    if (path.startsWith('/knowledge/item-mri-1')) {
      return Promise.resolve(item);
    }
    return Promise.reject(new Error(`Unknown path: ${path}`));
  });

  authState.user = {
    id: role === 'TRAINEE' ? 'user-trainee-1' : 'user-expert-1',
    name: role === 'TRAINEE' ? 'Devendra Verma' : 'Dr. Expert',
    email: 'user@example.com',
    role_id: role,
  };
  authState.permissions = permissions;
  authState.isAuthenticated = true;
  authState.isLoading = false;

  const qc = makeQueryClient();

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/app/knowledge/item-mri-1']}>
        <Routes>
          <Route path="/app/knowledge/:id" element={<KnowledgeDetailPage />} />
          <Route path="/app/knowledge" element={<div>Library Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Knowledge Detail Read-Only Experience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders clean read-only view and NEVER displays expert editing form or input fields', async () => {
    renderDetail('TRAINEE', ['knowledge.view_published']);

    // Title and status
    expect(await screen.findByRole('heading', { level: 1, name: /MRI Cryocooler Coldhead Replacement SOP/i })).toBeInTheDocument();
    expect(screen.getAllByText('Magnetom Aera 1.5T').length).toBeGreaterThanOrEqual(1);

    // Must NOT render Expert Editor elements
    expect(screen.queryByText(/Capture Precision Equipment Knowledge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TITLE \*/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Start a knowledge draft/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Revision/i })).not.toBeInTheDocument();
  });

  it('displays structured SOP layout with sequential steps, tooling, and safety cautions', async () => {
    renderDetail('TRAINEE', ['knowledge.view_published']);

    expect((await screen.findAllByText(/1\. Overview, Purpose & Scope/i)).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Certified procedure for replacing the coldhead displacer/i)
    ).toBeInTheDocument();

    // Prerequisites
    expect((screen.getAllByText(/2\. Required Equipment & Prerequisites/i)).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Safety goggles, cryogenic non-magnetic gloves/i)
    ).toBeInTheDocument();

    // Procedure Steps
    expect((screen.getAllByText(/3\. Step-by-Step Procedure/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('De-energize Compressor & Relieve Pressure')).toBeInTheDocument();
    expect(
      screen.getByText(/Switch compressor circuit breaker to OFF and tag out/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Disengage Coldhead Flange Bolts')).toBeInTheDocument();
    expect(screen.getByText('Manifold pressure gauge reads 0.0 bar.')).toBeInTheDocument();
    expect(
      screen.getByText(/Do not use ferromagnetic steel tools near magnet bore/i)
    ).toBeInTheDocument();

    // Safety Warnings
    expect(
      screen.getAllByText(/4\. Warnings, Precautions & Common Mistakes/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Extreme cold burn hazard! Wear cryogenic PPE/i)
    ).toBeInTheDocument();

    // Source Manual References
    expect(
      screen.getAllByText(/6\. Source Manuals/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('Siemens Magnetom Aera Field Service Guide')
    ).toBeInTheDocument();
    expect(screen.getByText(/MN-MR-AERA-901/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ Verified Source/i)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Sarah Lin/i)).toBeInTheDocument();
  });

  it('shows "Not provided in the verified source" when optional sections are missing', async () => {
    const sparseVersion: KnowledgeVersion = {
      ...mockPublishedVersion,
      summary: null,
      description: null,
      prerequisites: null,
      operating_conditions: null,
      safety_warnings: null,
      common_mistakes: null,
      corrective_actions: null,
      steps: [],
      content: null,
      source_refs: [],
    };
    const sparseItem: KnowledgeItemDetail = {
      ...mockItemDetail,
      version: sparseVersion,
    };

    renderDetail('TRAINEE', ['knowledge.view_published'], sparseItem);

    expect(await screen.findByRole('heading', { level: 1, name: /MRI Cryocooler Coldhead Replacement SOP/i })).toBeInTheDocument();
    const notProvidedElements = screen.getAllByText('Not provided in the verified source');
    expect(notProvidedElements.length).toBeGreaterThan(0);
  });

  it('enables explicit Edit/Revision action only for authorized Experts, never Trainees', async () => {
    // 1. Trainee perspective: No edit controls
    const { unmount } = renderDetail('TRAINEE', ['knowledge.view_published']);
    expect(await screen.findByRole('heading', { level: 1, name: /MRI Cryocooler Coldhead Replacement SOP/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Revision/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Edit Draft/i })).not.toBeInTheDocument();
    unmount();

    // 2. Expert perspective: New Revision button is visible for published item
    renderDetail('EXPERT', ['knowledge.view_published', 'knowledge.create']);
    expect(await screen.findByRole('heading', { level: 1, name: /MRI Cryocooler Coldhead Replacement SOP/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Revision/i })).toBeInTheDocument();
  });

  it('blocks Trainees from viewing unpublished drafts with a safety compliance notice', async () => {
    const draftVersion: KnowledgeVersion = {
      ...mockPublishedVersion,
      status: 'draft',
    };
    const draftItem: KnowledgeItemDetail = {
      ...mockItemDetail,
      version: draftVersion,
    };

    renderDetail('TRAINEE', ['knowledge.view_published'], draftItem);

    expect(await screen.findByText('Unpublished Procedure')).toBeInTheDocument();
    expect(
      screen.getByText(/has not yet been approved or published for apprentice or operator execution/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to Knowledge Library/i })).toBeInTheDocument();
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { LibraryPage } from '../features/knowledge-capture/LibraryPage';
import { KnowledgeEditorPage } from '../features/knowledge-capture/KnowledgeEditorPage';
import { StepEditor } from '../features/knowledge-capture/StepEditor';
import { StatusBadge } from '../features/knowledge-capture/StatusBadge';
import type { Step } from '../features/knowledge-capture/types';

// ─── Mock API ─────────────────────────────────────────────────────────────────

vi.mock('../lib/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiClientError: class extends Error {
    status: number;
    code: string;
    constructor(arg1: any, arg2?: any, arg3?: any) {
      if (typeof arg1 === 'number') {
        super(arg3 || '');
        this.status = arg1;
        this.code = String(arg2 || '');
      } else {
        super(arg2 || '');
        this.code = String(arg1 || '');
        this.status = typeof arg3 === 'number' ? arg3 : 400;
      }
    }
  },
}));

import { api } from '../lib/api/client';
const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// ─── Test Data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'expert@test.com',
  name: 'Aarav Sharma',
  role_id: 'EXPERT' as const,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const mockVersion = {
  id: 'ver-1',
  item_id: 'item-1',
  version_no: 1,
  status: 'draft' as const,
  summary: 'Test summary',
  description: 'Test description',
  steps: [],
  origin: 'expert' as const,
  revision_reason: null,
  created_by: 'user-1',
  submitted_at: null,
  published_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

const mockItemDetail = {
  id: 'item-1',
  title: 'CNC Lathe Startup',
  machine_id: null,
  author_id: 'user-1',
  current_published_version_id: null,
  is_demo: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  version: mockVersion,
  machine: null,
};

const mockListItem = {
  id: 'item-1',
  title: 'CNC Lathe Startup',
  machine_id: null,
  author_id: 'user-1',
  current_published_version_id: null,
  is_demo: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  version_id: 'ver-1',
  version_no: 1,
  version_status: 'draft' as const,
  version_summary: null,
  version_updated_at: '2026-01-02T00:00:00Z',
  machine: null,
};

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function withProviders(ui: React.ReactElement, options?: { initialEntries?: string[] }) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={options?.initialEntries ?? ['/']}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── StatusBadge Tests ────────────────────────────────────────────────────────

describe('StatusBadge', () => {
  it('renders correct label for each status', () => {
    const statuses = [
      ['draft', 'Draft'],
      ['in_review', 'In Review'],
      ['changes_requested', 'Changes Requested'],
      ['rejected', 'Rejected'],
      ['approved', 'Approved'],
      ['published', 'Published'],
      ['superseded', 'Superseded'],
      ['withdrawn', 'Withdrawn'],
    ] as const;

    for (const [status, label] of statuses) {
      const { container } = render(<StatusBadge status={status} />);
      expect(container.textContent).toContain(label);
    }
  });
});

// ─── StepEditor Tests ─────────────────────────────────────────────────────────

describe('StepEditor', () => {
  const emptyChangeHandler = vi.fn();

  it('shows empty state with Add Step button in edit mode', () => {
    render(<StepEditor steps={[]} isReadOnly={false} onChange={emptyChangeHandler} />);
    expect(screen.getByText(/Add your first step/i)).toBeInTheDocument();
  });

  it('shows empty message in read-only mode with no steps', () => {
    render(<StepEditor steps={[]} isReadOnly={true} onChange={emptyChangeHandler} />);
    expect(screen.getByText(/No steps have been recorded/i)).toBeInTheDocument();
  });

  it('renders step cards for provided steps', () => {
    const steps: Step[] = [
      {
        order: 1,
        title: 'Power On',
        instruction: 'Press the green button',
        tools: ['Key'],
        safety_warning: null,
        expected_result: null,
        stop_condition: null,
        needs_review: false,
        source_segment_ids: [],
        ai_generated: false,
        note: null,
      },
    ];
    render(<StepEditor steps={steps} isReadOnly={false} onChange={emptyChangeHandler} />);
    expect(screen.getByText('Power On')).toBeInTheDocument();
    expect(screen.getByText('STEP 1')).toBeInTheDocument();
  });

  it('calls onChange when Add Step button is clicked', () => {
    const handler = vi.fn();
    render(<StepEditor steps={[]} isReadOnly={false} onChange={handler} />);
    fireEvent.click(screen.getByText(/Add your first step/i));
    expect(handler).toHaveBeenCalledTimes(1);
    const newSteps = handler.mock.calls[0][0] as Step[];
    expect(newSteps).toHaveLength(1);
    expect(newSteps[0].order).toBe(1);
  });

  it('does not render Add Step button in read-only mode', () => {
    render(<StepEditor steps={[]} isReadOnly={true} onChange={emptyChangeHandler} />);
    expect(screen.queryByText(/Add your first step/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Step/i })).not.toBeInTheDocument();
  });

  it('shows needs_review flag on step card when set', () => {
    const steps: Step[] = [
      {
        order: 1,
        title: 'Check Pressure',
        instruction: 'Read the gauge',
        tools: [],
        safety_warning: null,
        expected_result: null,
        stop_condition: null,
        needs_review: true,
        source_segment_ids: [],
        ai_generated: false,
        note: null,
      },
    ];
    render(<StepEditor steps={steps} isReadOnly={false} onChange={vi.fn()} />);
    expect(screen.getByText(/Needs Review/i)).toBeInTheDocument();
  });
});

// ─── LibraryPage Tests ────────────────────────────────────────────────────────

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Auth: expert user
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.resolve({ user: mockUser, permissions: ['knowledge.create'] });
      if (path.includes('/machines'))
        return Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 });
      if (path.includes('/knowledge'))
        return Promise.resolve({ items: [mockListItem], total: 1, page: 1, page_size: 15 });
      return Promise.reject(new Error('Unknown path'));
    });
  });

  it('renders page heading', async () => {
    withProviders(<LibraryPage />);
    expect(await screen.findByText(/Knowledge Library & Authoring Repository/i)).toBeInTheDocument();
  });

  it('shows Create button for users with knowledge.create permission', async () => {
    withProviders(<LibraryPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New Knowledge Item/i })).toBeInTheDocument()
    );
  });

  it('renders a knowledge list item when API returns data', async () => {
    withProviders(<LibraryPage />);
    await waitFor(() => expect(screen.getByText('CNC Lathe Startup')).toBeInTheDocument());
  });

  it('renders search input and filter selects', () => {
    withProviders(<LibraryPage />);
    expect(screen.getByRole('textbox', { name: /Search knowledge items/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Filter by machine/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Filter by status/i })).toBeInTheDocument();
  });

  it('shows create modal when Create button clicked', async () => {
    withProviders(<LibraryPage />);
    await waitFor(() =>
      fireEvent.click(screen.getByRole('button', { name: /New Knowledge Item/i }))
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
  });

  it('closes create modal on Cancel', async () => {
    withProviders(<LibraryPage />);
    await waitFor(() =>
      fireEvent.click(screen.getByRole('button', { name: /New Knowledge Item/i }))
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows validation error when trying to create without title', async () => {
    withProviders(<LibraryPage />);
    await waitFor(() =>
      fireEvent.click(screen.getByRole('button', { name: /New Knowledge Item/i }))
    );
    fireEvent.click(screen.getByRole('button', { name: /Create Draft/i }));
    expect(screen.getByText(/Title is required/i)).toBeInTheDocument();
  });

  it('shows empty state for trainee with no published items', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.resolve({
          user: { ...mockUser, role_id: 'TRAINEE' },
          permissions: [],
        });
      if (path.includes('/machines'))
        return Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 });
      if (path.includes('/knowledge'))
        return Promise.resolve({ items: [], total: 0, page: 1, page_size: 15 });
      return Promise.reject(new Error('Unknown path'));
    });

    withProviders(<LibraryPage />);
    await waitFor(() =>
      expect(screen.getByText(/No knowledge items found/i)).toBeInTheDocument()
    );
    // Trainee should NOT see Create button
    expect(screen.queryByRole('button', { name: /New Knowledge Item/i })).not.toBeInTheDocument();
  });
});

// ─── KnowledgeEditorPage Tests ────────────────────────────────────────────────

describe('KnowledgeEditorPage', () => {
  function renderEditor(versionStatus = 'draft', authorId = 'user-1', permissions = ['knowledge.create'], versionList = [{ ...mockVersion, status: versionStatus as any }], compareResponse?: unknown) {
    const item = {
      ...mockItemDetail,
      author_id: authorId,
      version: { ...versionList[0], status: versionStatus as any, created_by: authorId },
    };
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.resolve({ user: mockUser, permissions });
      if (path.includes('/compare'))
        return compareResponse === undefined ? Promise.reject(new Error('No comparison configured')) : Promise.resolve(compareResponse);
      if (path.includes('/versions'))
        return Promise.resolve(versionList);
      if (path.startsWith('/machines'))
        return Promise.resolve({
          items: [
            { id: 'machine-mri', name: 'MRI', code: 'MRI-001', model_number: 'MRI-001', manufacturer: null, category: 'Medical Equipment', is_demo: false },
            { id: 'machine-xray', name: 'Xray', code: 'XRAY-001', model_number: 'XRAY-001', manufacturer: null, category: 'Medical Equipment', is_demo: false },
          ],
          total: 1,
          page: 1,
          page_size: 100,
        });
      if (path.startsWith('/knowledge/item-1'))
        return Promise.resolve(item);
      return Promise.reject(new Error(`Unknown: ${path}`));
    });

    const qc = makeQueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/knowledge/item-1']}>
          <AuthProvider>
            <Routes>
              <Route path="/app/knowledge/:id" element={<KnowledgeEditorPage />} />
              <Route path="/app/knowledge" element={<div>Library</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.resolve({ user: mockUser, permissions: ['knowledge.create'] });
      return new Promise(() => {}); // Never resolves — keeps loading state
    });
    const qc = makeQueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/knowledge/item-1']}>
          <AuthProvider>
            <Routes>
              <Route path="/app/knowledge/:id" element={<KnowledgeEditorPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    // Loading skeleton shows animate-pulse elements
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders the item title once loaded', async () => {
    renderEditor('draft');
    await waitFor(() => expect(screen.getByText('CNC Lathe Startup')).toBeInTheDocument());
  });

  it('shows editable fields for own draft', async () => {
    renderEditor('draft', 'user-1');
    await waitFor(() => expect(screen.getByText('Steps')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
  });

  it('saves machine association and multiline technical knowledge in the existing draft version', async () => {
    const user = userEvent.setup();
    const version = {
      ...mockVersion,
      content: 'Operating principles:\nLine one.\n\nLine two.',
      common_mistakes: 'Symptom: example only.\nCause: UNKNOWN.',
    };
    renderEditor('draft', 'user-1', ['knowledge.create'], [version]);

    const content = await screen.findByRole('textbox', { name: 'Machine-specific technical knowledge' });
    expect(content).toHaveValue('Operating principles:\nLine one.\n\nLine two.');
    fireEvent.change(content, { target: { value: 'Purpose:\nVerified line A.\n\nVerified line B.' } });

    await user.click(screen.getByRole('button', { name: 'Additional Information' }));
    const commonMistakes = screen.getByRole('textbox', { name: 'Common mistakes, symptoms and verified causes' });
    fireEvent.change(commonMistakes, { target: { value: 'Observed symptom:\nPossible cause, not yet confirmed.' } });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Machine association' }), 'machine-xray');
    await user.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith(
      '/knowledge/item-1',
      expect.objectContaining({
        machine_id: 'machine-xray',
        content: 'Purpose:\nVerified line A.\n\nVerified line B.',
        common_mistakes: 'Observed symptom:\nPossible cause, not yet confirmed.',
      }),
    ));
  });

  it('saves document revision and page citations while preserving related-knowledge references', async () => {
    const user = userEvent.setup();
    const relatedReference = { type: 'knowledge', title: 'Existing linked SOP', version_no: 2 };
    const version = { ...mockVersion, source_refs: [relatedReference] };
    renderEditor('draft', 'user-1', ['knowledge.create'], [version]);

    await user.type(await screen.findByLabelText('Source document title'), 'Uganda ECG training manual');
    await user.type(screen.getByLabelText('Revision / date'), 'February 2020');
    await user.type(screen.getByLabelText('PDF page(s)'), '78, 79');
    await user.type(screen.getByLabelText('Printed page(s)'), '70, 71');
    await user.type(screen.getByLabelText('Section'), '3.20 ECG');
    await user.click(screen.getByRole('button', { name: 'Add source reference' }));
    await user.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith(
      '/knowledge/item-1',
      expect.objectContaining({
        source_refs: [
          relatedReference,
          {
            type: 'document',
            source_title: 'Uganda ECG training manual',
            revision: 'February 2020',
            pdf_pages: ['78', '79'],
            printed_pages: ['70', '71'],
            section: '3.20 ECG',
            verification: { status: 'unverified', audience_clearance: 'unknown' },
          },
        ],
      }),
    ));
  });

  it('records machine identity, source provenance, audience clearance, and explicit verification on a draft', async () => {
    const user = userEvent.setup();
    renderEditor('draft', 'user-1', ['knowledge.create'], [{ ...mockVersion, machine_id: 'machine-mri' }]);

    await user.type(await screen.findByLabelText('Source document title'), 'Test MRI manual');
    await user.type(screen.getByLabelText('Revision / date'), 'Revision 4');
    await user.type(screen.getByLabelText('PDF page(s)'), '12');
    await user.type(screen.getByLabelText('Section'), 'Identification');
    await user.type(screen.getByLabelText('Source provenance'), 'Controlled OEM document register');
    await user.type(screen.getByLabelText('Source manufacturer'), 'Acme Imaging');
    await user.type(screen.getByLabelText('Source exact model'), 'MRI-X1');
    await user.type(screen.getByLabelText('Verified machine manufacturer'), 'Acme Imaging');
    await user.type(screen.getByLabelText('Verified machine exact model'), 'MRI-X1');
    await user.selectOptions(screen.getByLabelText('Machine identity basis'), 'asset_plate');
    await user.type(screen.getByLabelText('Identity evidence reference'), 'Plate inspected on test fixture');
    await user.selectOptions(screen.getByLabelText('Source audience clearance'), 'trainee_authorized');
    await user.click(screen.getByLabelText('Mark source verified'));
    await user.click(screen.getByRole('button', { name: 'Add source reference' }));
    await user.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith(
      '/knowledge/item-1',
      expect.objectContaining({
        source_refs: [expect.objectContaining({
          source_title: 'Test MRI manual',
          verification: {
            status: 'verified',
            audience_clearance: 'trainee_authorized',
            source_provenance: 'Controlled OEM document register',
            source_manufacturer: 'Acme Imaging',
            source_model: 'MRI-X1',
            machine_manufacturer: 'Acme Imaging',
            machine_model: 'MRI-X1',
            machine_identity_basis: 'asset_plate',
            machine_identity_reference: 'Plate inspected on test fixture',
          },
        })],
      }),
    ));
  });

  it('allows an author to remove a mismatched related-source link in a draft revision', async () => {
    const user = userEvent.setup();
    renderEditor('draft', 'user-1', ['knowledge.create'], [{
      ...mockVersion,
      source_refs: [{ type: 'knowledge', title: 'Unrelated source link', version_no: 1 }],
    }]);

    await user.click(await screen.findByRole('button', { name: 'Remove source reference 1' }));
    await user.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith(
      '/knowledge/item-1',
      expect.objectContaining({ source_refs: [] }),
    ));
  });

  it('previews the ECG source without saving until the Expert explicitly confirms', async () => {
    const user = userEvent.setup();
    const preview = {
      title: 'Review Candidate: Uganda ECG Training Manual (ECG001)',
      machine_id: null,
      category: 'GENERAL',
      tags: 'source_review_candidate, ecg_manual',
      summary: 'Unassigned source review candidate. Confirm applicability before association.',
      content: '[Source PDF page 78; printed page 70]\nVerified excerpt text.',
      source_refs: [{
        type: 'document',
        source_import_key: 'uga_ecg_training_manual_ecg001_100_01',
        source_title: 'Medical Equipment User Training Manual',
        pdf_pages: [13, 78, 79, 80, 81],
        printed_pages: [5, 70, 71, 72, 73],
      }],
    };
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: mockUser, permissions: ['knowledge.create'] });
      if (path.startsWith('/machines')) return Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 });
      if (path === '/knowledge/import-candidates/uganda-ecg-training-manual') return Promise.resolve(preview);
      return Promise.reject(new Error(`Unknown: ${path}`));
    });
    mockApi.post.mockResolvedValue({ id: 'candidate-1' });
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={['/app/knowledge/new']}>
          <AuthProvider>
            <Routes>
              <Route path="/app/knowledge/new" element={<KnowledgeEditorPage />} />
              <Route path="/app/knowledge/:id" element={<div>Candidate editor</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Review ECG source excerpt' }));
    expect(await screen.findByText('Verified excerpt text.', { exact: false })).toBeInTheDocument();
    expect(await screen.findByText(/PDF page\(s\) 13, 78, 79, 80, 81/)).toBeInTheDocument();
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalledWith('/knowledge', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Save unassigned ECG review draft' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/knowledge', preview));
    expect(await screen.findByText('Candidate editor')).toBeInTheDocument();
  });

  it('previews synthetic machine knowledge without saving, then saves it only as a draft', async () => {
    const user = userEvent.setup();
    const syntheticMachine = {
      id: 'synthetic-ct', name: 'CT-SCAN 11 — SYNTHETIC DEMO', code: 'SYNTH-DEMO-CT-01',
      model_number: 'DEMO-MODEL-CT-01', manufacturer: 'DEMO-MFG-CT-01',
      category: 'Medical Equipment', is_demo: true,
    };
    const preview = {
      title: 'SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION — CT Source Example',
      machine_id: 'synthetic-ct',
      category: 'GENERAL',
      tags: 'synthetic_demo,not_for_machine_operation',
      summary: 'SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION. Review only.',
      content: 'SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION\n\nSource review statement.',
      source_refs: [{
        type: 'document', synthetic_demo: true,
        source_title: 'SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION — CT Example',
        revision: 'SYNTHETIC REVISION 1', pdf_pages: ['SYNTHETIC PAGE CT-01'],
        verification: { status: 'verified', audience_clearance: 'demo_only' },
      }],
    };
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: mockUser, permissions: ['knowledge.create'] });
      if (path.startsWith('/machines')) return Promise.resolve({ items: [syntheticMachine], total: 1, page: 1, page_size: 100 });
      if (path === '/knowledge/synthetic-demo/templates/synthetic-ct') return Promise.resolve(preview);
      if (path.startsWith('/knowledge/synthetic-draft-1')) return Promise.resolve({ ...mockItemDetail, id: 'synthetic-draft-1', title: preview.title });
      return Promise.reject(new Error(`Unknown: ${path}`));
    });
    mockApi.post.mockResolvedValue({ id: 'synthetic-draft-1', title: preview.title } as any);

    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/knowledge/new']}>
          <AuthProvider>
            <Routes>
              <Route path="/app/knowledge/:id" element={<KnowledgeEditorPage />} />
              <Route path="/app/knowledge" element={<div>Library</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole('option', { name: /CT-SCAN 11 — SYNTHETIC DEMO/i });
    await user.selectOptions(screen.getByRole('combobox'), 'synthetic-ct');
    await user.click(screen.getByRole('button', { name: 'Preview synthetic example' }));
    expect(await screen.findByText(preview.title)).toBeInTheDocument();
    expect(screen.getByText(/Not saved · Machine linked · Saving creates a draft only/i)).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save synthetic draft' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/knowledge', preview));
  });

  it('does not offer the ECG draft creation action without knowledge.create permission', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: mockUser, permissions: ['assistant.use'] });
      if (path.startsWith('/machines')) return Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 });
      return Promise.reject(new Error(`Unknown: ${path}`));
    });
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={['/app/knowledge/new']}>
          <AuthProvider>
            <Routes>
              <Route path="/app/knowledge/new" element={<KnowledgeEditorPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Review ECG source excerpt' })).not.toBeInTheDocument());
    expect(mockApi.post).not.toHaveBeenCalledWith(
      '/knowledge/import-candidates/uganda-ecg-training-manual',
      {},
    );
  });

  it('shows frozen banner for in_review version', async () => {
    renderEditor('in_review', 'user-1');
    await waitFor(() =>
      expect(
        screen.getAllByText(/cannot be edited/i).length
      ).toBeGreaterThan(0)
    );
  });

  it('shows frozen banner for published version', async () => {
    renderEditor('published', 'user-1');
    await waitFor(() =>
      expect(
        screen.getAllByText(/cannot be edited/i).length
      ).toBeGreaterThan(0)
    );
  });

  it('shows New Revision button for published version', async () => {
    renderEditor('published', 'user-1');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New Revision/i })).toBeInTheDocument()
    );
  });

  it('compares saved version snapshots and labels changed content', async () => {
    const v1 = { ...mockVersion, id: 'ver-1', version_no: 1, title: 'Setup v1', summary: 'Inspect the chuck.', status: 'published' as const };
    const v2 = { ...mockVersion, id: 'ver-2', version_no: 2, title: 'Setup v2', summary: 'Inspect the chuck and spindle.', status: 'draft' as const };
    const compared = { base: v1, target: { ...v2, steps: [{ order: 1, title: 'Inspect', instruction: 'Inspect chuck and spindle.', tools: [], safety_warning: null, expected_result: null, stop_condition: null, needs_review: false, source_segment_ids: [], ai_generated: false, note: null }] }, changed_fields: ['title', 'summary', 'steps'] };
    renderEditor('draft', 'user-1', ['knowledge.create'], [v2, v1], compared);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Compare versions' }));
    await user.selectOptions(screen.getByLabelText('Earlier version'), '1');
    await user.selectOptions(screen.getByLabelText('Later version'), '2');
    await user.click(screen.getByRole('button', { name: /^Compare$/ }));
    expect(await screen.findByRole('region', { name: 'Comparison of v1 and v2' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Changed: title, summary, steps');
    expect(screen.getAllByText('Inspect the chuck and spindle.').length).toBeGreaterThan(0);
  });

  it('shows an error when a version comparison cannot be loaded', async () => {
    const v1 = { ...mockVersion, id: 'ver-1', version_no: 1 };
    const v2 = { ...mockVersion, id: 'ver-2', version_no: 2 };
    renderEditor('draft', 'user-1', ['knowledge.create'], [v2, v1], undefined);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Compare versions' }));
    await user.selectOptions(screen.getByLabelText('Earlier version'), '1');
    await user.selectOptions(screen.getByLabelText('Later version'), '2');
    await user.click(screen.getByRole('button', { name: /^Compare$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No comparison configured');
  });

  it('offers Submit for Review to an author with the submission permission', async () => {
    renderEditor('draft', 'user-1', ['knowledge.create', 'knowledge.submit_review']);
    const submitBtn = await screen.findByRole('button', { name: /Submit for Review/i });
    expect(submitBtn).toBeEnabled();
  });

  it('renders media attachments panel', async () => {
    renderEditor('draft', 'user-1');
    await waitFor(() =>
      expect(screen.getByText(/Media Attachments/i)).toBeInTheDocument()
    );
  });

  it('shows not-found message for 404 errors', async () => {
    const { ApiClientError } = await import('../lib/api/client');
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.resolve({ user: mockUser, permissions: ['knowledge.create'] });
      if (path.startsWith('/knowledge'))
        return Promise.reject(new ApiClientError('not_found', 'Not found', 404));
      return Promise.reject(new Error('Unknown'));
    });

    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/knowledge/nonexistent']}>
          <AuthProvider>
            <Routes>
              <Route path="/app/knowledge/:id" element={<KnowledgeEditorPage />} />
              <Route path="/app/knowledge" element={<div>Library</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText(/Not Found/i)).toBeInTheDocument());
    expect(screen.queryByText(/private draft/i)).not.toBeInTheDocument();
  });
});

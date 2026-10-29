import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantPage } from '../features/assistant/AssistantPage';
import { SourceCitations } from '../features/assistant/components/SourceCitations';
import { api } from '../lib/api/client';

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

const renderAssistant = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AssistantPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('AI Knowledge Assistant UI Component Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for listConversations and fetchMachines
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/assistant/conversations')) {
        return [
          {
            id: 'conv-test-1',
            title: 'Previous Spindle Question',
            status: 'active',
            created_at: '2026-10-27T10:00:00Z',
            updated_at: '2026-10-27T10:05:00Z',
            message_count: 2,
          },
        ];
      }
      if (url.includes('/machines')) {
        return {
          items: [
            { id: 'mach-haas-1', name: 'Haas VF-2 Mill', code: 'HAAS-VF2-001' },
          ],
        };
      }
      if (url.includes('/assistant/sources/')) {
        return {
          id: 'src-sop-101',
          title: 'Spindle Calibration Standard SOP',
          source_type: 'knowledge_version',
          source_ref_id: 'item-101',
          status: 'published',
          machine_id: 'mach-haas-1',
          indexed_at: '2026-10-27T10:00:00Z',
          chunks: [
            {
              id: 'chk-1',
              chunk_index: 0,
              text: 'Run spindle warmup for 15 mins at 5000 RPM.',
              section_label: 'Warmup',
            },
          ],
        };
      }
      return {};
    });

    vi.spyOn(api, 'post').mockImplementation(async (url: string, body: any) => {
      if (url.includes('/assistant/feedback')) {
        return {
          id: 'fb-123',
          message_id: body.message_id,
          user_id: 'user-1',
          rating: body.rating,
          category: body.reason,
          status: 'new',
          created_at: '2026-10-27T12:00:00Z',
        };
      }
      return {};
    });
  });

  it('visibly labels synthetic citations separately from ordinary sources', () => {
    render(
      <SourceCitations
        sources={[
          { title: 'SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION — CT Example', type: 'knowledge_version' },
          { title: 'Approved training SOP', type: 'knowledge_version' },
        ]}
      />,
    );

    expect(screen.getByText('SYNTHETIC DEMO')).toBeInTheDocument();
    expect(screen.getByText('Approved training SOP')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders initial empty chat interface with suggestions and fixed disclaimer', async () => {
    renderAssistant();

    // Fixed legal/SOP grounding disclaimer
    expect(
      screen.getByText(/Answers use approved knowledge/i)
    ).toBeInTheDocument();

    // Empty state suggestions
    expect(
      screen.getByText(/How can I assist your shopfloor operations\?/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Lockout \/ Tagout \(LOTO\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Tool Wear Inspection/i)).toBeInTheDocument();

    // History sidebar
    await waitFor(() => {
      expect(screen.getByText('Previous Spindle Question')).toBeInTheDocument();
    });

    // Machine context filter
    expect(screen.getByText(/Target: All Machines/i)).toBeInTheDocument();
  });

  it('sends question, streams tokens, displays citations and opens source drawer', async () => {
    const sseResponse = [
      'event: token\ndata: {"token":"Spindle warmup cycle requires "}\n\n',
      'event: token\ndata: {"token":"15 minutes at 5000 RPM."}\n\n',
      'event: sources\ndata: {"sources":[{"chunk_id":"chk-1","source_id":"src-sop-101","title":"Spindle Calibration Standard SOP","section_label":"Warmup","version":"v1","snippet":"Run spindle warmup for 15 mins at 5000 RPM."}],"insufficient_evidence":false,"conversation_id":"conv-99","message_id":"msg-99"}\n\n',
      'event: done\ndata: [DONE]\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createMockStream(sseResponse),
    });

    renderAssistant();

    const textarea = screen.getByPlaceholderText(/Ask about SOPs, machines/i);
    const sendButton = screen.getByTitle(/Send query/i);

    // Type query and send
    await userEvent.type(textarea, 'How long should spindle warmup be?');
    fireEvent.click(sendButton);

    // 1. User message bubble renders
    expect(
      screen.getByText('How long should spindle warmup be?')
    ).toBeInTheDocument();

    // 2. Streamed answer appears
    await waitFor(() => {
      expect(
        screen.getByText(/Spindle warmup cycle requires 15 minutes at 5000 RPM/i)
      ).toBeInTheDocument();
    });

    // 3. Grounded in SOP badge appears
    expect(screen.getByText(/Grounded in SOP/i)).toBeInTheDocument();

    // 4. Source citation chip appears
    const citationChip = await screen.findByText('Spindle Calibration Standard SOP');
    expect(citationChip).toBeInTheDocument();
    expect(screen.queryByText('Warmup')).not.toBeInTheDocument();

    // 5. Clicking citation chip opens verified source drawer
    fireEvent.click(citationChip);
    expect(await screen.findByText(/Verified Knowledge Source/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/Run spindle warmup for 15 mins at 5000 RPM/i)
    ).toBeInTheDocument();
  });

  it('aborts an in-flight stream and removes an empty assistant placeholder', async () => {
    let requestSignal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    renderAssistant();
    await userEvent.type(screen.getByPlaceholderText(/Ask about SOPs, machines/i), 'Check this machine');
    fireEvent.click(screen.getByTitle(/Send query/i));

    const stopButton = await screen.findByTitle('Stop streaming response');
    fireEvent.click(stopButton);

    expect(requestSignal?.aborted).toBe(true);
    expect(await screen.findByTitle(/Send query/i)).toBeInTheDocument();
    expect(screen.getByText('Check this machine')).toBeInTheDocument();
    expect(screen.queryByText(/Writing your grounded answer/i)).not.toBeInTheDocument();
  });

  it('uploads machine audio, follows a reliable match through grounded chat, and renders the persisted analysis result', async () => {
    const audioAnalysis = {
      id: 'audio-job-41',
      status: 'MATCHED',
      matched_reference: {
        reference_id: 'audio-reference-7',
        title: 'VF-2 spindle idle reference',
        interpretation: 'The recording resembles the approved idle spindle observation.',
        similarity_score: 0.94,
        knowledge_version_id: 'version-7',
        knowledge_item_id: 'item-7',
        knowledge_sources: [{
          knowledge_item_id: 'source-item-2',
          knowledge_version_id: 'source-version-2',
          title: 'Spindle Inspection SOP',
          version_no: 2,
        }],
      },
      similarity_score: 0.94,
      reason_code: 'MATCHED',
      message: 'A current approved sound reference matched.',
      limitation: 'Similarity is not a diagnosis, fault probability, or machine-safety determination.',
      requires_expert_review: false,
      candidate_matches: [],
    };
    vi.spyOn(api, 'postForm').mockResolvedValue(audioAnalysis as any);
    const sseResponse = [
      'event: token\ndata: {"token":"This possible sound match is documented in the approved reference."}\n\n',
      `event: sources\ndata: ${JSON.stringify({ sources: [], insufficient_evidence: false, conversation_id: 'conv-audio', message_id: 'msg-audio', audio_analysis: audioAnalysis })}\n\n`,
      'event: done\ndata: [DONE]\n\n',
    ];
    global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.audio_analysis_job_id).toBe('audio-job-41');
      expect(request.message).toContain('VF-2 spindle idle reference');
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: createMockStream(sseResponse),
      } as Response;
    });

    renderAssistant();
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: { files: [new File(['sample audio'], 'spindle.wav', { type: 'audio/wav' })] },
    });

    await waitFor(() => expect(api.postForm).toHaveBeenCalled());
    expect(await screen.findByText(/Possible documented match/i)).toBeInTheDocument();
    expect(await screen.findByText('VF-2 spindle idle reference')).toBeInTheDocument();
    expect(await screen.findByText('Spindle Inspection SOP')).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(api.postForm).toHaveBeenCalledWith('/audio/analyze', expect.any(FormData));
  });

  it('rejects Tutor uploads larger than 100 MB before making a request', async () => {
    const postForm = vi.spyOn(api, 'postForm');
    renderAssistant();
    const input = document.querySelector('input[type="file"]');
    const oversized = new File(['small test payload'], 'large.wav', { type: 'audio/wav' });
    Object.defineProperty(oversized, 'size', { value: 100 * 1024 * 1024 + 1 });
    fireEvent.change(input!, { target: { files: [oversized] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/100 MB or smaller/i);
    expect(postForm).not.toHaveBeenCalled();
  });

  it('persists an unmatched audio result without asking the model to diagnose it', async () => {
    const audioAnalysis = {
      id: 'audio-job-no-match',
      status: 'NO_RELIABLE_MATCH',
      matched_reference: null,
      similarity_score: null,
      reason_code: 'BELOW_SCREENING_THRESHOLD',
      message: 'No approved sound reference matched this recording.',
      limitation: 'Similarity is not a diagnosis.',
      requires_expert_review: true,
      candidate_matches: [],
    };
    vi.spyOn(api, 'postForm').mockResolvedValue(audioAnalysis as any);
    global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.audio_analysis_job_id).toBe('audio-job-no-match');
      expect(request.message).toMatch(/save this machine audio comparison result/i);
      const sseResponse = [
        `event: token\ndata: ${JSON.stringify({ token: 'Audio comparison saved. No fault diagnosis was generated.' })}\n\n`,
        `event: sources\ndata: ${JSON.stringify({ sources: [], insufficient_evidence: false, conversation_id: 'conv-no-match', message_id: 'msg-no-match', audio_analysis: audioAnalysis })}\n\n`,
        'event: done\ndata: [DONE]\n\n',
      ];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: createMockStream(sseResponse),
      } as Response;
    });
    renderAssistant();
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input!, {
      target: { files: [new File(['sample audio'], 'unknown.wav', { type: 'audio/wav' })] },
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Machine sound comparison' })).toHaveLength(1));
    expect(screen.getByText('No approved sound reference matched this recording.')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uploads an image through the grounded multimodal Tutor route', async () => {
    vi.spyOn(api, 'postForm').mockResolvedValue({
      answer: 'The approved procedure identifies the relevant inspection checkpoint.',
      sources: [{ title: 'Inspection SOP', chunk_id: 'chk-media', source_id: 'src-media' }],
      insufficient_evidence: false,
      provider_unavailable: false,
      conversation_id: 'conv-media',
      message_id: 'msg-media',
      handoffs: [],
      attachment: {
        media_id: 'media-image-1',
        filename: 'machine.jpg',
        mime: 'image/jpeg',
        size_bytes: 1024,
        url: '/api/v1/assistant/attachments/media-image-1',
      },
    } as any);
    renderAssistant();

    const input = screen.getByLabelText('Select media or document file');
    fireEvent.change(input, {
      target: { files: [new File(['image bytes'], 'machine.jpg', { type: 'image/jpeg' })] },
    });

    expect(await screen.findByText('The approved procedure identifies the relevant inspection checkpoint.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Open attachment machine.jpg' })).toHaveAttribute(
      'href',
      '/api/v1/assistant/attachments/media-image-1',
    );
    expect(api.postForm).toHaveBeenCalledWith('/assistant/chat/media', expect.any(FormData));
  });

  it('renders insufficient evidence banner when no approved source is found', async () => {
    const sseResponse = [
      'event: token\ndata: {"token":"The verified technical knowledge base does not contain sufficient information to answer this question."}\n\n',
      'event: sources\ndata: {"sources":[],"insufficient_evidence":true,"conversation_id":"conv-insuf","message_id":"msg-insuf"}\n\n',
      'event: done\ndata: [DONE]\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createMockStream(sseResponse),
    });

    renderAssistant();

    const textarea = screen.getByPlaceholderText(/Ask about SOPs, machines/i);
    await userEvent.type(textarea, 'Unknown mysterious procedure xyz');
    fireEvent.click(screen.getByTitle(/Send query/i));

    // Insufficient evidence banner
    expect(await screen.findByText(/No approved source found/i)).toBeInTheDocument();
    expect(screen.getByText(/reviewed source linked to the identified machine/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Ask an Expert \(Planned\)/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Insufficient Evidence/i)).toBeInTheDocument();
  });

  it('shows clearly labelled synthetic demo sample questions for a selected demo machine', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/assistant/conversations')) return [] as any;
      if (url.includes('/machines')) return {
        items: [{ id: 'synthetic-ct', name: 'CT-SCAN 11 — SYNTHETIC DEMO', code: 'SYNTH-DEMO-CT-01', is_demo: true }],
      } as any;
      if (url.includes('/assistant/synthetic-demo/questions')) return {
        label: 'SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION',
        questions: [{
          id: 'ct-source-match',
          question: 'Which synthetic source reference is shown?',
          expected_grounded_answer: 'Retain the fictional page reference.',
          expects_evidence: true,
        }],
      } as any;
      return {} as any;
    });
    const sseResponse = [
      'event: token\ndata: {"token":"Synthetic source-review example only."}\n\n',
      'event: sources\ndata: {"sources":[],"insufficient_evidence":true,"conversation_id":"synthetic-demo-conv","message_id":"synthetic-demo-msg"}\n\n',
      'event: done\ndata: [DONE]\n\n',
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createMockStream(sseResponse),
    });

    const user = userEvent.setup();
    renderAssistant();
    const machineFilter = screen.getByTitle('Filter RAG retrieval context by specific machine asset');
    await waitFor(() => expect(machineFilter).not.toBeDisabled());
    await user.selectOptions(machineFilter, 'synthetic-ct');
    await waitFor(() => expect(screen.getByText('SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION')).toBeInTheDocument());
    const tryQuestion = await screen.findByRole('button', { name: /Try grounded example: Which synthetic source reference is shown/i });
    expect(screen.getByText(/Fictional source-review examples only/i)).toBeInTheDocument();
    fireEvent.click(tryQuestion);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const request = JSON.parse(String((global.fetch as any).mock.calls[0][1].body));
    expect(request.machine_id).toBe('synthetic-ct');
    expect(request.message).toBe('Which synthetic source reference is shown?');
    expect(screen.getByText(/Retain the fictional page reference/i)).toBeInTheDocument();
  });

  it('submits feedback via problem reporting modal', async () => {
    const sseResponse = [
      'event: token\ndata: {"token":"Inspect tool wear after 200 cycles."}\n\n',
      'event: sources\ndata: {"sources":[{"chunk_id":"chk-1","source_id":"src-1","title":"Tool SOP"}],"insufficient_evidence":false,"conversation_id":"c1","message_id":"msg-fb-test"}\n\n',
      'event: done\ndata: [DONE]\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createMockStream(sseResponse),
    });

    renderAssistant();

    const textarea = screen.getByPlaceholderText(/Ask about SOPs, machines/i);
    await userEvent.type(textarea, 'When to inspect end mill?');
    fireEvent.click(screen.getByTitle(/Send query/i));

    // Wait for response and feedback buttons
    await waitFor(() => {
      expect(screen.getByText(/Report Problem/i)).toBeInTheDocument();
    });

    // Click Report Problem
    fireEvent.click(screen.getByText(/Report Problem/i));

    // Modal opens with reason enum options
    expect(screen.getByText('Report Assistant Response Issue')).toBeInTheDocument();
    expect(screen.getByText('Missing Source')).toBeInTheDocument();
    expect(screen.getByText('Outdated Info')).toBeInTheDocument();
    expect(screen.getByText('Conflicting Guidance')).toBeInTheDocument();

    // Select 'Missing Source' reason option
    fireEvent.click(screen.getByLabelText(/Missing Source/i));

    // Type optional comment
    const commentBox = screen.getByPlaceholderText(/Explain what was incorrect or missing/i);
    await userEvent.type(commentBox, 'Need specific optical comparator tolerance');

    // Submit report
    const submitBtn = screen.getByText('Submit Report');
    fireEvent.click(submitBtn);

    // Verify submission confirmation
    await waitFor(() => {
      expect(screen.getByText(/Feedback received, thank you!/i)).toBeInTheDocument();
    });
  });
});

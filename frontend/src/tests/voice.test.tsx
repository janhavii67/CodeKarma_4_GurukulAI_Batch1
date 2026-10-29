import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { JobStatusCard } from '../features/voice/JobStatusCard';
import { StepDraftReview } from '../features/voice/StepDraftReview';
import { ProcessingJob, StepDraft } from '../features/voice/voiceApi';
import * as voiceApi from '../features/voice/voiceApi';
import { useJobPolling } from '../features/voice/useJobPolling';
import { ApiClientError } from '../lib/api/client';

describe('Voice-to-Knowledge & RAG UI Component Tests', () => {
  it('renders JobStatusCard with progress and pipeline milestones', () => {
    const mockJob: ProcessingJob = {
      id: 'job-test-123',
      type: 'voice_to_knowledge',
      media_id: 'media-test-456',
      status: 'processing',
      progress: 65,
      attempts: 1,
      created_by: 'user-expert-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(<JobStatusCard job={mockJob} />);

    expect(screen.getByText(/Voice Processing & Vector Indexing Pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/65%/i)).toBeInTheDocument();
    expect(screen.getByText(/Whisper Segments/i)).toBeInTheDocument();
    expect(screen.getByText(/Vector RAG Indexing/i)).toBeInTheDocument();
  });

  it('shows provider limit guidance instead of blaming audio quality', () => {
    const failedJob: ProcessingJob = {
      id: 'job-limited',
      type: 'voice_to_knowledge',
      media_id: 'media-limited',
      status: 'failed',
      progress: 35,
      attempts: 1,
      error_safe: 'The speech provider returned a usage-limit response. Check provider quota and rate limits before retrying.',
      created_by: 'user-expert-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(<JobStatusCard job={failedJob} />);

    expect(screen.getByText(/usage-limit response/i)).toBeInTheDocument();
    expect(screen.queryByText(/clearer audio|check audio quality/i)).not.toBeInTheDocument();
  });

  it('shows a saved transcript state without offering an unsafe transcription retry', () => {
    const failedJob: ProcessingJob = {
      id: 'job-structured-failure',
      type: 'voice_to_knowledge',
      media_id: 'media-with-transcript',
      status: 'failed',
      progress: 75,
      attempts: 1,
      transcript_saved: true,
      error_safe: 'The transcript is saved, but automatic procedure structuring could not complete.',
      created_by: 'user-expert-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(<JobStatusCard job={failedJob} />);

    expect(screen.getByText(/transcript is saved/i)).toBeInTheDocument();
    expect(screen.getByText(/will not be replaced/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume structuring/i })).not.toBeInTheDocument();
  });

  it('offers a structuring-only resume for a saved transcript and restarts with the same job', async () => {
    const failedJob: ProcessingJob = {
      id: 'job-resume',
      type: 'voice_to_knowledge',
      media_id: 'media-existing-transcript',
      status: 'failed',
      progress: 75,
      attempts: 1,
      transcript_saved: true,
      can_resume_structuring: true,
      created_by: 'user-expert-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const queuedJob = { ...failedJob, status: 'queued' as const };
    const onRetried = vi.fn();
    vi.spyOn(voiceApi, 'retryProcessingJob').mockResolvedValue(queuedJob);

    render(<JobStatusCard job={failedJob} onRetried={onRetried} />);
    fireEvent.click(screen.getByRole('button', { name: /resume structuring/i }));

    await waitFor(() => expect(onRetried).toHaveBeenCalledWith(queuedJob));
    expect(voiceApi.retryProcessingJob).toHaveBeenCalledWith(failedJob.id);
    expect(screen.getByText(/without running transcription again/i)).toBeInTheDocument();
  });

  it('shows safe provider setup guidance when a saved transcript cannot resume yet', async () => {
    const failedJob: ProcessingJob = {
      id: 'job-resume-config',
      type: 'voice_to_knowledge',
      media_id: 'media-existing-transcript',
      status: 'failed',
      progress: 75,
      attempts: 1,
      transcript_saved: true,
      can_resume_structuring: true,
      created_by: 'user-expert-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const guidance = 'Procedure structuring cannot resume because Gemini is selected but GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in backend/.env, then restart FastAPI.';
    vi.spyOn(voiceApi, 'retryProcessingJob').mockRejectedValue(
      new ApiClientError('structuring_provider_not_configured', guidance, 409),
    );

    render(<JobStatusCard job={failedJob} />);
    fireEvent.click(screen.getByRole('button', { name: /resume structuring/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/GEMINI_API_KEY.*backend\/\.env.*restart FastAPI/i);
  });

  it('loads saved transcript review when a downstream job fails after transcription', async () => {
    const failedJob: ProcessingJob = {
      id: 'job-structured-failure',
      type: 'voice_to_knowledge',
      media_id: 'media-with-transcript',
      status: 'failed',
      progress: 75,
      attempts: 1,
      transcript_saved: true,
      created_by: 'user-expert-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const completed = vi.fn();
    vi.spyOn(voiceApi, 'getProcessingJob').mockResolvedValue(failedJob);

    const { result } = renderHook(() => useJobPolling(failedJob.id, completed));

    await waitFor(() => expect(completed).toHaveBeenCalledWith(failedJob));
    expect(result.current.job?.transcript_saved).toBe(true);
  });

  it('restarts polling when a saved transcript job is resumed with the same ID', async () => {
    const failedJob: ProcessingJob = {
      id: 'job-resume-same-id',
      type: 'voice_to_knowledge',
      media_id: 'media-existing-transcript',
      status: 'failed',
      progress: 75,
      attempts: 1,
      transcript_saved: true,
      can_resume_structuring: true,
      created_by: 'user-expert-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const resumedJob: ProcessingJob = { ...failedJob, status: 'needs_review', progress: 100, can_resume_structuring: false };
    const completed = vi.fn();
    const pollSpy = vi.spyOn(voiceApi, 'getProcessingJob')
      .mockResolvedValueOnce(failedJob)
      .mockResolvedValueOnce(resumedJob);

    const { rerender } = renderHook(
      ({ generation }) => useJobPolling(failedJob.id, completed, generation),
      { initialProps: { generation: 0 } },
    );
    await waitFor(() => expect(pollSpy).toHaveBeenCalledTimes(1));

    rerender({ generation: 1 });

    await waitFor(() => expect(pollSpy).toHaveBeenCalledTimes(2));
    expect(completed).toHaveBeenLastCalledWith(resumedJob);
  });

  it('renders StepDraftReview with safety warnings, segment citations, and allows clearing review flag', () => {
    const mockSteps: StepDraft[] = [
      {
        title: 'Inspect Chuck Jaw Pressure',
        instruction: 'Verify hydraulic clamping pressure is set accurately.',
        tools: ['TORQUE WRENCH', 'PRESSURE GAUGE'],
        safety_warning: 'Never start spindle without verifying chuck pressure.',
        source_segment_ids: [1, 2],
        needs_review: true,
        note: 'Tolerances missing from audio narration.',
      },
      {
        title: 'Engage Coolant System',
        instruction: 'Turn on coolant pump switch before cycle start.',
        tools: [],
        source_segment_ids: [3],
        needs_review: false,
      },
    ];

    const onUpdateMock = vi.fn();

    render(
      <StepDraftReview
        initialSteps={mockSteps}
        onStepsUpdated={onUpdateMock}
      />
    );

    expect(screen.getByText(/AI Candidate Procedural Steps/i)).toBeInTheDocument();
    expect(screen.getByText(/origin: ai_draft/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Steps Need Review/i)).toBeInTheDocument();
    expect(screen.getByText(/Never start spindle without verifying chuck pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/Segments: #1, #2/i)).toBeInTheDocument();

    // Click "I have verified this parameter" button
    const verifyButton = screen.getByText(/I have verified this parameter/i);
    fireEvent.click(verifyButton);

    expect(onUpdateMock).toHaveBeenCalled();
    expect(screen.getByText(/All Steps Verified/i)).toBeInTheDocument();
  });

  it('shows demo warning banner when isDemo is true', () => {
    const mockSteps: StepDraft[] = [
      {
        title: '[ILLUSTRATIVE] Inspect Chuck',
        instruction: 'Set hydraulic chuck clamping pressure strictly to 25 bar.',
        tools: [],
        source_segment_ids: [1],
        needs_review: false,
      },
    ];

    render(
      <StepDraftReview
        initialSteps={mockSteps}
        isDemo={true}
      />
    );

    expect(screen.getByText(/DEMO — ILLUSTRATIVE DATA — NOT A REAL PROCEDURE/i)).toBeInTheDocument();
  });

  it('enforces submission gate: locked when unverified flags remain, unlocked when cleared', async () => {
    const mockSteps: StepDraft[] = [
      {
        title: 'Verify Spindle Speed',
        instruction: 'Ensure spindle is set to 1200 rpm.',
        tools: [],
        source_segment_ids: [1],
        needs_review: true,
        note: 'Spindle speed requires verification.',
      },
    ];

    const verifySpy = vi.spyOn(voiceApi, 'verifyCandidateStep').mockResolvedValue({
      media_id: 'media-123',
      version_id: 'ver-123',
      item_id: 'item-123',
      origin: 'ai_draft_edited',
      steps: [
        {
          title: 'Verify Spindle Speed',
          instruction: 'Ensure spindle is set to 1200 rpm.',
          tools: [],
          source_segment_ids: [1],
          needs_review: false,
          note: 'Verified by Expert Author',
        },
      ],
      unclear_segments: [],
      flagged_count: 0,
      can_submit: true,
      is_demo: false,
      submission_gate_status: 'open',
    });

    const submitSpy = vi.spyOn(voiceApi, 'submitVoiceSOP').mockResolvedValue({
      id: 'item-123',
      status: 'in_review',
    });

    render(
      <StepDraftReview
        mediaId="media-123"
        itemId="item-123"
        initialSteps={mockSteps}
      />
    );

    // Initial state: gate locked, submit button disabled
    const submitBtn = screen.getByRole('button', { name: /Submit SOP for Peer Review/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Submission Gate is locked/i)).toBeInTheDocument();

    // Click verify parameter
    const verifyBtn = screen.getByText(/I have verified this parameter/i);
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith('media-123', 0);
    });

    // Gate should now be open and button enabled
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });

    // Click submit
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith('item-123');
      expect(screen.getByText(/SOP version submitted successfully/i)).toBeInTheDocument();
    });
  });
});

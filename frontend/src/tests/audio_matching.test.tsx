import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundAnalysisPage } from '../features/audio/SoundAnalysisPage';

const { get, postForm } = vi.hoisted(() => ({ get: vi.fn(), postForm: vi.fn() }));
vi.mock('../lib/api/client', () => ({ api: { get, postForm, post: vi.fn(), patch: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => false }) }));

describe('Machine sound matching UI', () => {
  beforeEach(() => {
    get.mockResolvedValue([]);
    postForm.mockReset();
  });

  it('explains similarity limits and submits an uploaded recording to the real matching API', async () => {
    postForm.mockResolvedValue({
      id: 'job-1', status: 'NO_RELIABLE_MATCH', reason_code: 'NO_APPROVED_REFERENCES',
      message: 'There are no approved references.', limitation: 'Similarity is not a diagnosis.',
      requires_expert_review: true, candidate_matches: [],
    });
    render(<BrowserRouter><SoundAnalysisPage /></BrowserRouter>);

    expect(screen.getByText(/Similarity is not a diagnosis/i)).toBeInTheDocument();
    expect(screen.queryByText(/Test Acoustic Scenario/i)).not.toBeInTheDocument();
    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, { target: { files: [new File(['wav-bytes'], 'machine.wav', { type: 'audio/wav' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Compare sound/i }));

    await waitFor(() => expect(postForm).toHaveBeenCalledWith('/audio/analyze', expect.any(FormData)));
    expect(await screen.findByText(/There are no approved references/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not a diagnosis/i).length).toBeGreaterThan(0);
  });
});

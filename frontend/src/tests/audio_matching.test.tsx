import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundAnalysisPage } from '../features/audio/SoundAnalysisPage';

const { get, postForm } = vi.hoisted(() => ({ get: vi.fn(), postForm: vi.fn() }));
vi.mock('../lib/api/client', () => ({ api: { get, postForm, post: vi.fn(), patch: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => false }) }));

const selectMachine = async (id: string) => {
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: id } });
};

describe('Machine sound matching UI (Chunk 11)', () => {
  beforeEach(() => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/machines')) {
        return { items: [
          { id: 'machine-ct', name: 'CT-Scan', code: 'MACH-CT12', model_number: 'MACH-CT12' },
          { id: 'machine-ecg', name: 'ECG', code: 'ECG-001', model_number: 'ECG-001' },
          { id: 'machine-mri', name: 'MRI', code: 'MACH-MRI', model_number: 'MACH-MRI' },
          { id: 'machine-xray', name: 'Xray', code: 'MACH-Xray', model_number: 'MACH-Xray' },
        ] };
      }
      return [];
    });
    postForm.mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:machine-audio'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Array(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => []),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('renders initial empty state with diagnostic safety guidance and upload dropzone', () => {
    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Audio processor ready · AI observation \+ acoustic comparison/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Drag & Drop Equipment Sound Recording/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Machine selection is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Generated tones are not used as reference evidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/Similar to approved reference:/i)).not.toBeInTheDocument();
  });

  it('handles file upload, displays waveform preview, and executes analysis', async () => {
    postForm.mockResolvedValue({
      id: 'job-1',
      status: 'NO_RELIABLE_MATCH',
      reason_code: 'NO_APPROVED_REFERENCES',
      message: 'There are no expert-approved reference recordings available for comparison.',
      limitation: 'Similarity is not a diagnosis, fault probability, or machine-safety determination.',
      requires_expert_review: true,
      candidate_matches: [],
    });

    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    await selectMachine('machine-ct');

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'generator-hum.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('generator-hum.wav')[0]).toBeInTheDocument();
    const analyzeButton = screen.getByRole('button', { name: /Analyze Machine Sound/i });
    expect(analyzeButton).toBeInTheDocument();

    fireEvent.click(analyzeButton);

    await waitFor(() =>
      expect(postForm).toHaveBeenCalledWith('/audio/analyze', expect.any(FormData)),
      { timeout: 5000 }
    );
    const form = postForm.mock.calls[0][1] as FormData;
    expect(form.get('machine_id')).toBe('machine-ct');
    expect(
      await screen.findByText(/No Reliable Reference Match Identified/i)
    ).toBeInTheDocument();
  });

  it('renders audible observations separately from a machine-specific reference similarity', async () => {
    const candidate1 = {
      reference_id: 'ref-coldhead-1',
      title: 'MRI Cooling Cycle Reference',
      machine_name: 'MRI',
      model_name: 'Registered MRI machine',
      component: 'Cooling system',
      operation: 'Cooling cycle',
      interpretation: 'This reference documents the recorded cooling cycle under its listed conditions.',
      similarity_score: 0.9421,
      knowledge_version_id: 'kv-coldhead-1',
      knowledge_sources: [
        {
          knowledge_item_id: 'ki-coldhead',
          knowledge_version_id: 'kv-coldhead-1',
          title: 'ACR MRI Quality Control',
          version_no: 2,
        },
      ],
      related_links: [],
    };

    postForm.mockResolvedValue({
      id: 'job-match-1',
      status: 'MATCHED',
      reason_code: 'REFERENCE_SIMILARITY_MATCH',
      message: 'This recording is acoustically similar to an approved reference. Similarity alone does not confirm a fault or machine safety.',
      limitation: 'Similarity is not a diagnosis, fault probability, or machine-safety determination.',
      similarity_score: 0.9421,
      matched_reference: candidate1,
      requires_expert_review: false,
      candidate_matches: [candidate1],
      audio_observation: 'A repeating mechanical tone is audible with a brief pause between cycles.',
      processing_metadata: { duration_seconds: 3.2, input_format: 'audio/wav', channels: 1, decoded_sample_rate: 44100, normalized_sample_rate: 16000 },
    });

    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    await selectMachine('machine-mri');

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'mri-field.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('mri-field.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(await screen.findByText(/^Match found$/i)).toBeInTheDocument();
    expect(screen.getByText(/Similar to approved reference: MRI Cooling Cycle Reference/i)).toBeInTheDocument();
    expect(screen.getByText(/94.2% · ranking only/i)).toBeInTheDocument();
    expect(screen.getByText(/A repeating mechanical tone is audible/i)).toBeInTheDocument();
    expect(screen.getByText(/normalized to 16000 Hz/i)).toBeInTheDocument();
    expect(screen.getByText(/not a calibrated probability, a diagnosis, or proof of machine condition/i)).toBeInTheDocument();

    // SOP knowledge links
    expect(screen.getByText(/ACR MRI Quality Control/i)).toBeInTheDocument();
  });

  it('renders AMBIGUOUS_MATCH state with prominent visual uncertainty warning and candidate comparison', async () => {
    const cand1 = {
      reference_id: 'ref-xray-1',
      title: 'X-ray Operating Reference A',
      machine_name: 'Xray',
      component: 'Mechanical movement',
      interpretation: 'The reference recording contains a low mechanical hum under its listed conditions.',
      similarity_score: 0.865,
      knowledge_version_id: 'kv-xray-1',
      knowledge_sources: [],
      related_links: [],
    };
    const cand2 = {
      reference_id: 'ref-xray-2',
      title: 'X-ray Operating Reference B',
      machine_name: 'Xray',
      component: 'Mechanical movement',
      interpretation: 'The reference recording contains a higher tonal component under its listed conditions.',
      similarity_score: 0.841,
      knowledge_version_id: 'kv-xray-2',
      knowledge_sources: [],
      related_links: [],
    };

    postForm.mockResolvedValue({
      id: 'job-ambiguous-1',
      status: 'AMBIGUOUS_MATCH',
      reason_code: 'CLOSE_REFERENCE_SCORES',
      message: 'Several approved references have similar scores. Review the references with an expert; the highest score is not necessarily the correct match.',
      limitation: 'Similarity is not a diagnosis, fault probability, or machine-safety determination.',
      similarity_score: 0.865,
      requires_expert_review: true,
      candidate_matches: [cand1, cand2],
    });

    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    await selectMachine('machine-xray');

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'tube-spin.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('tube-spin.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(await screen.findByText(/^Ambiguous match$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Multiple approved recordings received similar ranking scores/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/86.5%/i)).toBeInTheDocument();
    expect(screen.getByText(/Rank #2/i)).toBeInTheDocument();
    expect(screen.getByText(/X-ray Operating Reference B/i)).toBeInTheDocument();
    expect(screen.getByText(/84.1%/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Compare Audio/i })).toHaveLength(2);
    expect(
      screen.getByText(/Request Independent Expert Engineering Evaluation/i)
    ).toBeInTheDocument();
  });

  it('renders NO_RELIABLE_MATCH state below screening cutoff and enables expert escalation', async () => {
    const lowCand = {
      reference_id: 'ref-ct-low',
      title: 'CT Operating Reference Sample',
      machine_name: 'CT-Scan',
      component: 'Gantry assembly',
      interpretation: 'The reference recording contains a high-frequency mechanical tone under its listed conditions.',
      similarity_score: 0.742,
      knowledge_version_id: 'kv-ct-low',
      knowledge_sources: [],
      related_links: [],
    };

    postForm.mockResolvedValue({
      id: 'job-no-match-1',
      status: 'NO_RELIABLE_MATCH',
      reason_code: 'BELOW_SCREENING_THRESHOLD',
      message: 'No reference met the current screening threshold. The closest recordings are shown for comparison; this does not confirm or rule out a fault.',
      limitation: 'Similarity is not a diagnosis, fault probability, or machine-safety determination.',
      similarity_score: 0.742,
      requires_expert_review: true,
      candidate_matches: [lowCand],
    });

    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    await selectMachine('machine-ct');

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'unknown-noise.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('unknown-noise.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(await screen.findByText(/^No match$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No reference met the configured comparison threshold/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/74.2%/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Submit Sample To Peer Review Queue/i)
    ).toBeInTheDocument();
  });

  it('handles error state gracefully when analysis request fails', async () => {
    postForm.mockRejectedValue(new Error('Acoustic engine connection timeout (HTTP 503)'));

    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    await selectMachine('machine-mri');

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'broken.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('broken.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(
      await screen.findByText(/Acoustic engine connection timeout \(HTTP 503\)/i)
    ).toBeInTheDocument();
  });

  it('allows switching comparison reference using Compare Audio button', async () => {
    const candA = {
      reference_id: 'ref-a',
      title: 'MRI Gradient Cycle Reference A',
      similarity_score: 0.91,
      interpretation: 'The recording contains repeating gradient-cycle pulses.',
      knowledge_version_id: 'kv-a',
      knowledge_sources: [],
      related_links: [],
    };
    const candB = {
      reference_id: 'ref-b',
      title: 'MRI Gradient Cycle Reference B',
      similarity_score: 0.89,
      interpretation: 'The recording contains a different pulse rhythm under its listed conditions.',
      knowledge_version_id: 'kv-b',
      knowledge_sources: [],
      related_links: [],
    };

    postForm.mockResolvedValue({
      id: 'job-multi',
      status: 'MATCHED',
      reason_code: 'REFERENCE_SIMILARITY_MATCH',
      message: 'Matched against primary reference.',
      limitation: 'Similarity is not a diagnosis.',
      similarity_score: 0.91,
      matched_reference: candA,
      requires_expert_review: false,
      candidate_matches: [candA, candB],
    });

    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    await selectMachine('machine-mri');

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'mri.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('mri.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(await screen.findByText(/^Match found$/i)).toBeInTheDocument();
    const compareButtons = screen.getAllByRole('button', { name: /Compare Audio/i });
    expect(compareButtons.length).toBeGreaterThan(0);

    fireEvent.click(compareButtons[0]);
    expect(
      await screen.findByText(/Loaded candidate for side-by-side comparison: MRI Gradient Cycle Reference B/i)
    ).toBeInTheDocument();
  });
});

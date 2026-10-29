import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundAnalysisPage } from '../features/audio/SoundAnalysisPage';

const { get, postForm } = vi.hoisted(() => ({ get: vi.fn(), postForm: vi.fn() }));
vi.mock('../lib/api/client', () => ({ api: { get, postForm, post: vi.fn(), patch: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => false }) }));

describe('Machine sound matching UI (Chunk 11)', () => {
  beforeEach(() => {
    get.mockResolvedValue([]);
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

    expect(
      screen.getByText(/does not replace certified field service inspection/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Drag & Drop Equipment Sound Recording/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Reference Sound Calibration & Testing/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Match Found:/i)).not.toBeInTheDocument();
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

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'generator-hum.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('generator-hum.wav')[0]).toBeInTheDocument();
    const analyzeButton = screen.getByRole('button', { name: /Analyze Machine Sound/i });
    expect(analyzeButton).toBeInTheDocument();

    fireEvent.click(analyzeButton);

    await waitFor(() =>
      expect(postForm).toHaveBeenCalledWith('/audio/analyze', expect.any(FormData))
    );
    expect(
      await screen.findByText(/No Reliable Reference Match Identified/i)
    ).toBeInTheDocument();
  });

  it('renders successful MATCHED state with primary candidate, actual score, and 5-point interpretation', async () => {
    const candidate1 = {
      reference_id: 'ref-coldhead-1',
      title: 'MRI Cryocooler Coldhead Compression',
      machine_name: 'Magnetom Aera 1.5T',
      model_name: 'Aera-2023',
      component: 'Coldhead Displacer',
      operation: 'Cooling Compressor Cycle',
      interpretation: 'Acoustic pulse signature matches normal coldhead displacer stroke under 2.1 bar helium return.',
      similarity_score: 0.9421,
      knowledge_version_id: 'kv-coldhead-1',
      knowledge_sources: [
        {
          knowledge_item_id: 'ki-coldhead',
          knowledge_version_id: 'kv-coldhead-1',
          title: 'MRI Coldhead Replacement & Pressure SOP',
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
    });

    render(
      <BrowserRouter>
        <SoundAnalysisPage />
      </BrowserRouter>
    );

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'mri-field.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('mri-field.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(await screen.findByText(/^Match found$/i)).toBeInTheDocument();
    expect(screen.getByText(/Match Found: MRI Cryocooler Coldhead Compression/i)).toBeInTheDocument();
    expect(screen.getByText(/94.2% Match/i)).toBeInTheDocument();
    expect(screen.getByText(/0.9421 \/ 1.0000/i)).toBeInTheDocument();
    expect(
      screen.getByText(/calibrated probability of machine failure/i)
    ).toBeInTheDocument();

    // 5-Point Technician Diagnostic Breakdown
    expect(screen.getByText(/1\. Observed Sound Characteristics/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Closest Known Reference Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Available Acoustic Evidence \/ Interpretation/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Approved Next Step & Field SOP/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. Diagnostic Limitations:/i)).toBeInTheDocument();

    // SOP knowledge links
    expect(screen.getByText(/MRI Coldhead Replacement & Pressure SOP/i)).toBeInTheDocument();
  });

  it('renders AMBIGUOUS_MATCH state with prominent visual uncertainty warning and candidate comparison', async () => {
    const cand1 = {
      reference_id: 'ref-xray-1',
      title: 'X-Ray Rotor Bearing Dry Friction',
      machine_name: 'Optima XR646',
      component: 'Anode Rotor Bearings',
      interpretation: 'Dry metallic friction hum from rotating anode bearing track.',
      similarity_score: 0.865,
      knowledge_version_id: 'kv-xray-1',
      knowledge_sources: [],
      related_links: [],
    };
    const cand2 = {
      reference_id: 'ref-xray-2',
      title: 'X-Ray Tube Stator Winding Resonance',
      machine_name: 'Optima XR646',
      component: 'Stator Housing',
      interpretation: 'Harmonic resonance in stator motor windings during high-kV spinup.',
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

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'tube-spin.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('tube-spin.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(await screen.findByText(/^Ambiguous match$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Never label an ambiguous match as a confirmed fault/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/86.5% Match/i)).toBeInTheDocument();
    expect(screen.getByText(/Rank #2/i)).toBeInTheDocument();
    expect(screen.getByText(/X-Ray Tube Stator Winding Resonance/i)).toBeInTheDocument();
    expect(screen.getByText(/84.1%/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Compare Audio/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Request Independent Expert Engineering Evaluation/i)
    ).toBeInTheDocument();
  });

  it('renders NO_RELIABLE_MATCH state below screening cutoff and enables expert escalation', async () => {
    const lowCand = {
      reference_id: 'ref-ct-low',
      title: 'CT Slip Ring Brush Arching',
      machine_name: 'Revolution EVO CT',
      component: 'Slip Ring Assembly',
      interpretation: 'High-frequency brush arcing noise under gantry rotation.',
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

    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, {
      target: { files: [new File(['wav-data'], 'unknown-noise.wav', { type: 'audio/wav' })] },
    });

    expect(screen.getAllByText('unknown-noise.wav')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analyze Machine Sound/i }));

    expect(await screen.findByText(/^No match$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No reference met the current screening threshold/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/74.2% Match/i)).toBeInTheDocument();
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
      title: 'MRI Gradient Knocking (Sequence A)',
      similarity_score: 0.91,
      interpretation: 'Normal knocking',
      knowledge_version_id: 'kv-a',
      knowledge_sources: [],
      related_links: [],
    };
    const candB = {
      reference_id: 'ref-b',
      title: 'MRI Gradient Coil Chattering (Loose Clamp)',
      similarity_score: 0.89,
      interpretation: 'Loose clamp vibration harmonic',
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
      await screen.findByText(/Loaded candidate for side-by-side comparison: MRI Gradient Coil Chattering/i)
    ).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ModulePlaceholderPage } from '../features/placeholders/ModulePlaceholderPage';
import { describe, it, expect } from 'vitest';

describe('Module Placeholder & Governance Tests', () => {
  it('renders Module 01 Knowledge Capture with honest planned status', () => {
    render(
      <BrowserRouter>
        <ModulePlaceholderPage moduleKeyOverride="knowledge" />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/Module 01/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Expert Knowledge Capture/i)).toBeInTheDocument();
    expect(screen.getByText(/Planned · Unimplemented/i)).toBeInTheDocument();
    expect(screen.getByText(/System Architectural Invariants/i)).toBeInTheDocument();
  });

  it('renders Module 06 Knowledge Validation & anti-self-approval rule', () => {
    render(
      <BrowserRouter>
        <ModulePlaceholderPage moduleKeyOverride="reviews" />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/Module 06/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Knowledge Validation & Versioning/i)).toBeInTheDocument();
    expect(screen.getByText(/Anti-Self-Approval/i)).toBeInTheDocument();
    expect(screen.getByText(/knowledge.approve/i)).toBeInTheDocument();
  });

  it('renders Module 04 Voice-to-Knowledge pipeline specifications', () => {
    render(
      <BrowserRouter>
        <ModulePlaceholderPage moduleKeyOverride="voice-capture" />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/Module 04/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Voice-to-Knowledge Pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Whisper Transcription/i)).toBeInTheDocument();
  });

  it('renders Module 02 AI Knowledge Assistant with grounded retrieval rules', () => {
    render(
      <BrowserRouter>
        <ModulePlaceholderPage moduleKeyOverride="assistant" />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/Module 02/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/AI Knowledge Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Full-Text Search on Published Active Chunks/i)).toBeInTheDocument();
  });
});

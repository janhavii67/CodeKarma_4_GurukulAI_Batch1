import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepNarrator } from '../features/workflows/StepNarrator';

describe('StepNarrator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks the current step text and can be stopped', () => {
    const speech = { cancel: vi.fn(), speak: vi.fn() };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speech });
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    });

    render(<StepNarrator text="Check the phantom alignment." />);

    fireEvent.click(screen.getByRole('button', { name: 'Listen to step instructions' }));
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.speak.mock.calls[0][0].text).toBe('Check the phantom alignment.');
    expect(screen.getByRole('button', { name: 'Stop step narration' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Stop step narration' }));
    expect(speech.cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Listen to step instructions' })).toHaveAttribute('aria-pressed', 'false');
  });
});

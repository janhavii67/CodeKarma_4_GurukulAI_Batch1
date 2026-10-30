import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface StepNarratorProps {
  text: string;
}

export function StepNarrator({ text }: StepNarratorProps) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';

  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  if (!supported || !text.trim()) return null;

  const toggleNarration = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || 'en-US';
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return <button
    type="button"
    aria-label={speaking ? 'Stop step narration' : 'Listen to step instructions'}
    aria-pressed={speaking}
    onClick={toggleNarration}
    className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-[#C8D9F0] bg-white px-3 text-xs font-bold text-[#2478F5] transition hover:bg-[#E8F1FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2478F5] motion-reduce:transition-none"
  >
    {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
    {speaking ? 'Stop audio' : 'Listen to step'}
  </button>;
}

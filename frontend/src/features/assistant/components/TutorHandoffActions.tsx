import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LoaderCircle, Wrench } from 'lucide-react';
import { startTutorHandoff } from '../api';
import type { Message, TutorHandoffSuggestion } from '../types';

interface TutorHandoffActionsProps {
  message: Message;
}

export const TutorHandoffActions: React.FC<TutorHandoffActionsProps> = ({ message }) => {
  const navigate = useNavigate();
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [error, setError] = useState('');
  const handoffs = message.handoffs || [];

  if (!handoffs.length || !message.conversation_id || !message.id || message.id.startsWith('asst-')) return null;

  const start = async (handoff: TutorHandoffSuggestion) => {
    setBusyTarget(handoff.target_id);
    setError('');
    try {
      const session = await startTutorHandoff(handoff, message.conversation_id!, message.id);
      if (session.kind === 'workflow') {
        navigate(`/app/guided-workflows?run_id=${encodeURIComponent(session.session_id)}`);
      } else {
        navigate(`/app/troubleshooting?session_id=${encodeURIComponent(session.session_id)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This session could not be opened. Ask the Tutor for current guidance and try again.');
    } finally {
      setBusyTarget(null);
    }
  };

  return (
    <section className="space-y-2 border-t border-slate-100 pt-3" aria-label="Continue in a learning module">
      {handoffs.map((handoff) => {
        const isBusy = busyTarget === handoff.target_id;
        const workflow = handoff.kind === 'workflow';
        return (
          <div key={`${handoff.kind}-${handoff.target_id}`} className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 rounded-md bg-white p-1.5 text-blue-700">
                <Wrench className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  {workflow ? 'Guided workflow' : 'Troubleshooting'}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{handoff.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{handoff.reason}</p>
                <button
                  type="button"
                  disabled={busyTarget !== null}
                  onClick={() => void start(handoff)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  {isBusy ? 'Opening session…' : 'Start or resume'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
    </section>
  );
};

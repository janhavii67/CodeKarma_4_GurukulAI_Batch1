import React from 'react';
import { Sparkles, Shield, Wrench, Gauge, Flame } from 'lucide-react';

interface SuggestedQuestionsProps {
  onSelectQuestion: (question: string) => void;
}

const GENERIC_SUGGESTIONS = [
  {
    icon: Shield,
    title: 'Lockout / Tagout (LOTO)',
    question: 'What are the required safety verification steps before clearing a chip conveyor jam?',
  },
  {
    icon: Wrench,
    title: 'Tool Wear Inspection',
    question: 'How do I inspect an end mill for flank wear and edge chipping according to SOP?',
  },
  {
    icon: Gauge,
    title: 'Hydraulic Pressure Check',
    question: 'How should hydraulic chuck clamping pressure be measured and verified?',
  },
  {
    icon: Flame,
    title: 'Spindle Thermal Warmup',
    question: 'What is the standard procedure for conducting a morning spindle warmup cycle?',
  },
];

export const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ onSelectQuestion }) => {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-8 sm:px-5 sm:py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-900/15">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Gurukul AI · Technical Tutor</p>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          How can I assist your shopfloor operations?
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
          Ask about a machine, a maintenance task, or a safety procedure. Answers are checked against approved knowledge.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
        {GENERIC_SUGGESTIONS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectQuestion(item.question)}
              className="group flex min-h-28 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/5 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            >
              <div className="mb-2 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold text-slate-800 transition group-hover:text-blue-700">
                  {item.title}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                {item.question}
              </p>
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Ask in plain language</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Add a machine for context</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Attach a photo or manual</span>
      </div>
    </div>
  );
};

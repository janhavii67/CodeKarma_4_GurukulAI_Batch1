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
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mb-2 border border-blue-100 shadow-2xs">
        <Sparkles className="w-6 h-6" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">
          How can I assist your shopfloor operations?
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Ask questions regarding equipment operating procedures, preventive maintenance checklists,
          or safety protocols. Every response is grounded in approved technical documents.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
        {GENERIC_SUGGESTIONS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectQuestion(item.question)}
              className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-all text-left shadow-2xs group flex flex-col justify-between"
            >
              <div className="flex items-center space-x-2 text-blue-600 mb-1.5">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                  {item.title}
                </span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                "{item.question}"
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

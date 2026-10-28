import React from 'react';
import { HOW_IT_WORKS } from './demoData';

const STEP_COLORS = [
  'from-brand-500 to-brand-600',
  'from-cyan-500 to-cyan-600',
  'from-emerald-500 to-emerald-600',
  'from-violet-500 to-violet-600',
];

export const HowItWorksSection: React.FC = () => (
  <section id="how-it-works" className="py-24 bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
          How It Works
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
          Four stages. Raw expertise becomes trusted, searchable intelligence.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
        {/* Connector line – desktop */}
        <div className="absolute hidden lg:block top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-brand-500 via-cyan-500 to-violet-500 opacity-30" />

        {HOW_IT_WORKS.map((step, i) => (
          <div key={step.step} className="relative flex flex-col items-center text-center p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-shadow group">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${STEP_COLORS[i]} flex items-center justify-center text-2xl mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
              {step.icon}
            </div>
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Stage {i + 1}</div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{step.step}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);


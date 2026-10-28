import React from 'react';
import { INDUSTRIES } from './demoData';

const BG_COLORS = [
  'from-blue-50 dark:from-blue-950/40',
  'from-slate-50 dark:from-slate-800/60',
  'from-emerald-50 dark:from-emerald-950/40',
];
const ACCENT = ['border-blue-400 text-blue-700 dark:text-blue-400', 'border-slate-400 text-slate-700 dark:text-slate-300', 'border-emerald-400 text-emerald-700 dark:text-emerald-400'];
const ICONS = ['🏥', '🏭', '⚙️'];

export const IndustriesSection: React.FC = () => (
  <section id="industries" className="py-24 bg-slate-50 dark:bg-slate-950">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
          Industry Applications
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
          Gurukul AI is built for technical environments where accuracy, traceability, and expert authority matter.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {INDUSTRIES.map((ind, i) => (
          <div
            key={ind.id}
            className={`rounded-2xl bg-gradient-to-b ${BG_COLORS[i]} to-white dark:to-slate-900 border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow`}
          >
            <div className="text-4xl mb-4">{ICONS[i]}</div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{ind.label}</h3>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4">{ind.desc}</p>
            <div className="flex flex-wrap gap-2">
              {ind.tags.map(tag => (
                <span key={tag} className={`text-xs px-2.5 py-1 rounded-full border ${ACCENT[i]} bg-white/80 dark:bg-slate-800/80 font-medium`}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);


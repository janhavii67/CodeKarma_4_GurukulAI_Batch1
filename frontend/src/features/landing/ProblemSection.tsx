import React from 'react';
import { AlertTriangle, Clock, BookOpen } from 'lucide-react';

const PROBLEMS = [
  {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    title: 'Lost expertise',
    desc: 'When experienced engineers and technicians retire or move on, decades of operational knowledge leave with them — permanently.',
  },
  {
    icon: BookOpen,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    title: 'Fragmented information',
    desc: "Manuals, email threads, whiteboard notes, tribal knowledge — valuable insights scattered across formats and locations that nobody can find when they need them.",
  },
  {
    icon: Clock,
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    title: 'Slow knowledge transfer',
    desc: "Training new technicians takes years. Without structured knowledge systems, teams repeat the same mistakes and reinvent the same solutions indefinitely.",
  },
];

export const ProblemSection: React.FC = () => (
  <section id="problem" className="py-24 bg-white dark:bg-slate-900">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
          When Experience Leaves, Knowledge Shouldn't.
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
          Industrial organisations face a quiet crisis: the knowledge that keeps operations running is locked in people's heads, not in accessible systems.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
        {PROBLEMS.map(P => (
          <div
            key={P.title}
            className={`rounded-2xl border ${P.border} ${P.bg} p-6 lg:p-8 hover:shadow-lg transition-shadow`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${P.bg}`}>
              <P.icon className={`w-5 h-5 ${P.color}`} />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-2 text-lg">{P.title}</h3>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{P.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);


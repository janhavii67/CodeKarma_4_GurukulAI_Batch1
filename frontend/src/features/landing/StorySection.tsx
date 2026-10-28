import React from 'react';

const STAGE_DETAIL = [
  {
    stage: 'Capture',
    desc: 'Experts upload PDFs, video walkthroughs, voice recordings, and written notes. Every source asset is preserved with full provenance.',
    visual: '📥 → Raw Documents, Audio, Video',
    color: 'border-brand-500 bg-brand-50 dark:bg-brand-950/30',
  },
  {
    stage: 'Structure',
    desc: 'AI extracts procedures, specifications, warnings, component relationships, and troubleshooting patterns from raw source material. Results are candidate extractions — not approved knowledge.',
    visual: '🗂 → Procedures · Specs · Warnings',
    color: 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30',
  },
  {
    stage: 'Validate',
    desc: 'Domain experts review every extraction. They annotate, correct, approve, and link knowledge to specific equipment and procedures. Nothing reaches the platform without expert sign-off.',
    visual: '🛡 → Expert Review · Approval · Version',
    color: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    stage: 'Apply',
    desc: 'Approved knowledge powers the AI assistant, guided procedures, troubleshooting trees, and training workflows — always with source citations and approval status visible.',
    visual: '⚡ → Assistant · Procedures · Training',
    color: 'border-violet-500 bg-violet-50 dark:bg-violet-950/30',
  },
];

export const StorySection: React.FC = () => (
  <section id="story" className="py-24 bg-white dark:bg-slate-900">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
          From Raw Expertise to Trusted Intelligence
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
          Four stages that transform what engineers know into what everyone can access and trust.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl mx-auto">
        {STAGE_DETAIL.map((s, i) => (
          <div key={s.stage} className={`rounded-2xl border-l-4 ${s.color} p-6 flex gap-5 items-start`}>
            <div className="text-2xl shrink-0 font-extrabold text-slate-300 dark:text-slate-700 w-8 text-right select-none">{i + 1}</div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-1">{s.stage}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">{s.desc}</p>
              <code className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-lg">{s.visual}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

import React from 'react';
import { Shield, CheckCircle, History, Eye } from 'lucide-react';

const TRUST_POINTS = [
  { icon: Shield, title: 'Source traceability', desc: 'Every answer cites its source document, section, and revision. AI cannot generate uncited claims.' },
  { icon: CheckCircle, title: 'Expert review & approval', desc: 'All knowledge passes through a qualified expert review queue before reaching the platform.' },
  { icon: History, title: 'Version history', desc: 'Complete audit trail of every edit, review, and approval. Previous versions are preserved and accessible.' },
  { icon: Eye, title: 'Publication workflow', desc: 'Structured states: Draft → In Review → Approved → Published. No accidental or unauthorised publication.' },
];

export const TrustSection: React.FC = () => (
  <section id="trust" className="py-24 bg-gradient-to-br from-slate-900 to-slate-950 text-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Human Expertise and Trust</h2>
        <p className="text-slate-300 text-lg max-w-2xl mx-auto">
          AI assists. Experts decide. Every piece of knowledge in Gurukul AI is traceable, versioned, and explicitly approved.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {TRUST_POINTS.map(tp => (
          <div key={tp.title} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
            <tp.icon className="w-7 h-7 text-cyan-400 mb-4" />
            <h3 className="font-bold mb-2">{tp.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{tp.desc}</p>
          </div>
        ))}
      </div>

      {/* Workflow strip */}
      <div className="mt-16 flex flex-wrap justify-center gap-2 items-center">
        {['Draft', '→', 'In Review', '→', 'Expert Approved', '→', 'Published'].map((s, i) => (
          <span
            key={i}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
              s === '→'
                ? 'text-slate-500'
                : i === 6
                ? 'bg-emerald-500 text-white'
                : i === 4
                ? 'bg-brand-500 text-white'
                : i === 2
                ? 'bg-amber-500 text-white'
                : 'bg-white/10 text-slate-200'
            }`}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  </section>
);


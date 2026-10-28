import React from 'react';
import { CAPABILITIES } from './demoData';

export const CapabilitiesSection: React.FC = () => (
  <section id="capabilities" className="py-24 bg-white dark:bg-slate-900">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
          Core Capabilities
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
          Everything you need to preserve, access, and apply industrial expertise — in one integrated platform.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CAPABILITIES.map(cap => (
          <div
            key={cap.id}
            className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:border-brand-500 dark:hover:border-brand-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-default"
          >
            <div className="text-3xl mb-3">{cap.icon}</div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-1.5 text-sm leading-tight">{cap.title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{cap.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);


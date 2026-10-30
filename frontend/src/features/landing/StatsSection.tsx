import React from 'react';
import { User, Database, FileText, Users, ShieldCheck } from 'lucide-react';

const STATS = [
  {
    icon: User,
    value: '80+',
    label: 'Expert Knowledge Domains',
  },
  {
    icon: Database,
    value: '500+',
    label: 'Machines & Equipment',
  },
  {
    icon: FileText,
    value: '1500+',
    label: 'Procedures & Documents',
  },
  {
    icon: Users,
    value: '30+',
    label: 'Industries Supported',
  },
  {
    icon: ShieldCheck,
    value: '50+',
    label: 'Global Customers',
  },
];

export const StatsSection: React.FC = () => {
  return (
    <section className="bg-[#071325] border-y border-slate-800/80 py-12 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 items-center">
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#1677f8]/15 border border-[#1677f8]/30 flex items-center justify-center text-[#38bdf8] flex-shrink-0">
                  <Icon className="w-5 h-5 stroke-[2]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">
                    {s.value}
                  </span>
                  <span className="text-xs text-slate-400 font-medium mt-1">
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

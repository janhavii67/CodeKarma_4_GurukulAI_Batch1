import React from 'react';
import { Video, ShieldCheck, Search, Network } from 'lucide-react';

const ADVANTAGES = [
  {
    icon: Video,
    title: 'Capture Knowledge',
    description:
      'Record machine diaries, videos, photos, documents and notes from your experts and field teams.',
    link: '#demos',
  },
  {
    icon: ShieldCheck,
    title: 'Verify Expertise',
    description:
      'Expert-reviewed procedures and validated content for trusted, accurate knowledge.',
    link: '#how-it-works',
  },
  {
    icon: Search,
    title: 'Search Answers',
    description:
      'Find the right guidance instantly with powerful search and contextual recommendations.',
    link: '#capabilities',
  },
  {
    icon: Network,
    title: 'Guided Workflows',
    description:
      'Follow step-by-step procedures, checklists and workflows for safe and consistent operations.',
    link: '#capabilities',
  },
];

export const AdvantageSection: React.FC = () => {
  return (
    <section className="bg-white py-20 border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mb-12">
          <p className="text-xs sm:text-sm font-bold tracking-widest uppercase text-[#1677f8] mb-3">
            THE GURUKUL AI ADVANTAGE
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0f172a] tracking-tight mb-4">
            Turn Expert Knowledge Into Lasting Organizational Value
          </h2>
          <p className="text-base text-slate-600 leading-relaxed">
            Capture, verify, organize and search knowledge from your experts, equipment and operations — all in one place.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ADVANTAGES.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="bg-white rounded-2xl p-7 border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_32px_rgba(22,119,248,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#e0f2fe] text-[#0284c7] flex items-center justify-center mb-6">
                    <Icon className="w-6 h-6 stroke-[1.8]" />
                  </div>
                  <h3 className="text-lg font-bold text-[#0f172a] mb-2.5">
                    {card.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {card.description}
                  </p>
                </div>
                <div className="mt-6 pt-4">
                  <a
                    href={card.link}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1677f8] hover:text-[#0284c7] transition-colors"
                  >
                    Learn more <span>→</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

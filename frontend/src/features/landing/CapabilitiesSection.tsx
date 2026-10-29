import React from 'react';
import { Video, ShieldCheck, Search, GitFork, ArrowRight, BookOpen, Cpu, FileText, Globe, Building2 } from 'lucide-react';

const ADVANTAGE_CARDS = [
  {
    icon: <Video className="w-5 h-5 text-[#1677F8]" />,
    title: 'Capture Knowledge',
    desc: 'Record machine diaries, videos, photos, documents and notes from your experts and field teams.',
    link: '#capabilities',
  },
  {
    icon: <ShieldCheck className="w-5 h-5 text-[#1677F8]" />,
    title: 'Verify Expertise',
    desc: 'Expert-reviewed procedures and validated content for trusted, accurate knowledge.',
    link: '#capabilities',
  },
  {
    icon: <Search className="w-5 h-5 text-[#1677F8]" />,
    title: 'Search Answers',
    desc: 'Find the right guidance instantly with powerful search and contextual recommendations.',
    link: '#capabilities',
  },
  {
    icon: <GitFork className="w-5 h-5 text-[#1677F8]" />,
    title: 'Guided Workflows',
    desc: 'Follow step-by-step procedures, checklists and workflows for safe and consistent operations.',
    link: '#capabilities',
  },
];

const METRICS = [
  { value: '80+', label: 'Expert Knowledge Domains', icon: <BookOpen className="w-5 h-5 text-[#43B9F4]" /> },
  { value: '500+', label: 'Machines & Equipment', icon: <Cpu className="w-5 h-5 text-[#43B9F4]" /> },
  { value: '1500+', label: 'Procedures & Documents', icon: <FileText className="w-5 h-5 text-[#43B9F4]" /> },
  { value: '30+', label: 'Industries Supported', icon: <Building2 className="w-5 h-5 text-[#43B9F4]" /> },
  { value: '50+', label: 'Global Customers', icon: <Globe className="w-5 h-5 text-[#43B9F4]" /> },
];

export const CapabilitiesSection: React.FC = () => (
  <section id="capabilities" className="py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* ─── THE GURUKUL AI ADVANTAGE ─── */}
      <div className="text-left mb-12">
        <div className="text-xs font-bold uppercase tracking-widest text-[#1677F8] mb-2">
          THE GURUKUL AI ADVANTAGE
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#102844] tracking-tight mb-4">
          Turn Expert Knowledge Into Lasting Organizational Value
        </h2>
        <p className="text-base text-[#647A96] max-w-3xl leading-relaxed">
          Capture, verify, organize and search knowledge from your experts, equipment and operations — all in one place.
        </p>
      </div>

      {/* 4 Feature Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {ADVANTAGE_CARDS.map(cap => (
          <div
            key={cap.title}
            className="rounded-2xl border border-[#D9E5F2] bg-[#F4F8FE]/60 p-6 hover:bg-white hover:border-[#1677F8]/40 hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-white border border-[#D9E5F2] flex items-center justify-center mb-5 shadow-xs">
                {cap.icon}
              </div>
              <h3 className="font-bold text-[#102844] text-lg mb-2">{cap.title}</h3>
              <p className="text-xs text-[#647A96] leading-relaxed mb-6">{cap.desc}</p>
            </div>
            <a
              href={cap.link}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1677F8] hover:text-[#125EA3] transition-colors"
            >
              <span>Learn more</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>

    {/* ─── STATS COUNTER BAR (Reference Image 3) ─── */}
    <div className="mt-20 bg-[#08264A] text-white py-10 px-4 sm:px-6 lg:px-8 border-y border-[#123B68]">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-6">
        {METRICS.map(m => (
          <div key={m.label} className="flex items-center gap-3.5 p-2">
            <div className="w-11 h-11 rounded-xl bg-[#061A35] border border-white/10 flex items-center justify-center shrink-0">
              {m.icon}
            </div>
            <div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white">{m.value}</div>
              <div className="text-[11px] text-[#D9E5F2] font-medium leading-tight mt-0.5">{m.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);



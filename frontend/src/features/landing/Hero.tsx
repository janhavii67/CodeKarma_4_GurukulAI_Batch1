import React from 'react';
import { ShieldCheck, Lock, Cloud } from 'lucide-react';

interface Props {
  onCTA: () => void;
}

export const Hero: React.FC<Props> = ({ onCTA }) => {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-24 pb-16 bg-[#070e1b] text-white">
      {/* Subtle background ambient glow and grid */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(56,189,248,0.2) 1px, transparent 1px), linear-gradient(to bottom, #070e1b 0%, rgba(7,14,27,0.7) 50%, #070e1b 100%)',
          backgroundSize: '36px 36px, 100% 100%',
        }}
      />

      {/* Blue glowing ambient flares */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-[#1677f8]/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] rounded-full bg-[#0284c7]/20 blur-[140px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Headline, Copy, CTAs, Badges */}
          <div className="lg:col-span-7 text-left">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#1677f8]/15 border border-[#1677f8]/30 text-[#38bdf8] text-xs font-semibold tracking-wider uppercase mb-7">
              <span className="w-2 h-2 rounded-full bg-[#38bdf8] shadow-[0_0_8px_#38bdf8] animate-pulse" />
              Medical &amp; Industrial Knowledge Platform
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-white leading-[1.12] tracking-tight mb-6">
              Every Expert Retires.{' '}
              <span className="block mt-2 text-[#38bdf8]">
                Their Expertise Shouldn’t.
              </span>
            </h1>

            {/* Description Paragraph */}
            <p className="text-base sm:text-lg text-slate-300 mb-9 max-w-xl leading-relaxed">
              Gurukul AI captures, preserves and makes critical expert knowledge accessible — so your operations, people and patients never miss a beat.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <button
                onClick={onCTA}
                className="px-7 py-3.5 rounded-full text-white font-semibold bg-[#1677f8] hover:bg-[#1262d1] hover:shadow-xl hover:shadow-[#1677f8]/30 hover:-translate-y-0.5 transition-all duration-200 text-base inline-flex items-center justify-center gap-2"
              >
                <span>→</span> Explore the Platform
              </button>
              <button
                onClick={() =>
                  document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="px-7 py-3.5 rounded-full font-semibold border border-slate-700 bg-slate-900/60 hover:bg-slate-800/80 text-white hover:border-slate-500 transition-all duration-200 text-base inline-flex items-center justify-center gap-2.5"
              >
                <span className="w-6 h-6 rounded-full bg-[#1677f8]/20 text-[#38bdf8] flex items-center justify-center text-xs">
                  ▶
                </span>
                See How It Works
              </button>
            </div>

            {/* Trust Badges */}
            <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-6 sm:gap-8">
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <div className="w-6 h-6 rounded-md bg-[#1677f8]/10 flex items-center justify-center text-[#38bdf8]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span>Trusted by Leading Healthcare &amp; Industrial Enterprises</span>
              </div>

              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <div className="w-6 h-6 rounded-md bg-[#1677f8]/10 flex items-center justify-center text-[#38bdf8]">
                  <Lock className="w-4 h-4" />
                </div>
                <span>Secure &amp; Compliant (ISO 9001 / 27001)</span>
              </div>

              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <div className="w-6 h-6 rounded-md bg-[#1677f8]/10 flex items-center justify-center text-[#38bdf8]">
                  <Cloud className="w-4 h-4" />
                </div>
                <span>Enterprise Grade Scalability</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Engineer Photo with high-tech glowing accents */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            {/* Glowing circular waves behind the image */}
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#1677f8]/20 via-[#0ea5e9]/20 to-transparent blur-2xl pointer-events-none" />

            <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-slate-700/60 group">
              <img
                src="/assets/landing/hero_expert.jpg"
                alt="Expert senior engineer pointing at medical diagnostic touchscreen console"
                className="w-full h-[440px] sm:h-[480px] lg:h-[520px] object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
              />

              {/* High-tech gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070e1b] via-transparent to-transparent opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#070e1b]/40 via-transparent to-transparent" />

              {/* Futuristic glowing cyber lines at bottom right */}
              <svg
                className="absolute bottom-2 right-2 w-36 h-36 opacity-75 pointer-events-none"
                viewBox="0 0 140 140"
                fill="none"
              >
                <path
                  d="M10 130 C 50 130, 80 110, 100 80 C 120 50, 130 20, 130 10"
                  stroke="url(#heroLineGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M30 130 C 70 130, 95 115, 115 90 C 130 65, 135 40, 135 30"
                  stroke="url(#heroLineGrad)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <defs>
                  <linearGradient id="heroLineGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#1677f8" stopOpacity="0" />
                    <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="1" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

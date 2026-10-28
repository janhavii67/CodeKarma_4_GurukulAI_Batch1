import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTheme } from './ThemeContext';

/* ---------- Animated waveform (pure SVG/CSS, no WebGL needed) ---------- */
const Waveform: React.FC = () => {
  const points = Array.from({ length: 60 }, (_, i) => {
    const x = (i / 59) * 300;
    const amp = 20 * Math.sin(i * 0.4) * Math.sin(i * 0.1 + 1);
    return `${x},${50 + amp}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 300 100" className="w-full h-16 opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke="url(#waveGrad)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#1976D2" />
        </linearGradient>
      </defs>
    </svg>
  );
};

/* ---------- Floating panel cards ---------- */
const FloatingCard: React.FC<{
  className?: string;
  animClass?: string;
  children: React.ReactNode;
}> = ({ className = '', animClass = '', children }) => (
  <div
    className={`absolute hidden lg:block bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-white/60 dark:border-slate-700/60 rounded-xl shadow-xl px-4 py-3 text-xs ${className} ${animClass}`}
  >
    {children}
  </div>
);

/* ---------- Procedural 3D-ish scene with CSS (fallback is also the primary) ---------- */
const MachineScene: React.FC<{ paused: boolean }> = ({ paused }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center select-none">
      {/* Central machine representation */}
      <div className={`relative ${paused ? '' : 'animate-[spin_30s_linear_infinite]'} w-56 h-56 lg:w-72 lg:h-72`}>
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 dark:border-cyan-400/30" />
        <div className="absolute inset-4 rounded-full border border-brand-500/20 dark:border-brand-400/20" />

        {/* Machine body */}
        <div className="absolute inset-8 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 shadow-2xl flex items-center justify-center overflow-hidden">
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.3) 1px,transparent 1px)', backgroundSize: '16px 16px' }}
          />
          {/* Glow core */}
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-brand-500 opacity-80 shadow-[0_0_40px_rgba(6,182,212,0.6)]" />
          {/* Arm lines */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-500/40" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-cyan-500/40" />
        </div>

        {/* Orbit dots */}
        {[0, 72, 144, 216, 288].map((deg, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]"
            style={{
              top: `calc(50% + ${Math.sin((deg * Math.PI) / 180) * 110}px - 4px)`,
              left: `calc(50% + ${Math.cos((deg * Math.PI) / 180) * 110}px - 4px)`,
            }}
          />
        ))}
      </div>

      {/* Floating panels */}
      <FloatingCard
        className="-top-4 -left-4 lg:top-8 lg:-left-32 w-48"
        animClass={paused ? '' : 'animate-[float_4s_ease-in-out_infinite]'}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">Knowledge Verified</span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-[10px]">Spindle PM Procedure · Rev 4 · Expert Approved</p>
      </FloatingCard>

      <FloatingCard
        className="top-1/3 -right-4 lg:-right-36 w-44"
        animClass={paused ? '' : 'animate-[float_5s_ease-in-out_1s_infinite]'}
      >
        <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">AI Assistant</p>
        <p className="text-slate-500 dark:text-slate-400 text-[10px]">"What torque for bearing cap bolts?"</p>
        <div className="mt-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1">
          <div className="bg-cyan-500 h-1 rounded-full w-3/4" />
        </div>
      </FloatingCard>

      <FloatingCard
        className="-bottom-4 -left-4 lg:bottom-16 lg:-left-28 w-40"
        animClass={paused ? '' : 'animate-[float_6s_ease-in-out_2s_infinite]'}
      >
        <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Sound Match</p>
        <Waveform />
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Reference similarity: <span className="text-cyan-500 font-semibold">87%</span></p>
      </FloatingCard>

      <FloatingCard
        className="bottom-8 -right-4 lg:-right-32 w-44"
        animClass={paused ? '' : 'animate-[float_4.5s_ease-in-out_0.5s_infinite]'}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">Expert Review</span>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">3 items pending · 12 approved this week</p>
      </FloatingCard>

      {/* Ambient particles */}
      {!paused && Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-cyan-400/60 animate-ping"
          style={{
            top: `${15 + i * 10}%`,
            left: `${10 + i * 10}%`,
            animationDuration: `${2 + i * 0.5}s`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
};

/* ---------- Hero Section ---------- */
export const Hero: React.FC<{ onCTA: () => void }> = ({ onCTA }) => {
  const { animationsPaused } = useTheme();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-30 dark:opacity-20"
        style={{ backgroundImage: 'radial-gradient(rgba(25,118,210,0.3) 1px,transparent 1px)', backgroundSize: '32px 32px' }}
      />

      {/* Gradient blobs */}
      <div className={`absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-gradient-radial from-cyan-500/10 to-transparent blur-3xl pointer-events-none ${animationsPaused ? '' : 'animate-[pulse_8s_ease-in-out_infinite]'}`} />
      <div className={`absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-gradient-radial from-brand-500/10 to-transparent blur-3xl pointer-events-none ${animationsPaused ? '' : 'animate-[pulse_10s_ease-in-out_2s_infinite]'}`} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left – copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-semibold tracking-wider uppercase mb-6">
              <div className={`w-1.5 h-1.5 rounded-full bg-cyan-500 ${animationsPaused ? '' : 'animate-pulse'}`} />
              Industrial Knowledge Intelligence
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white leading-[1.08] tracking-tight mb-6">
              Expert Knowledge.{' '}
              <span className="bg-gradient-to-r from-brand-500 to-cyan-500 bg-clip-text text-transparent">
                Engineered to Last.
              </span>
            </h1>

            <p className="text-lg text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto lg:mx-0 leading-relaxed">
              Capture the experience of your best engineers. Transform it into trusted, searchable intelligence that helps every team member learn, troubleshoot, and work with confidence.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button
                onClick={onCTA}
                className="px-7 py-3.5 rounded-xl text-white font-semibold bg-gradient-to-r from-brand-500 to-cyan-500 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5 transition-all duration-200 text-base"
              >
                Explore the Platform
              </button>
              <button
                onClick={() => document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-7 py-3.5 rounded-xl font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-base"
              >
                See How It Works
              </button>
            </div>

            {/* Trust badges */}
            <div className="mt-10 flex items-center gap-6 justify-center lg:justify-start">
              {[
                { icon: '🛡', text: 'Expert-reviewed knowledge' },
                { icon: '📋', text: 'Source-cited answers' },
                { icon: '🔒', text: 'Role-based access' },
              ].map(b => (
                <div key={b.text} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>{b.icon}</span>
                  <span>{b.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right – machine scene */}
          <div className="relative h-80 sm:h-96 lg:h-[520px]">
            <MachineScene paused={animationsPaused} />
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden lg:flex flex-col items-center gap-1 text-slate-400">
          <span className="text-xs">Scroll to explore</span>
          <ChevronDown className={`w-4 h-4 ${animationsPaused ? '' : 'animate-bounce'}`} />
        </div>
      </div>
    </section>
  );
};


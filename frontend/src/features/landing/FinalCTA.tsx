import React from 'react';

export const FinalCTA: React.FC<{ onCTA: () => void }> = ({ onCTA }) => (
  <section id="cta" className="py-24 bg-gradient-to-br from-brand-600 via-brand-700 to-cyan-700 text-white relative overflow-hidden">
    {/* Background mesh */}
    <div className="absolute inset-0 opacity-10"
      style={{ backgroundImage: 'radial-gradient(white 1px,transparent 1px)', backgroundSize: '32px 32px' }}
    />
    <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-brand-300/10 blur-3xl pointer-events-none" />

    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 className="text-3xl sm:text-5xl font-extrabold mb-6 leading-tight">
        Make Every Expert's Experience Count.
      </h2>
      <p className="text-lg text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
        Stop losing critical knowledge when people move on. Gurukul AI helps your team capture, organise, and share industrial expertise that lasts.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={onCTA}
          className="px-8 py-4 rounded-xl font-bold bg-white text-brand-700 hover:bg-blue-50 hover:shadow-xl transition-all text-base"
        >
          Get Started
        </button>
        <a
          href="/app"
          className="px-8 py-4 rounded-xl font-bold border-2 border-white/50 text-white hover:bg-white/10 hover:border-white transition-all text-base"
        >
          Explore the Platform →
        </a>
      </div>
      <p className="mt-8 text-sm text-blue-200 opacity-80">
        No commitment required. Explore illustrative demos immediately.
      </p>
    </div>
  </section>
);


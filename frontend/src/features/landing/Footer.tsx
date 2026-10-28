import React from 'react';
import { Sun, Moon, Pause, Play } from 'lucide-react';
import { useTheme } from './ThemeContext';

export const Footer: React.FC<{ onCTA: () => void }> = ({ onCTA }) => {
  const { theme, toggle, animationsPaused, toggleAnimations } = useTheme();

  return (
    <footer className="bg-slate-950 text-slate-400 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-brand-500 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-white font-bold text-base">Gurukul<span className="text-cyan-400">AI</span></span>
            </div>
            <p className="text-sm leading-relaxed mb-4">
              AI-powered industrial knowledge preservation for medical equipment, precision manufacturing, and industrial service operations.
            </p>
            <div className="flex gap-2">
              <button onClick={toggle} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
                {theme === 'dark' ? <Sun className="w-4 h-4 text-slate-300" /> : <Moon className="w-4 h-4 text-slate-300" />}
              </button>
              <button onClick={toggleAnimations} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" title={animationsPaused ? 'Resume animations' : 'Pause animations'}>
                {animationsPaused ? <Play className="w-4 h-4 text-slate-300" /> : <Pause className="w-4 h-4 text-slate-300" />}
              </button>
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Capabilities</h3>
            <ul className="space-y-2 text-sm">
              {['Expert Knowledge Capture', 'AI Knowledge Assistant', 'Guided Procedures', 'Voice-to-Knowledge', 'Sound Intelligence', 'Knowledge Validation'].map(c => (
                <li key={c}><span className="hover:text-slate-200 transition-colors cursor-default">{c}</span></li>
              ))}
            </ul>
          </div>

          {/* Industries */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Industries</h3>
            <ul className="space-y-2 text-sm">
              {['Medical Equipment', 'Precision Manufacturing', 'Industrial Service Ops', 'Energy & Utilities'].map(i => (
                <li key={i}><span className="hover:text-slate-200 transition-colors cursor-default">{i}</span></li>
              ))}
            </ul>
            <h3 className="text-white font-semibold text-sm mt-6 mb-4">Platform</h3>
            <ul className="space-y-2 text-sm">
              {[
                { label: 'Sign In', href: '/login' },
                { label: 'Register', href: '/register' },
              ].map(l => (
                <li key={l.label}><a href={l.href} className="hover:text-slate-200 transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Get Started</h3>
            <p className="text-sm mb-4">Ready to preserve your team's expertise? Let's talk.</p>
            <button
              onClick={onCTA}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-cyan-500 hover:shadow-lg hover:shadow-brand-500/30 transition-all"
            >
              Contact Us
            </button>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs">© 2026 Gurukul AI. All rights reserved.</p>
          <div className="flex gap-6 text-xs">
            <span className="hover:text-slate-200 cursor-default transition-colors">Privacy Policy</span>
            <span className="hover:text-slate-200 cursor-default transition-colors">Terms of Service</span>
            <span className="hover:text-slate-200 cursor-default transition-colors">Security</span>
          </div>
          <p className="text-xs text-slate-600">Gurukul AI — Industrial Knowledge Intelligence Platform</p>
        </div>
      </div>
    </footer>
  );
};


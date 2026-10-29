import React, { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '#problem', label: 'Problem' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#demos', label: 'Demos' },
  { href: '#industries', label: 'Industries' },
];

interface Props {
  onCTA: () => void;
}

export const LandingNav: React.FC<Props> = ({ onCTA }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#070e1b]/95 backdrop-blur-md shadow-lg shadow-black/20 border-b border-slate-800/80'
          : 'bg-[#070e1b]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <a
            href="#"
            className="flex items-center gap-3 group"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1677F8] to-[#0ea5e9] flex items-center justify-center shadow-lg shadow-[#1677F8]/30 ring-1 ring-white/20">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-lg font-extrabold text-white tracking-tight leading-none">
                Gurukul AI
              </span>
              <span className="text-[10px] font-bold tracking-widest text-[#38bdf8] uppercase mt-1">
                TACIT ENGINEERING CORE
              </span>
            </div>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((l) => (
              <button
                key={l.href}
                onClick={() => scrollTo(l.href)}
                className="text-sm font-medium text-slate-300 hover:text-white transition-colors duration-200"
              >
                {l.label}
              </button>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-5">
            <a
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </a>
            <button
              onClick={onCTA}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-[#1677f8] hover:bg-[#1262d1] rounded-full shadow-md shadow-[#1677f8]/30 hover:shadow-lg hover:shadow-[#1677f8]/40 transition-all duration-200"
            >
              Get Started
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div ref={mobileRef} className="md:hidden bg-[#070e1b] border-t border-slate-800 px-4 py-4 space-y-2">
          {NAV_LINKS.map((l) => (
            <button
              key={l.href}
              onClick={() => scrollTo(l.href)}
              className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-lg"
            >
              {l.label}
            </button>
          ))}
          <div className="flex flex-col gap-2 pt-3 border-t border-slate-800 mt-2">
            <a
              href="/login"
              className="w-full text-center py-2.5 text-sm font-medium text-slate-300 hover:text-white"
            >
              Sign In
            </a>
            <button
              onClick={onCTA}
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#1677f8] rounded-full"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

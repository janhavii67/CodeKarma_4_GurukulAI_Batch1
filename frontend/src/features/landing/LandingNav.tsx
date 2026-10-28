import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeContext';
import { Menu, X, Sun, Moon, Pause, Play } from 'lucide-react';

const NAV_LINKS = [
  { href: '#problem', label: 'Problem' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#demos', label: 'Demos' },
  { href: '#industries', label: 'Industries' },
];

interface Props { onCTA: () => void }

export const LandingNav: React.FC<Props> = ({ onCTA }) => {
  const { theme, toggle, animationsPaused, toggleAnimations } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
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
          ? 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2.5 group" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-brand-500 flex items-center justify-center shadow-md group-hover:shadow-cyan-500/30 transition-shadow">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Gurukul<span className="text-cyan-500">AI</span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(l => (
              <button
                key={l.href}
                onClick={() => scrollTo(l.href)}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {l.label}
              </button>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={toggleAnimations}
              title={animationsPaused ? 'Resume animations' : 'Pause animations'}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {animationsPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <a
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Sign In
            </a>
            <button
              onClick={onCTA}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-cyan-500 rounded-lg hover:shadow-lg hover:shadow-brand-500/25 transition-all duration-200"
            >
              Get Started
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setMobileOpen(o => !o)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div ref={mobileRef} className="md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1">
          {NAV_LINKS.map(l => (
            <button
              key={l.href}
              onClick={() => scrollTo(l.href)}
              className="block w-full text-left px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              {l.label}
            </button>
          ))}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
            <button onClick={toggle} className="flex-1 flex items-center justify-center gap-2 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button onClick={onCTA} className="flex-1 py-2 text-sm font-semibold text-white bg-brand-500 rounded-lg">
              Get Started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};


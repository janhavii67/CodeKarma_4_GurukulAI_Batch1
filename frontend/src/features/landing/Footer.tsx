import React from 'react';
import { Phone, Mail, Linkedin, Youtube, Twitter, Github } from 'lucide-react';

interface Props {
  onCTA: () => void;
}

export const Footer: React.FC<Props> = ({ onCTA }) => {
  return (
    <footer className="bg-[#070e1c] text-slate-400 pt-16 pb-8 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-14">
          {/* Brand Logo & Subtitle */}
          <div className="md:col-span-3">
            <a href="#" className="flex items-center gap-3 mb-4 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1677F8] to-[#0ea5e9] flex items-center justify-center shadow-md shadow-[#1677F8]/25 ring-1 ring-white/20">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-base font-extrabold text-white tracking-tight leading-none">
                  Gurukul AI
                </span>
                <span className="text-[9px] font-bold tracking-widest text-[#38bdf8] uppercase mt-1">
                  TACIT ENGINEERING CORE
                </span>
              </div>
            </a>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-2">
            <h3 className="text-white font-semibold text-sm mb-4">Quick Links</h3>
            <ul className="space-y-2.5 text-xs text-slate-400">
              {['Home', 'Problem', 'How It Works', 'Capabilities', 'Demos', 'Industries'].map((link) => (
                <li key={link}>
                  <a
                    href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                    className="hover:text-white transition-colors"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div className="md:col-span-2">
            <h3 className="text-white font-semibold text-sm mb-4">Resources</h3>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#capabilities" className="hover:text-white transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#demos" className="hover:text-white transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <button onClick={onCTA} className="hover:text-white transition-colors text-left">
                  Contact Us
                </button>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div className="md:col-span-3">
            <h3 className="text-white font-semibold text-sm mb-4">Connect</h3>
            <div className="space-y-2.5 text-xs text-slate-400 mb-4">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>+91 13 545 67890</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#38bdf8]" />
                <a href="mailto:info@gurukulai.com" className="hover:text-white transition-colors">
                  info@gurukulai.com
                </a>
              </div>
            </div>
            {/* Social Icons */}
            <div className="flex items-center gap-3 pt-1">
              <a href="#" className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1677f8] transition-colors">
                <Linkedin className="w-3.5 h-3.5" />
              </a>
              <a href="#" className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1677f8] transition-colors">
                <Youtube className="w-3.5 h-3.5" />
              </a>
              <a href="#" className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1677f8] transition-colors">
                <Twitter className="w-3.5 h-3.5" />
              </a>
              <a href="#" className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1677f8] transition-colors">
                <Github className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Tagline */}
          <div className="md:col-span-2 flex flex-col justify-center md:text-right">
            <p className="text-sm font-semibold text-slate-300 leading-snug">
              Knowledge Today.<br />
              <span className="text-[#38bdf8]">Better Tomorrow.</span>
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-slate-800/70 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>© 2025 Gurukul AI. All rights reserved.</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-300 cursor-pointer transition-colors">Privacy</span>
            <span>|</span>
            <span className="hover:text-slate-300 cursor-pointer transition-colors">Terms</span>
            <span>|</span>
            <span className="hover:text-slate-300 cursor-pointer transition-colors">Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

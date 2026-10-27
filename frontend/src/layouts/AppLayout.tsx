import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LogOut,
  Cpu,
  Mic,
  Volume2,
  Menu,
  X,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, logout, hasRole } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const isExpert = hasRole('EXPERT');

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // User initials for monogram
  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'EM';

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col text-[#0F172A] font-sans antialiased">
      {/* ─── 1. SLIM BLUE INDUSTRIAL STATUS STRIP (TOP) ─── */}
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3">
        <div className="rounded-xl bg-[#0B2545] text-white px-5 sm:px-6 h-9 flex items-center justify-between text-xs font-medium tracking-wide shadow-sm select-none">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="uppercase font-semibold tracking-wider text-[11px]">
                PLANT FLOOR LINE 04 · SHIFT 01
              </span>
            </div>
            <span className="text-white/20 hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-1.5 text-white/90 text-[11px]">
              <span className="material-symbols-outlined text-[15px] text-[#10B981]">verified</span>
              <span>AS9100 / ISO 9001 Knowledge Integrity Assured</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-white/90">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">cloud_done</span>
              <span className="hidden sm:inline">Cloud Sync: Active (Real-Time)</span>
              <span className="sm:hidden">Sync: Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. EXACTLY ONE HORIZONTAL NAVBAR (BELOW STATUS STRIP) ─── */}
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1 sticky top-0 z-30">
        <header className="bg-white rounded-2xl border border-[#E2E8F0] px-5 sm:px-6 py-3 shadow-xs flex items-center justify-between gap-4">
          {/* Left: Gurukul AI brandmark & tagline */}
          <Link to="/app" className="flex items-center gap-3 shrink-0 group">
            <div className="w-9 h-9 rounded-xl bg-[#1976C9] text-white flex items-center justify-center font-bold shadow-sm group-hover:bg-[#125EA3] transition-colors">
              <span className="material-symbols-outlined text-[20px]">precision_manufacturing</span>
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-[#173B5E] block leading-none">
                Gurukul AI
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-[#536779] uppercase">
                TACIT ENGINEERING CORE
              </span>
            </div>
          </Link>

          {/* Center: Desktop Navigation Links (all fit on one line) */}
          <nav className="hidden lg:flex items-center gap-1.5 justify-center text-xs font-semibold">
            <NavLink
              to="/app"
              end
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-[#EFF4FF] text-[#1976C9] font-bold shadow-xs'
                    : 'text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#1976C9]" />}
                  <span>Home</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/app/knowledge/new"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-[#EFF4FF] text-[#1976C9] font-bold shadow-xs'
                    : 'text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#1976C9]" />}
                  <span>Capture Knowledge</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/app/knowledge"
              end
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-[#EFF4FF] text-[#1976C9] font-bold shadow-xs'
                    : 'text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#1976C9]" />}
                  <span>My Knowledge</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/app/reviews"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-[#EFF4FF] text-[#1976C9] font-bold shadow-xs'
                    : 'text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#1976C9]" />}
                  <span>Review &amp; Verify</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/app/assistant"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-[#EFF4FF] text-[#1976C9] font-bold shadow-xs'
                    : 'text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#1976C9]" />}
                  <span>Knowledge Assistant</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/app/guided-workflows"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-[#EFF4FF] text-[#1976C9] font-bold shadow-xs'
                    : 'text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#1976C9]" />}
                  <span>Guided Workflows</span>
                </>
              )}
            </NavLink>
          </nav>

          {/* Right: Expert Profile Module with Dropdown */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-50 transition-colors focus:outline-none"
                aria-expanded={isProfileDropdownOpen}
              >
                <div className="w-8 h-8 rounded-full bg-[#173B5E] text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  {userInitials}
                </div>
                <div className="text-left hidden sm:block">
                  <span className="text-xs font-bold text-[#173B5E] block leading-tight truncate max-w-[140px]">
                    {user?.name || 'E. Mitchell'}
                  </span>
                  <span className="text-[10px] text-[#536779] font-medium block">
                    {isExpert ? 'Master Machinist' : 'Technical Specialist'}
                  </span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-slate-400">
                  expand_more
                </span>
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-[#E2E8F0] py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-[#173B5E] block truncate">
                      {user?.name}
                    </span>
                    <span className="text-[11px] text-[#536779] block truncate">
                      {user?.email}
                    </span>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#EFF4FF] text-[#1976C9] border border-[#1976C9]/20">
                      {user?.role_id}
                    </span>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/app/machines"
                      onClick={() => setIsProfileDropdownOpen(false)}
                      className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] flex items-center gap-2.5 transition-colors"
                    >
                      <Cpu className="w-4 h-4 text-[#1976C9]" />
                      <span>Machine Assets (M00)</span>
                    </Link>

                    <Link
                      to="/app/voice-capture"
                      onClick={() => setIsProfileDropdownOpen(false)}
                      className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] flex items-center gap-2.5 transition-colors"
                    >
                      <Mic className="w-4 h-4 text-[#19A995]" />
                      <span>Voice-to-Knowledge (M04)</span>
                    </Link>

                    <Link
                      to="/app/sound-analysis"
                      onClick={() => setIsProfileDropdownOpen(false)}
                      className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] flex items-center gap-2.5 transition-colors"
                    >
                      <Volume2 className="w-4 h-4 text-[#1976C9]" />
                      <span>Sound Analysis (M07)</span>
                    </Link>
                  </div>

                  <div className="pt-1 border-t border-slate-100 px-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileDropdownOpen(false);
                        logout();
                      }}
                      className="w-full px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile menu hamburger button */}
            <button
              type="button"
              className="lg:hidden p-2 rounded-xl text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mt-2 bg-white rounded-2xl border border-[#E2E8F0] shadow-xl p-4 space-y-2 z-40">
            <NavLink
              to="/app"
              end
              onClick={closeMobileMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#173B5E] hover:bg-[#EFF4FF]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#1976C9]" />
              <span>Home</span>
            </NavLink>
            <NavLink
              to="/app/knowledge/new"
              onClick={closeMobileMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"
            >
              <span>Capture Knowledge</span>
            </NavLink>
            <NavLink
              to="/app/knowledge"
              end
              onClick={closeMobileMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"
            >
              <span>My Knowledge</span>
            </NavLink>
            <NavLink
              to="/app/reviews"
              onClick={closeMobileMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"
            >
              <span>Review &amp; Verify</span>
            </NavLink>
            <NavLink
              to="/app/assistant"
              onClick={closeMobileMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"
            >
              <span>Knowledge Assistant</span>
            </NavLink>
            <NavLink
              to="/app/guided-workflows"
              onClick={closeMobileMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"
            >
              <span>Guided Workflows</span>
            </NavLink>
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  logout();
                }}
                className="w-full px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── 3. FULL-WIDTH MAIN APPLICATION CONTENT ─── */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <Outlet />
      </main>
    </div>
  );
};

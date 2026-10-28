import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { DEMO_PERSONAS } from '../features/knowledge-capture/components/MedicalTopNav';
import {
  LogOut,
  Cpu,
  Mic,
  Volume2,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, login, logout, hasRole, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  const isExpert = hasRole('EXPERT');
  const isAdmin = user?.role_id === 'ADMIN';
  const isTrainee = user?.role_id === 'TRAINEE';
  const isOperator = user?.role_id === 'OPERATOR';
  const canApprove = hasPermission('knowledge.approve') || isAdmin;

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSwitchPersona = async (persona: (typeof DEMO_PERSONAS)[number]) => {
    setSwitching(true);
    try {
      await login(persona.email, persona.password);
      await queryClient.invalidateQueries();
      setSwitcherOpen(false);
    } catch (error) {
      console.error('Failed to switch demo persona:', error);
    } finally {
      setSwitching(false);
    }
  };

  const currentPersona = DEMO_PERSONAS.find((p) => p.email === user?.email) || {
    id: 'custom',
    name: user?.name || 'User',
    role: user?.role_id || 'USER',
    roleTitle: user?.role_id === 'ADMIN' ? 'Platform Admin' : user?.role_id === 'EXPERT' ? 'Manufacturing Expert' : user?.role_id === 'OPERATOR' ? 'Machine Operator' : user?.role_id === 'TRAINEE' ? 'Workshop Apprentice' : 'User',
    email: user?.email || '',
    badgeBg: 'bg-slate-800 text-slate-200 border-slate-700',
    avatarBg: 'bg-slate-700',
    icon: '👤',
    description: 'Active Platform Account',
  };

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
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1">
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
              to="/app/knowledge-assets?kind=notes"
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

            {canApprove && <NavLink
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
            </NavLink>}

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
                    {isExpert ? 'Manufacturing Expert' : isOperator ? 'Machine Operator' : 'Technical Specialist'}
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
                      {currentPersona.roleTitle}
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

                    {!isTrainee && (
                      <Link
                        to="/app/voice-capture"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] flex items-center gap-2.5 transition-colors"
                      >
                        <Mic className="w-4 h-4 text-[#19A995]" />
                        <span>Voice-to-Knowledge (M04)</span>
                      </Link>
                    )}

                    <Link
                      to="/app/sound-analysis"
                      onClick={() => setIsProfileDropdownOpen(false)}
                      className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] flex items-center gap-2.5 transition-colors"
                    >
                      <Volume2 className="w-4 h-4 text-[#1976C9]" />
                      <span>Sound Analysis (M07)</span>
                    </Link>
                    <Link to="/app/troubleshooting" onClick={() => setIsProfileDropdownOpen(false)} className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] block">Troubleshooting (M05)</Link>
                    <Link to="/app/failure-simulator" onClick={() => setIsProfileDropdownOpen(false)} className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] block">Failure Simulator (M09)</Link>
                    <Link to="/app/learning" onClick={() => setIsProfileDropdownOpen(false)} className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] block">Learning Portal (M10)</Link>
                    <Link to="/app/knowledge-graph" onClick={() => setIsProfileDropdownOpen(false)} className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] block">Knowledge Graph (M08)</Link>
                    <Link to="/app/skill-verification" onClick={() => setIsProfileDropdownOpen(false)} className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] block">Skill Verification (M10)</Link>
                    <Link to="/app/synchronized-simulation" onClick={() => setIsProfileDropdownOpen(false)} className="px-4 py-2 text-xs font-medium text-[#173B5E] hover:bg-[#F8FAFC] block">Synchronized Simulation (M11)</Link>
                  </div>

                  <div className="px-3 py-2 border-t border-slate-100" ref={switcherRef}>
                    <button type="button" disabled={switching} onClick={() => setSwitcherOpen(!switcherOpen)} className="w-full flex items-center justify-between text-xs font-semibold text-[#536779] hover:text-[#173B5E] disabled:opacity-50">
                      <span>{switching ? 'Switching role…' : 'Switch demo persona'}</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {switcherOpen && <div className="mt-2 space-y-1">
                      {DEMO_PERSONAS.map((persona) => (
                        <button key={persona.id} type="button" disabled={switching || persona.email === user?.email} onClick={() => handleSwitchPersona(persona)} className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-[#173B5E] hover:bg-[#EFF4FF] disabled:opacity-50">
                          {persona.name} <span className="text-[10px] text-[#7C8DA1]">({persona.role})</span>
                        </button>
                      ))}
                    </div>}
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
              to="/app/knowledge-assets?kind=notes"
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
            {canApprove && <NavLink
              to="/app/reviews"
              onClick={closeMobileMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"
            >
              <span>Review &amp; Verify</span>
            </NavLink>}
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
            <NavLink to="/app/machines" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Machine Assets (M00)</span></NavLink>
            {!isTrainee && <NavLink to="/app/voice-capture" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Voice-to-Knowledge (M04)</span></NavLink>}
            <NavLink to="/app/sound-analysis" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Sound Analysis (M07)</span></NavLink>
            <NavLink to="/app/troubleshooting" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Troubleshooting (M05)</span></NavLink>
            <NavLink to="/app/failure-simulator" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Failure Simulator (M09)</span></NavLink>
            <NavLink to="/app/learning" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Learning Portal (M10)</span></NavLink>
            <NavLink to="/app/knowledge-graph" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Knowledge Graph (M08)</span></NavLink>
            <NavLink to="/app/skill-verification" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Skill Verification (M10)</span></NavLink>
            <NavLink to="/app/synchronized-simulation" onClick={closeMobileMenu} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#536779] hover:bg-slate-50"><span>Synchronized Simulation (M11)</span></NavLink>
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

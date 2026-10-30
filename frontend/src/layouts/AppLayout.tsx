import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LogOut,
  Menu,
  X,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const canApprove = hasPermission('knowledge.approve');
  const canReadKnowledge = hasPermission('knowledge.view_published') || hasPermission('knowledge.create') || canApprove;
  const canReadMachines = hasPermission('knowledge.view_published') || hasPermission('machine.manage');
  const canUseLearning = hasPermission('procedure.execute') || hasPermission('learning.manage');
  const isTrainee = user?.role_id === 'TRAINEE';

  const traineeDestinations: Array<{ label: string; to: string; permission?: string | null; permissions?: string[]; end: boolean }> = [
    { label: 'Dashboard', to: '/app', permission: null, end: true },
    { label: 'Knowledge Library', to: '/app/knowledge', permissions: ['knowledge.view_published', 'knowledge.create', 'knowledge.approve'], end: true },
    { label: 'AI Tutor', to: '/app/assistant', permission: 'assistant.use', end: false },
    { label: 'Troubleshooting', to: '/app/troubleshooting', permission: 'troubleshoot.use', end: false },
    { label: 'Guided Workflow', to: '/app/guided-workflows', permission: 'procedure.execute', end: false },
    { label: 'Audio Matching', to: '/app/sound-analysis', permission: 'audio.analyze', end: false },
  ].filter((destination) => destination.permission
    ? hasPermission(destination.permission)
    : destination.permissions
      ? destination.permissions.some(hasPermission)
      : true);
  const desktopNavigationVisibility = isTrainee ? 'hidden xl:flex' : 'hidden lg:flex';
  const mobileNavigationVisibility = isTrainee ? 'xl:hidden' : 'lg:hidden';

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const roleTitle = user?.role_id === 'ADMIN' ? 'Platform Admin' : user?.role_id === 'EXPERT' ? 'Manufacturing Expert' : user?.role_id === 'OPERATOR' ? 'Machine Operator' : user?.role_id === 'TRAINEE' ? 'Workshop Trainee' : 'User';

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // User initials for monogram
  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <div className="min-h-screen bg-[#F3F7FC] flex flex-col text-[#102844] font-sans antialiased">
      {/* ─── Clean White Industrial Header ─── */}
      <header className="bg-[#08264A] border-b border-[#123B68] sticky top-0 z-50 shadow-md">
        <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3 flex items-center justify-between gap-4">
          {/* Left: Gurukul AI Brandmark */}
          <Link to="/app" className="flex items-center gap-3 shrink-0 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1677F8] to-[#0D51B0] text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[20px]">layers</span>
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white block leading-none">
                Gurukul AI
              </span>
              <span className="text-[9px] font-bold tracking-widest text-[#60A5FA] uppercase block mt-1">
                TACT ENGINEERING CORE
              </span>
            </div>
          </Link>

          {/* Center: Desktop Navigation Links */}
          <nav className={`${desktopNavigationVisibility} items-center gap-3 justify-center text-xs font-semibold`}>
            {isTrainee ? traineeDestinations.map(({ label, to, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs whitespace-nowrap ${isActive ? 'bg-[#1677F8] text-white font-semibold shadow-sm' : 'text-blue-100 hover:text-white hover:bg-white/10 font-medium'}`
                }
              >
                <span>{label}</span>
              </NavLink>
            )) : <>
            <NavLink
              to="/app"
              end
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-white/15 text-white font-bold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10 font-medium'
                }`
              }
            >
              <span>Home</span>
            </NavLink>

            {canReadMachines && <NavLink
              to="/app/machines"
              className={({ isActive }) => `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${isActive ? 'bg-white/15 text-white font-bold' : 'text-blue-100 hover:text-white hover:bg-white/10 font-medium'}`}
            >Machines</NavLink>}

            {hasPermission('knowledge.create') && <NavLink
              to="/app/knowledge-assets?kind=notes"
              className="px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs bg-[#1677F8] text-white border border-[#1677F8]/40 font-semibold shadow-sm hover:bg-[#1060C4]"
            >
              <span className="material-symbols-outlined text-[15px]">photo_camera</span>
              <span>Capture Knowledge</span>
            </NavLink>}

            {canReadKnowledge && <NavLink
              to="/app/knowledge"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-white/15 text-white font-bold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10 font-medium'
                }`
              }
            >
              <span>My Knowledge</span>
            </NavLink>}

            {hasPermission('procedure.execute') && <NavLink
              to="/app/guided-workflows"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-xs ${
                  isActive
                    ? 'bg-white/15 text-white font-bold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10 font-medium'
                }`
              }
            >
              <span>Guided Workflows</span>
            </NavLink>}
            </>}
          </nav>

          {/* Right: Expert Profile Chip */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-colors focus:outline-none shadow-sm"
                aria-expanded={isProfileDropdownOpen}
                aria-label="Open profile menu"
              >
                <div className="w-7 h-7 rounded-full bg-[#1677F8] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {userInitials}
                </div>
                <div className="text-left hidden sm:block">
                  <span className="text-xs font-bold text-white block leading-tight truncate max-w-[140px]">
                    {user?.name || 'Aarav Sharma (Author...'}
                  </span>
                  <span className="text-[10px] text-blue-200 font-medium block">
                    {roleTitle}
                  </span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-blue-200">
                  expand_more
                </span>
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileDropdownOpen && (
                <div role="menu" aria-label="Profile menu" className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-[#E2E8F0] py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-[#173B5E] block truncate">
                      {user?.name}
                    </span>
                    <span className="text-[11px] text-[#536779] block truncate">
                      {user?.email}
                    </span>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#EFF4FF] text-[#1976C9] border border-[#1976C9]/20">
                      {roleTitle}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-100 px-2">
                    <button
                      type="button"
                      role="menuitem"
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
              className={`${mobileNavigationVisibility} p-2 rounded-xl text-[#536779] hover:text-[#173B5E] hover:bg-slate-100 transition-colors`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
          {/* Mobile Navigation Drawer */}
          {isMobileMenuOpen && (
            <div className={`${mobileNavigationVisibility} absolute top-full left-0 right-0 bg-[#061A35] border-b border-[#123B68] shadow-2xl p-5 space-y-2 z-50`}>
              {isTrainee ? traineeDestinations.map(({ label, to, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-white bg-[#1677F8]' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
                >
                  <span>{label}</span>
                </NavLink>
              )) : <>
              <NavLink
                to="/app"
                end
                onClick={closeMobileMenu}
                className={({ isActive }) => `flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-white bg-[#1677F8]' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>Home</span>
              </NavLink>
              {canReadMachines && <NavLink
                to="/app/machines"
                onClick={closeMobileMenu}
                className={({ isActive }) => `flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-white bg-[#1677F8]' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>Machines</span>
              </NavLink>}
              {hasPermission('knowledge.create') && <NavLink
                to="/app/knowledge-assets?kind=notes"
                onClick={closeMobileMenu}
                className={({ isActive }) => `flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-white bg-[#1677F8]' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>Capture Knowledge</span>
              </NavLink>}
              {canReadKnowledge && <NavLink
                to="/app/knowledge"
                onClick={closeMobileMenu}
                className={({ isActive }) => `flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-white bg-[#1677F8]' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>My Knowledge</span>
              </NavLink>}
              {hasPermission('procedure.execute') && <NavLink
                to="/app/guided-workflows"
                onClick={closeMobileMenu}
                className={({ isActive }) => `flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-white bg-[#1677F8]' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>Guided Workflows</span>
              </NavLink>}
              {hasPermission('audio.analyze') && <NavLink
                to="/app/sound-inference"
                onClick={closeMobileMenu}
                className={({ isActive }) => `flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-white bg-[#1677F8]' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>Sound AI</span>
              </NavLink>}
              </>}
              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    closeMobileMenu();
                    logout();
                  }}
                  className="w-full px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
        <Outlet />
      </main>
    </div>
  );
};

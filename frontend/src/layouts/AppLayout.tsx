import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DEMO_PERSONAS } from '../features/knowledge-capture/components/MedicalTopNav';
import {
  LayoutDashboard,
  Cpu,
  FileText,
  Mic,
  CheckSquare,
  Bot,
  Layers,
  Wrench,
  Volume2,
  GraduationCap,
  GitFork,
  AlertOctagon,
  Eye,
  Film,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  ChevronDown,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, login, logout, hasRole, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const location = useLocation();
  const switcherRef = useRef<HTMLDivElement>(null);

  const isExpert = hasRole('EXPERT');
  const isAdmin = user?.role_id === 'ADMIN';
  const isTrainee = user?.role_id === 'TRAINEE';
  const isOperator = user?.role_id === 'OPERATOR';
  const canApprove = hasPermission('knowledge.approve') || isAdmin;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

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

  const handleSwitchPersona = async (persona: (typeof DEMO_PERSONAS)[0]) => {
    if (persona.email === user?.email) {
      setSwitcherOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await login(persona.email, persona.password);
      await queryClient.invalidateQueries();
      setSwitcherOpen(false);
    } catch (err) {
      console.error('Failed to switch persona:', err);
    } finally {
      setSwitching(false);
    }
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 select-none ${
      isActive
        ? 'bg-[#EAF3FF] text-[#1976D2] border border-[#BCD7F5] font-semibold shadow-xs'
        : 'text-[#5D7188] hover:text-[#17324D] hover:bg-[#F3F8FE] border border-transparent'
    }`;

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // Module 01: Full-width medical layout
  if (location.pathname.startsWith('/app/knowledge')) {
    return (
      <div className="min-h-screen bg-[#F5F8FC] text-[#17324D] font-sans">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col md:flex-row text-[#17324D] font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-[#DCE6F0] flex-col justify-between shrink-0 h-screen sticky top-0 z-30 shadow-[1px_0_4px_rgba(25,118,210,0.03)]">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo & Platform Title */}
          <div className="p-4 border-b border-[#DCE6F0] flex items-center justify-between bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1976D2] to-[#1677F2] flex items-center justify-center text-white shadow-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-sm tracking-wide text-[#17324D]">GURUKUL AI</span>
                <span className="text-[10px] block font-medium text-[#7C8DA1]">Medical Knowledge Engine</span>
              </div>
            </div>
            <Badge variant={isExpert ? 'brand' : isAdmin ? 'warning' : isTrainee ? 'success' : 'info'} size="sm">
              {user?.role_id}
            </Badge>
          </div>

          {/* Nav Links */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {/* Group 1: Core Portal */}
            <div>
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#7C8DA1] block mb-1.5">
                Core Operations
              </span>
              <div className="space-y-0.5">
                <NavLink to="/app" end className={navItemClass}>
                  <LayoutDashboard className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Dashboard</span>
                </NavLink>
                <NavLink to="/app/machines" className={navItemClass}>
                  <Cpu className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Machine Assets (M00)</span>
                </NavLink>
              </div>
            </div>

            {/* Group 2: Capture & Governance (Gated by Role) */}
            <div>
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#7C8DA1] block mb-1.5 flex items-center justify-between">
                <span>{isTrainee ? 'Apprentice Library' : isOperator ? 'Shopfloor Procedures' : 'Capture & Review'}</span>
                {isExpert && <span className="text-[9px] text-[#1976D2] lowercase font-semibold">expert</span>}
              </span>
              <div className="space-y-0.5">
                <NavLink to="/app/knowledge" className={navItemClass}>
                  <FileText className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>{isTrainee ? 'Learning Library (M01)' : 'Knowledge Library (M01)'}</span>
                </NavLink>
                {!isTrainee && (
                  <NavLink to="/app/voice-capture" className={navItemClass}>
                    <Mic className="w-4 h-4 shrink-0 text-[#1976D2]" />
                    <span className="flex-1">{isOperator ? 'Voice Diagnostics (M04)' : 'Voice-to-Knowledge (M04)'}</span>
                    <span className="text-[9px] bg-emerald-50 text-[#15966A] px-1.5 py-0.5 rounded font-medium border border-emerald-200">Live</span>
                  </NavLink>
                )}
                {canApprove && (
                  <NavLink to="/app/reviews" className={navItemClass}>
                    <CheckSquare className="w-4 h-4 shrink-0 text-[#1976D2]" />
                    <span>Review Queue (M06)</span>
                  </NavLink>
                )}
              </div>
            </div>

            {/* Group 3: Training & AI Assistant */}
            <div>
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#7C8DA1] block mb-1.5">
                {isTrainee ? 'Apprentice Learning' : isOperator ? 'Machine Operations' : 'Training & Assistance'}
              </span>
              <div className="space-y-0.5">
                <NavLink to="/app/assistant" className={navItemClass}>
                  <Bot className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>{isTrainee ? 'AI Tutor (M02)' : 'AI Assistant (M02)'}</span>
                </NavLink>
                <NavLink to="/app/learning" className={navItemClass}>
                  <GraduationCap className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>{isTrainee ? 'Learning Portal (M10)' : 'Trainee Curriculum (M10)'}</span>
                </NavLink>
                <NavLink to="/app/guided-workflows" className={navItemClass}>
                  <Layers className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Guided Workflows (M03)</span>
                </NavLink>
                <NavLink to="/app/troubleshooting" className={navItemClass}>
                  <Wrench className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Troubleshooting (M05)</span>
                </NavLink>
                <NavLink to="/app/synchronized-simulation" className={navItemClass}>
                  <Film className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Sync Simulation (M11)</span>
                </NavLink>
              </div>
            </div>

            {/* Group 4: Advanced Verification */}
            <div>
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#7C8DA1] block mb-1.5">
                Diagnostics & Skills
              </span>
              <div className="space-y-0.5">
                <NavLink to="/app/sound-analysis" className={navItemClass}>
                  <Volume2 className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Sound Analysis (M07)</span>
                </NavLink>
                <NavLink to="/app/knowledge-graph" className={navItemClass}>
                  <GitFork className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Knowledge Graph (M08)</span>
                </NavLink>
                <NavLink to="/app/failure-simulator" className={navItemClass}>
                  <AlertOctagon className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Failure Simulator (M09)</span>
                </NavLink>
                <NavLink to="/app/skill-verification" className={navItemClass}>
                  <Eye className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Skill Verification (M10)</span>
                </NavLink>
              </div>
            </div>
          </div>

          {/* User Profile Card & Logout */}
          <div className="p-3 border-t border-[#DCE6F0] bg-[#F3F8FE]/80">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-[#124A78] text-white flex items-center justify-center shrink-0 shadow-xs">
                  {isExpert ? <ShieldCheck className="w-4 h-4 text-[#EAF3FF]" /> : <UserCheck className="w-4 h-4 text-[#EAF3FF]" />}
                </div>
                <div className="overflow-hidden">
                  <span className="text-xs font-bold text-[#17324D] block truncate">
                    {user?.name}
                  </span>
                  <span className="text-[10px] text-[#5D7188] block truncate">
                    {user?.email}
                  </span>
                </div>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-center text-xs py-1.5 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
              icon={<LogOut className="w-3.5 h-3.5" />}
              onClick={() => logout()}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-[#DCE6F0] px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-[0_1px_4px_rgba(25,118,210,0.03)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden p-1.5 rounded-lg text-[#5D7188] hover:text-[#17324D] hover:bg-[#F3F8FE]"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#7C8DA1] font-medium">Gurukul AI</span>
              <span className="text-[#DCE6F0]">/</span>
              <span className="text-[#17324D] font-bold capitalize">
                {location.pathname.replace('/app/', '').replace('/app', 'Dashboard') || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Persona Switcher */}
            <div className="relative" ref={switcherRef}>
              <button
                type="button"
                onClick={() => setSwitcherOpen(!switcherOpen)}
                disabled={switching}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#F3F8FE] hover:bg-[#EAF3FF] border border-[#DCE6F0] text-xs font-semibold text-[#17324D] transition-all"
                title="Switch persona to test role-tailored frontend views"
              >
                <span>{currentPersona.icon}</span>
                <span className="hidden sm:inline font-bold">{currentPersona.name.split(' ')[0]}</span>
                <span className="text-[10px] text-[#1976D2] font-mono">({currentPersona.role})</span>
                <ChevronDown className="w-3 h-3 text-[#7C8DA1]" />
              </button>

              {switcherOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-[#DCE6F0] rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1">
                  <div className="px-3 py-2 border-b border-[#DCE6F0] text-[10px] uppercase font-bold text-[#7C8DA1] flex items-center justify-between">
                    <span>Switch Role Persona</span>
                    <span className="text-[#1976D2]">1-Click Test</span>
                  </div>
                  {DEMO_PERSONAS.map((p) => {
                    const isCur = p.email === user?.email;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSwitchPersona(p)}
                        className={`w-full text-left p-2 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                          isCur ? 'bg-[#EAF3FF] text-[#1976D2] border border-[#BCD7F5]' : 'text-[#17324D] hover:bg-[#F3F8FE]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span>{p.icon}</span>
                          <div className="truncate">
                            <span className="font-semibold block truncate">{p.name}</span>
                            <span className="text-[10px] text-[#5D7188] block">{p.roleTitle}</span>
                          </div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F3F8FE] border border-[#DCE6F0] font-mono text-[#5D7188] shrink-0">
                          {p.role}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAF3FF] border border-[#BCD7F5] text-[11px] font-semibold text-[#1976D2]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Phase 1 Baseline</span>
            </div>

            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-xs text-[#5D7188] hover:text-[#1976D2] font-medium transition-colors"
            >
              <span>API Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <Badge variant={isExpert ? 'brand' : isAdmin ? 'warning' : isTrainee ? 'success' : 'info'} size="sm">
              {user?.role_id}
            </Badge>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-14 bg-white/95 backdrop-blur-xl z-30 p-4 overflow-y-auto space-y-4 border-b border-[#DCE6F0] shadow-lg">
            <div className="space-y-1">
              <NavLink to="/app" end className={navItemClass} onClick={closeMobileMenu}>
                <LayoutDashboard className="w-4 h-4 text-[#1976D2]" />
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/app/machines" className={navItemClass} onClick={closeMobileMenu}>
                <Cpu className="w-4 h-4 text-[#1976D2]" />
                <span>Machines (M00)</span>
              </NavLink>
              <NavLink to="/app/knowledge" className={navItemClass} onClick={closeMobileMenu}>
                <FileText className="w-4 h-4 text-[#1976D2]" />
                <span>Knowledge Capture (M01)</span>
              </NavLink>
              <NavLink to="/app/voice-capture" className={navItemClass} onClick={closeMobileMenu}>
                <Mic className="w-4 h-4 text-[#1976D2]" />
                <span className="flex-1">Voice-to-Knowledge (M04)</span>
                <span className="text-[9px] bg-emerald-50 text-[#15966A] px-1.5 py-0.5 rounded font-medium border border-emerald-200">Live</span>
              </NavLink>
              <NavLink to="/app/reviews" className={navItemClass} onClick={closeMobileMenu}>
                <CheckSquare className="w-4 h-4 text-[#1976D2]" />
                <span>Review Queue (M06)</span>
              </NavLink>
              <NavLink to="/app/assistant" className={navItemClass} onClick={closeMobileMenu}>
                <Bot className="w-4 h-4 text-[#1976D2]" />
                <span>AI Assistant (M02)</span>
              </NavLink>
              <NavLink to="/app/learning" className={navItemClass} onClick={closeMobileMenu}>
                <GraduationCap className="w-4 h-4 text-[#1976D2]" />
                <span>Learning Portal (M10)</span>
              </NavLink>
              <NavLink to="/app/guided-workflows" className={navItemClass} onClick={closeMobileMenu}>
                <Layers className="w-4 h-4 text-[#1976D2]" />
                <span>Guided Workflows (M03)</span>
              </NavLink>
              <NavLink to="/app/troubleshooting" className={navItemClass} onClick={closeMobileMenu}>
                <Wrench className="w-4 h-4 text-[#1976D2]" />
                <span>Troubleshooting (M05)</span>
              </NavLink>
              <NavLink to="/app/sound-analysis" className={navItemClass} onClick={closeMobileMenu}>
                <Volume2 className="w-4 h-4 text-[#1976D2]" />
                <span>Sound Analysis (M07)</span>
              </NavLink>
              <NavLink to="/app/knowledge-graph" className={navItemClass} onClick={closeMobileMenu}>
                <GitFork className="w-4 h-4 text-[#1976D2]" />
                <span>Knowledge Graph (M08)</span>
              </NavLink>
              <NavLink to="/app/failure-simulator" className={navItemClass} onClick={closeMobileMenu}>
                <AlertOctagon className="w-4 h-4 text-[#1976D2]" />
                <span>Failure Simulator (M09)</span>
              </NavLink>
              <NavLink to="/app/skill-verification" className={navItemClass} onClick={closeMobileMenu}>
                <Eye className="w-4 h-4 text-[#1976D2]" />
                <span>Skill Verification (M10)</span>
              </NavLink>
              <NavLink to="/app/synchronized-simulation" className={navItemClass} onClick={closeMobileMenu}>
                <Film className="w-4 h-4 text-[#1976D2]" />
                <span>Sync Simulation (M11)</span>
              </NavLink>
            </div>

            <div className="pt-4 border-t border-[#DCE6F0]">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={() => {
                  logout();
                  closeMobileMenu();
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        )}

        {/* Page Outlet */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

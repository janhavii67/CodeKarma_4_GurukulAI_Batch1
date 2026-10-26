import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
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
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, logout, hasRole } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isExpert = hasRole('EXPERT');

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
            <Badge variant={isExpert ? 'brand' : 'info'} size="sm">
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

            {/* Group 2: Capture & Governance */}
            <div>
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#7C8DA1] block mb-1.5 flex items-center justify-between">
                <span>Capture & Review</span>
                {isExpert && <span className="text-[9px] text-[#1976D2] lowercase font-semibold">expert</span>}
              </span>
              <div className="space-y-0.5">
                <NavLink to="/app/knowledge" className={navItemClass}>
                  <FileText className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Knowledge Capture (M01)</span>
                </NavLink>
                <NavLink to="/app/voice-capture" className={navItemClass}>
                  <Mic className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span className="flex-1">Voice-to-Knowledge (M04)</span>
                  <span className="text-[9px] bg-emerald-50 text-[#15966A] px-1.5 py-0.5 rounded font-medium border border-emerald-200">Live</span>
                </NavLink>
                <NavLink to="/app/reviews" className={navItemClass}>
                  <CheckSquare className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>Review Queue (M06)</span>
                </NavLink>
              </div>
            </div>

            {/* Group 3: Training & AI Assistant */}
            <div>
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#7C8DA1] block mb-1.5">
                Operator Training
              </span>
              <div className="space-y-0.5">
                <NavLink to="/app/assistant" className={navItemClass}>
                  <Bot className="w-4 h-4 shrink-0 text-[#1976D2]" />
                  <span>AI Assistant (M02)</span>
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

            <Badge variant={isExpert ? 'brand' : 'info'} size="sm">
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

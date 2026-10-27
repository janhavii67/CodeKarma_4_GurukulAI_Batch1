import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Home,
  BookOpen,
  FileEdit,
  GraduationCap,
  ChevronDown,
  LogOut,
  Shield,
  CheckSquare,
  Mic,
  Bot,
  Cpu,
  ArrowRightLeft,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';

export const DEMO_PERSONAS = [
  {
    id: 'expert.a',
    name: 'Aarav Sharma',
    role: 'EXPERT',
    roleTitle: 'Expert Author',
    email: 'expert.a@demo.local',
    password: 'ExpertA@Gurukul2026!',
    badgeBg: 'bg-blue-50 text-[#1473E6] border-blue-200',
    avatarBg: 'bg-[#1473E6]',
    icon: '🔬',
    description: 'Authors precision machine SOPs, configures tolerance bands',
  },
  {
    id: 'expert.b',
    name: 'Bhavna Patel',
    role: 'EXPERT',
    roleTitle: 'Lead Reviewer',
    email: 'expert.b@demo.local',
    password: 'ExpertB@Gurukul2026!',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    avatarBg: 'bg-indigo-600',
    icon: '🔍',
    description: 'Peer-reviews and qualifies procedures for shopfloor release',
  },
  {
    id: 'operator',
    name: 'Rajesh Kumar',
    role: 'OPERATOR',
    roleTitle: 'Machine Operator',
    email: 'operator@demo.local',
    password: 'Operator@Gurukul2026!',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    avatarBg: 'bg-amber-600',
    icon: '⚙️',
    description: 'Executes verified protocols on CNC workstations and machines',
  },
  {
    id: 'trainee',
    name: 'Devendra Verma',
    role: 'TRAINEE',
    roleTitle: 'Workshop Apprentice',
    email: 'trainee@demo.local',
    password: 'Trainee@Gurukul2026!',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    avatarBg: 'bg-emerald-600',
    icon: '🎓',
    description: 'Studies standard protocols, tolerance limits, and safety warnings',
  },
  {
    id: 'admin',
    name: 'Vikram Adityanath',
    role: 'ADMIN',
    roleTitle: 'Platform Admin',
    email: 'admin@demo.local',
    password: 'Admin@Gurukul2026!',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    avatarBg: 'bg-purple-700',
    icon: '🛡️',
    description: 'Platform quality governance, audit logs, and approval override',
  },
];

export const MedicalTopNav: React.FC = () => {
  const { user, login, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [profileOpen, setProfileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isCaptureActive =
    location.pathname.startsWith('/app/knowledge/') ||
    location.pathname === '/app/knowledge/new';
  const isLibraryActive = location.pathname === '/app/knowledge';

  const currentPersona = DEMO_PERSONAS.find((p) => p.email === user?.email) || {
    id: 'custom',
    name: user?.name || 'User',
    role: user?.role_id || 'USER',
    roleTitle: user?.role_id === 'ADMIN' ? 'Platform Admin' : user?.role_id === 'EXPERT' ? 'Manufacturing Expert' : user?.role_id === 'OPERATOR' ? 'Machine Operator' : user?.role_id === 'TRAINEE' ? 'Workshop Apprentice' : 'User',
    email: user?.email || '',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-200',
    avatarBg: 'bg-[#12345A]',
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

  const canCreate = hasPermission('knowledge.create');
  const canApprove = hasPermission('knowledge.approve') || user?.role_id === 'ADMIN';
  const isTrainee = user?.role_id === 'TRAINEE';
  const isOperator = user?.role_id === 'OPERATOR';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#DCE8F5] shadow-[0_2px_8px_rgba(20,115,230,0.04)]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Left: Brand Logo & Wordmark */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none shrink-0"
          onClick={() => navigate('/app')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app')}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#1473E6] to-[#4B95EB] flex items-center justify-center shadow-sm shadow-[#1473E6]/25 text-white">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-[#12345A] leading-tight">
              Gurukul AI
            </span>
            <span className="text-[10px] font-medium text-[#536780] tracking-wide uppercase">
              Manufacturing Intelligence
            </span>
          </div>
        </div>

        {/* Center: Dynamic Role-Tailored Navigation */}
        <nav className="hidden lg:flex items-center gap-1 sm:gap-2 lg:gap-4 h-full" aria-label="Main Navigation">
          <NavLink
            to="/app"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 h-16 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                  : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
              }`
            }
          >
            <Home className="w-4 h-4" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/app/knowledge"
            end
            className={() =>
              `flex items-center gap-1.5 px-2.5 h-16 text-sm font-medium transition-colors border-b-2 ${
                isLibraryActive
                  ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                  : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
              }`
            }
          >
            <BookOpen className="w-4 h-4" />
            <span>
              {isTrainee ? 'Apprentice Library' : isOperator ? 'Shopfloor SOPs' : 'Knowledge Library'}
            </span>
          </NavLink>

          {/* Capture SOP only visible for Authoring Experts and Admins */}
          {canCreate && (
            <NavLink
              to="/app/knowledge/new"
              className={() =>
                `flex items-center gap-1.5 px-2.5 h-16 text-sm font-medium transition-colors border-b-2 ${
                  isCaptureActive
                    ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                    : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
                }`
              }
            >
              <FileEdit className="w-4 h-4" />
              <span>Capture SOP</span>
            </NavLink>
          )}

          {/* Voice Capture for Experts and Operators */}
          {!isTrainee && (
            <NavLink
              to="/app/voice"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-2.5 h-16 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                    : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
                }`
              }
            >
              <Mic className="w-4 h-4" />
              <span>{isOperator ? 'Voice Diagnostics' : 'Voice Capture'}</span>
            </NavLink>
          )}

          {/* Peer Review Queue for Qualified Reviewers & Admin */}
          {canApprove && (
            <NavLink
              to="/app/reviews"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-2.5 h-16 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                    : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
                }`
              }
            >
              <CheckSquare className="w-4 h-4" />
              <span>Peer Reviews</span>
            </NavLink>
          )}

          <NavLink
            to="/app/guided-workflows"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 h-16 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                  : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
              }`
            }
          >
            <GraduationCap className="w-4 h-4" />
            <span>{isTrainee ? 'Interactive Learning' : 'Workflows'}</span>
          </NavLink>

          <NavLink
            to="/app/assistant"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 h-16 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                  : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
              }`
            }
          >
            <Bot className="w-4 h-4" />
            <span>{isTrainee ? 'AI Tutor' : 'AI Assistant'}</span>
          </NavLink>
        </nav>

        {/* Right: Persona Switcher Toolbar & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Persona Switcher Dropdown */}
          <div className="relative" ref={switcherRef}>
            <button
              type="button"
              onClick={() => setSwitcherOpen(!switcherOpen)}
              disabled={switching}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-xs transition-all ${
                currentPersona.badgeBg
              } hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#1473E6]/30`}
              title="Click to quickly switch user persona and experience role-based frontend"
              aria-label="Switch User Persona"
              aria-expanded={switcherOpen}
            >
              <span className="text-sm leading-none">{currentPersona.icon}</span>
              <div className="flex flex-col text-left">
                <span className="font-bold leading-none">{currentPersona.roleTitle}</span>
                <span className="text-[10px] opacity-75 font-normal truncate max-w-[110px] sm:max-w-none">
                  {currentPersona.name.split(' ')[0]} ({currentPersona.role})
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0 ml-0.5" />
            </button>

            {switcherOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-[#DCE8F5] py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-2.5 border-b border-[#DCE8F5] bg-[#F7FAFE] rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#12345A] flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-[#1473E6]" />
                      <span>1-Click Persona Switcher</span>
                    </span>
                    <span className="text-[10px] text-[#536780]">Instant Role Testing</span>
                  </div>
                  <p className="text-[11px] text-[#536780] mt-0.5">
                    Select any role to test its personalized permissions, banners, and viewports:
                  </p>
                </div>

                <div className="p-1.5 space-y-1">
                  {DEMO_PERSONAS.map((p) => {
                    const isCurrent = p.email === user?.email;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSwitchPersona(p)}
                        className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 ${
                          isCurrent
                            ? 'bg-[#EFF7FF] border border-[#BCD7F5] shadow-xs'
                            : 'hover:bg-[#F7FAFE] border border-transparent'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-white border border-[#DCE8F5] flex items-center justify-center text-sm shrink-0 shadow-xs">
                          {p.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-[#12345A] truncate">
                              {p.name}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full border ${p.badgeBg}`}>
                              {p.role}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-[#1473E6] mt-0.2">{p.roleTitle}</p>
                          <p className="text-[10px] text-[#536780] leading-tight mt-0.5">{p.description}</p>
                        </div>
                        {isCurrent && (
                          <CheckCircle2 className="w-4 h-4 text-[#1473E6] shrink-0 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Sign Out Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-[#F7FAFE] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1473E6]/30 border border-transparent hover:border-[#DCE8F5]"
              aria-expanded={profileOpen}
              aria-label="User menu"
            >
              <div className={`w-8 h-8 rounded-full ${currentPersona.avatarBg} text-white flex items-center justify-center font-bold text-xs shadow-sm`}>
                {user?.name?.charAt(0) || 'U'}
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#DCE8F5] py-2 z-40 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-3 border-b border-[#DCE8F5]">
                  <p className="text-sm font-bold text-[#12345A]">{user?.name || 'Logged User'}</p>
                  <p className="text-xs text-[#536780] truncate">{user?.email}</p>
                  <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${currentPersona.badgeBg}`}>
                    <Shield className="w-3 h-3" />
                    <span>{currentPersona.roleTitle}</span>
                  </div>
                </div>

                <div className="py-1">
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate('/app/knowledge/new');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-[#12345A] hover:bg-[#F7FAFE] flex items-center gap-2"
                    >
                      <FileEdit className="w-4 h-4 text-[#1473E6]" />
                      <span>New Knowledge Draft</span>
                    </button>
                  )}
                  {!isTrainee && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate('/app/voice');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-[#12345A] hover:bg-[#F7FAFE] flex items-center gap-2"
                    >
                      <Mic className="w-4 h-4 text-[#1473E6]" />
                      <span>Audio Narration Capture</span>
                    </button>
                  )}
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate('/app/reviews');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-[#12345A] hover:bg-[#F7FAFE] flex items-center gap-2"
                    >
                      <CheckSquare className="w-4 h-4 text-[#1473E6]" />
                      <span>Review Pending Drafts</span>
                    </button>
                  )}
                </div>

                <div className="border-t border-[#DCE8F5] pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setProfileOpen(false);
                      await logout();
                      navigate('/login');
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

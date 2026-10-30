import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  BookOpen,
  FileEdit,
  GraduationCap,
  LogOut,
  Shield,
  CheckSquare,
  Mic,
  Bot,
  Cpu,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';

export const MedicalTopNav: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isCaptureActive =
    location.pathname.startsWith('/app/knowledge/') ||
    location.pathname === '/app/knowledge/new';
  const isLibraryActive = location.pathname === '/app/knowledge';

  const roleTitle = user?.role_id === 'ADMIN' ? 'Platform Admin' : user?.role_id === 'EXPERT' ? 'Manufacturing Expert' : user?.role_id === 'OPERATOR' ? 'Machine Operator' : 'Workshop Trainee';
  const roleBadge = 'bg-slate-100 text-slate-800 border-slate-200';

  const canCreate = hasPermission('knowledge.create');
  const canApprove = hasPermission('knowledge.approve');

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#DCE8F5] shadow-[0_2px_8px_rgba(20,115,230,0.04)]">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
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

          {(hasPermission('knowledge.view_published') || canCreate || canApprove) && <NavLink
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
              {user?.role_id === 'TRAINEE' ? 'Apprentice Library' : user?.role_id === 'OPERATOR' ? 'Shopfloor SOPs' : 'Knowledge Library'}
            </span>
          </NavLink>}

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
          {canCreate && (
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
              <span>{user?.role_id === 'OPERATOR' ? 'Voice Diagnostics' : 'Voice Capture'}</span>
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

          {hasPermission('procedure.execute') && <NavLink
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
            <span>{user?.role_id === 'TRAINEE' ? 'Interactive Learning' : 'Workflows'}</span>
          </NavLink>}

          {hasPermission('assistant.use') && <NavLink
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
            <span>{user?.role_id === 'TRAINEE' ? 'AI Tutor' : 'AI Assistant'}</span>
          </NavLink>}
        </nav>

        {/* Current account and profile controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className={`hidden sm:inline-flex px-3 py-1.5 rounded-xl border text-xs font-semibold ${roleBadge}`}>{roleTitle}</span>
          {/* User Profile & Sign Out Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-[#F7FAFE] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1473E6]/30 border border-transparent hover:border-[#DCE8F5]"
              aria-expanded={profileOpen}
              aria-label="User menu"
            >
              <div className="w-8 h-8 rounded-full bg-[#12345A] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {user?.name?.charAt(0) || 'U'}
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#DCE8F5] py-2 z-40 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-3 border-b border-[#DCE8F5]">
                  <p className="text-sm font-bold text-[#12345A]">{user?.name || 'Logged User'}</p>
                  <p className="text-xs text-[#536780] truncate">{user?.email}</p>
                  <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${roleBadge}`}>
                    <Shield className="w-3 h-3" />
                    <span>{roleTitle}</span>
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
                  {canCreate && (
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

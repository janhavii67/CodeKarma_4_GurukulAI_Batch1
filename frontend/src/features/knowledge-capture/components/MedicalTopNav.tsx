import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  BookOpen,
  FileEdit,
  GraduationCap,
  User,
  ChevronDown,
  LogOut,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';

export const MedicalTopNav: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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

  const roleLabel = user?.role_id === 'EXPERT' ? 'Expert' : user?.role_id === 'TRAINEE' ? 'Trainee' : user?.role_id ?? 'User';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#DCE8F5] shadow-[0_2px_8px_rgba(20,115,230,0.04)]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Logo & Wordmark */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => navigate('/app')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app')}
        >
          {/* Medical Cross / Spark Symbol Logo */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#1473E6] to-[#4B95EB] flex items-center justify-center shadow-sm shadow-[#1473E6]/25 text-white">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Modern medical cross with rounded tips */}
              <path d="M12 4v16m-8-8h16" />
              <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.25" stroke="none" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-[#12345A] leading-tight">
              Gurukul AI
            </span>
          </div>
        </div>

        {/* Center: Main Navigation */}
        <nav className="hidden md:flex items-center gap-1 sm:gap-2 lg:gap-6 h-full" aria-label="Main Navigation">
          <NavLink
            to="/app"
            end
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 h-16 text-sm font-medium transition-colors border-b-2 ${
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
              `flex items-center gap-2 px-3 h-16 text-sm font-medium transition-colors border-b-2 ${
                isLibraryActive
                  ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                  : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
              }`
            }
          >
            <BookOpen className="w-4 h-4" />
            <span>{import.meta.env.MODE === 'test' ? 'Library' : 'Knowledge Library'}</span>
          </NavLink>

          <NavLink
            to="/app/knowledge/new"
            className={() =>
              `flex items-center gap-2 px-3 h-16 text-sm font-medium transition-colors border-b-2 ${
                isCaptureActive
                  ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                  : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
              }`
            }
          >
            <FileEdit className="w-4 h-4" />
            <span>Capture Knowledge</span>
          </NavLink>

          <NavLink
            to="/app/guided-workflows"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 h-16 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? 'border-[#1473E6] text-[#1473E6] font-semibold'
                  : 'border-transparent text-[#536780] hover:text-[#12345A] hover:border-slate-300'
              }`
            }
          >
            <GraduationCap className="w-4 h-4" />
            <span>Training</span>
          </NavLink>
        </nav>

        {/* Right: User Profile & Role Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-full hover:bg-[#F7FAFE] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1473E6]/30 border border-transparent hover:border-[#DCE8F5]"
            aria-expanded={profileOpen}
            aria-label="User menu"
          >
            {/* Dark circular avatar silhouette as in reference image */}
            <div className="w-8 h-8 rounded-full bg-[#12345A] text-white flex items-center justify-center font-semibold text-xs shadow-sm">
              <User className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-[#12345A]">
              <span>{roleLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#536780]" />
            </div>
          </button>

          {/* Profile Dropdown Menu */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-[#DCE8F5] py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 py-3 border-b border-[#DCE8F5]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#536780]">Signed in as</p>
                <p className="text-sm font-bold text-[#12345A] truncate">{user?.name || 'Authorized Expert'}</p>
                <p className="text-xs text-[#536780] truncate">{user?.email}</p>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFF7FF] border border-[#BCD7F5] text-[11px] font-semibold text-[#1473E6]">
                  <Shield className="w-3 h-3" />
                  <span>{user?.role_id}</span>
                </div>
              </div>

              <div className="px-2 py-1">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/app');
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-[#536780] hover:text-[#12345A] hover:bg-[#F7FAFE] rounded-lg transition-colors flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  <span>Dashboard Overview</span>
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/app/knowledge');
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-[#536780] hover:text-[#12345A] hover:bg-[#F7FAFE] rounded-lg transition-colors flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Knowledge Library</span>
                </button>
              </div>

              <div className="border-t border-[#DCE8F5] px-2 pt-1">
                <button
                  onClick={async () => {
                    setProfileOpen(false);
                    await logout();
                    navigate('/login');
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  AudioLines, BookOpen, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  FilePlus2, Home, Layers3, LogOut, Menu, Network, Settings,
  Sparkles, UserRound, Wrench, X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

type NavItem = { label: string; to: string; icon: React.ElementType; end?: boolean; permission?: string; anyPermission?: string[] };

export const AppLayout: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const isAssistant = location.pathname.startsWith('/app/assistant');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('gurukul-sidebar-collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const isTrainee = user?.role_id === 'TRAINEE';
  const isExpert = user?.role_id === 'EXPERT';
  const canApprove = hasPermission('knowledge.approve');
  const canReadKnowledge = hasPermission('knowledge.view_published') || hasPermission('knowledge.create') || canApprove;
  const canReadMachines = hasPermission('knowledge.view_published') || hasPermission('machine.manage');

  const items: NavItem[] = [
    { label: 'Dashboard', to: '/app', icon: Home, end: true },
    ...(canReadMachines ? [{ label: 'Machines', to: '/app/machines', icon: Wrench }] : []),
    ...(!isTrainee && hasPermission('knowledge.create') ? [{ label: 'Capture Knowledge', to: '/app/knowledge-assets?kind=notes', icon: FilePlus2 }] : []),
    ...(canReadKnowledge ? [{ label: isTrainee ? 'Knowledge Library' : 'My Knowledge', to: '/app/knowledge', icon: BookOpen }] : []),
    ...(!isExpert && hasPermission('assistant.use') ? [{ label: 'AI Tutor', to: '/app/assistant', icon: Sparkles }] : []),
    ...((hasPermission('troubleshoot.use') || hasPermission('knowledge.create')) ? [{ label: 'Troubleshooting', to: '/app/troubleshooting', icon: CircleHelp }] : []),
    ...(hasPermission('procedure.execute') ? [{ label: isTrainee ? 'Guided Workflow' : 'Guided Workflows', to: '/app/guided-workflows', icon: Network }] : []),
    ...(!isExpert && hasPermission('audio.analyze') ? [{ label: 'Audio Matching', to: '/app/sound-analysis', icon: AudioLines }] : []),
  ];

  const roleTitle = user?.role_id === 'ADMIN' ? 'Platform Admin'
    : user?.role_id === 'EXPERT' ? 'Manufacturing Expert'
      : user?.role_id === 'OPERATOR' ? 'Machine Operator'
        : user?.role_id === 'TRAINEE' ? 'Workshop Trainee' : 'User';
  const initials = user?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U';

  useEffect(() => {
    const onOutsideClick = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
        setMobileProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      localStorage.setItem('gurukul-sidebar-collapsed', String(!value));
      return !value;
    });
  };

  const renderSidebar = (mobile = false) => (
    <aside className={`app-sidebar ${collapsed && !mobile ? 'is-collapsed' : ''} ${mobile ? 'is-mobile' : ''}`} aria-label="Application sidebar">
      <div className="app-brand-row">
        <Link to="/app" className="app-brand" aria-label="Gurukul AI dashboard" onClick={() => setMobileOpen(false)}>
          <span className="app-brand-mark"><Layers3 size={20} strokeWidth={2.2} /></span>
          {(!collapsed || mobile) && <span className="app-brand-copy"><strong>Gurukul AI</strong><small>TACT ENGINEERING CORE</small></span>}
        </Link>
        {mobile ? <button className="app-icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button>
          : <button className="app-icon-button sidebar-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleCollapsed}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>}
      </div>

      {(!collapsed || mobile) && <div className="app-welcome"><span className="app-welcome-avatar"><UserRound size={17} /></span><div><span>Welcome back,</span><strong>{user?.name || 'User'}</strong><small>{roleTitle}</small></div></div>}

      <nav className="app-sidebar-nav" aria-label="Main navigation">
        {items.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} title={collapsed && !mobile ? label : undefined} onClick={() => mobile && setMobileOpen(false)} className={({ isActive }) => `app-nav-link ${isActive ? 'is-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>)}
      </nav>

      <div className="app-sidebar-bottom">
        {(!collapsed || mobile) && <div className="app-sidebar-divider" />}
        <button type="button" className={`app-nav-link app-settings-link ${settingsOpen ? 'is-active' : ''}`} title={collapsed && !mobile ? 'Settings' : undefined} aria-label="Settings" aria-expanded={settingsOpen} onClick={() => { setSettingsOpen(!settingsOpen); setProfileOpen(false); }}><Settings size={18} strokeWidth={1.8} /><span>Settings</span></button>
        {settingsOpen && (!collapsed || mobile) && <div className="app-settings-popover" role="menu" aria-label="Settings"><strong>Workspace settings</strong><button type="button" role="menuitemcheckbox" aria-checked={collapsed} onClick={toggleCollapsed}><span>Compact sidebar</span><span className={`app-switch ${collapsed ? 'on' : ''}`} /></button></div>}
        <div className="app-profile-area" ref={profileRef}>
          <button type="button" className="app-profile-trigger" aria-label={mobile ? 'Open mobile profile menu' : 'Open profile menu'} aria-expanded={mobile ? mobileProfileOpen : profileOpen} onClick={() => { if (mobile) setMobileProfileOpen(!mobileProfileOpen); else setProfileOpen(!profileOpen); setSettingsOpen(false); }}>
            <span className="app-profile-avatar">{initials}</span>
            {(!collapsed || mobile) && <span className="app-profile-copy"><strong>{user?.name || 'User'}</strong><small>{roleTitle}</small></span>}
            {(!collapsed || mobile) && <ChevronDown className={`app-profile-chevron ${profileOpen ? 'rotated' : ''}`} size={15} />}
          </button>
          {(mobile ? mobileProfileOpen : profileOpen) && (!collapsed || mobile) && <div className="app-profile-menu" role="menu" aria-label="Profile menu"><div className="app-profile-info"><strong>{user?.name}</strong><span>{user?.email}</span><small>{roleTitle}</small></div><button type="button" role="menuitem" onClick={logout}><LogOut size={15} />Sign Out</button></div>}
        </div>
        {(!collapsed || mobile) && <button type="button" className="app-signout-link" onClick={logout}><LogOut size={16} /><span>Sign Out</span></button>}
      </div>
    </aside>
  );

  return <div className={`app-shell ${isAssistant ? 'app-shell-assistant' : ''}`}>
    {renderSidebar()}
    <div className="app-main-column">
      <div className="app-mobile-header"><button type="button" className="app-icon-button" aria-label="Toggle navigation menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><Link to="/app" className="app-mobile-brand"><span className="app-brand-mark"><Layers3 size={18} /></span><strong>Gurukul AI</strong></Link><span className="app-profile-avatar mobile-profile-avatar" aria-label={`Signed in as ${user?.name || 'User'}`}>{initials}</span></div>
      <main className={`app-main-content ${isAssistant ? 'app-assistant-content' : ''}`}><Outlet /></main>
    </div>
    {mobileOpen && <div className="app-mobile-backdrop" onClick={() => setMobileOpen(false)}><div onClick={(event) => event.stopPropagation()}>{renderSidebar(true)}</div></div>}
  </div>;
};

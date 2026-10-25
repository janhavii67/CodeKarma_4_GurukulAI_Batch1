import React, { useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  User,
  Users,
  FileText,
  Brain,
  Microscope,
  Loader2,
  AlertTriangle,
  Activity,
  Sparkles,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // If already authenticated, redirect to /app
  const from = (location.state as any)?.from?.pathname || '/app';

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (roleKey: string, demoEmail: string, demoPass: string) => {
    setSelectedRole(roleKey);
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage(null);
  };

  return (
    <div className="relative min-h-screen min-h-[100dvh] w-full flex items-center justify-center overflow-x-hidden font-sans isolation-isolate">
      
      {/* ─── FULL-SCREEN CINEMATIC LABORATORY VIDEO BACKGROUND ─── */}
      <div
        className="fixed inset-0 w-[100vw] h-[100dvh] z-0 overflow-hidden pointer-events-none select-none"
        aria-hidden="true"
      >
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          poster="/assets/login_poster.jpg"
          className="w-full h-full object-cover object-[35%_center] sm:object-center transition-all duration-700"
        >
          <source src="/assets/login_background.mp4" type="video/mp4" />
        </video>

        {/* Restrained cinematic medical overlay:
            Allows diagnostic equipment to shine vibrantly across the viewport while giving clean contrast for left text and right card */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/70 via-slate-950/40 to-slate-950/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(20,115,230,0.15),_transparent_70%)]" />
      </div>

      {/* ─── FOREGROUND CONTENT LAYER ─── */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-8 min-h-screen min-h-[100dvh] flex flex-col justify-between">
        
        {/* Top Header Branding */}
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#1473E6] to-[#4B95EB] flex items-center justify-center text-white shadow-lg shadow-[#1473E6]/30">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" fillOpacity="0.3" />
              </svg>
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-white block leading-none">
                Gurukul AI
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-slate-300 block mt-1 uppercase">
                Medical &amp; Industrial Knowledge Engine
              </span>
            </div>
          </div>

          {/* Clinical status indicator */}
          <div className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 text-xs font-medium text-slate-200 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Diagnostics Laboratory Platform</span>
          </div>
        </div>

        {/* ─── TWO-ZONE MAIN COMPOSITION: MARKETING LEFT (50-55%), LOGIN CARD RIGHT (40-45%) ─── */}
        <div className="my-auto py-4 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

          {/* ════════════ LEFT ZONE: BRANDING, HEADLINE & FEATURE HIGHLIGHTS ════════════ */}
          <div className="lg:col-span-7 xl:col-span-7 space-y-6 sm:space-y-8 pr-0 lg:pr-8 text-white order-2 lg:order-1">
            
            {/* Eyebrow Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/15 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#4B95EB]" />
              <span className="text-xs font-bold tracking-widest text-slate-200 uppercase">
                Preserve Expertise • Power Precision
              </span>
            </div>

            {/* Main Headline */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold text-white tracking-tight leading-[1.12] drop-shadow-md">
                Smarter Knowledge <br />
                <span className="text-[#4B95EB]">for Better Diagnostics</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed max-w-xl font-normal drop-shadow-sm">
                Capture critical knowledge, standardize laboratory procedures, and empower every expert and trainee with reliable operational guidance.
              </p>
            </div>

            {/* Compact Feature Highlights (Unobtrusive glass pill treatments) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 max-w-xl">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/15 shadow-sm hover:bg-slate-900/70 transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#1473E6]/25 border border-[#1473E6]/40 flex items-center justify-center text-[#4B95EB] shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Knowledge Capture</span>
                  <span className="text-[11px] text-slate-300 block">Preserve expert procedures</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/15 shadow-sm hover:bg-slate-900/70 transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#1473E6]/25 border border-[#1473E6]/40 flex items-center justify-center text-[#4B95EB] shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Safety &amp; Compliance</span>
                  <span className="text-[11px] text-slate-300 block">Reduce operational risks</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/15 shadow-sm hover:bg-slate-900/70 transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#1473E6]/25 border border-[#1473E6]/40 flex items-center justify-center text-[#4B95EB] shrink-0">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Operational Excellence</span>
                  <span className="text-[11px] text-slate-300 block">Make verified SOPs accessible</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/15 shadow-sm hover:bg-slate-900/70 transition-all">
                <div className="w-9 h-9 rounded-xl bg-[#1473E6]/25 border border-[#1473E6]/40 flex items-center justify-center text-[#4B95EB] shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Guided Training</span>
                  <span className="text-[11px] text-slate-300 block">Help trainees master workflows</span>
                </div>
              </div>
            </div>

            {/* Bottom Trust Badge */}
            <div className="pt-2">
              <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/15 text-slate-200 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-[#4B95EB] shrink-0" />
                <span className="text-xs font-medium">
                  Trusted by leading medical diagnostics &amp; life sciences teams
                </span>
                <Microscope className="w-4 h-4 text-[#4B95EB]/50 ml-2 hidden sm:block" />
              </div>
            </div>

          </div>

                    {/* ════════════ RIGHT ZONE: INDEPENDENT FOREGROUND LOGIN CARD ════════════ */}
          <div className="lg:col-span-5 xl:col-span-5 w-full flex justify-center lg:justify-end order-1 lg:order-2">
            <div className="w-full max-w-[460px] bg-white/95 backdrop-blur-md rounded-3xl border border-[#DCE8F5] shadow-[0_25px_60px_-15px_rgba(10,25,47,0.35)] p-6 sm:p-7 space-y-4.5 transition-all">
              
              {/* Card Header with Logo */}
              <div className="text-left space-y-1.5 pb-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center text-[#1473E6]">
                    <Activity className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#1473E6] uppercase tracking-wider">
                    Enterprise Portal
                  </span>
                </div>

                <h2 className="text-2xl font-extrabold text-[#12345A] tracking-tight">
                  Welcome Back
                </h2>
                <p className="text-xs text-[#536780]">
                  Sign in to Gurukul AI to access your knowledge workspace
                </p>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-semibold block">Authentication Error</span>
                    <span>{errorMessage}</span>
                  </div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Email Address */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-semibold text-[#12345A] mb-1.5"
                  >
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="w-full bg-white border border-[#DCE8F5] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/15 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-[#12345A] placeholder:text-[#94A3B8] outline-none transition-all duration-150 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-[#12345A] mb-1.5"
                  >
                    Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="w-full bg-white border border-[#DCE8F5] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/15 rounded-xl pl-10 pr-10 py-2.5 text-sm text-[#12345A] placeholder:text-[#94A3B8] outline-none transition-all duration-150 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#94A3B8] hover:text-[#12345A] transition-colors focus:outline-none"
                      aria-label="Toggle visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Sign In Button */}
                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1473E6] hover:bg-[#1060C4] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-[#1473E6]/25 hover:shadow-lg transition-all duration-150 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing In…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center justify-center pt-1">
                <div className="w-full border-t border-[#E2E8F0]" />
                <span className="absolute bg-white px-3 text-[10px] font-bold tracking-wider text-[#94A3B8] uppercase">
                  OR
                </span>
              </div>

              {/* ─── DEMO SEED CREDENTIALS (PRE-CONFIGURED) ─── */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block text-left">
                  Demo Seed Credentials (Pre-configured)
                </span>
                
                <div className="space-y-1.5">
                  {/* Expert Author: Aarav Sharma */}
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('expert.a', 'expert.a@demo.local', 'ExpertA@Gurukul2026!')}
                    className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all ${
                      selectedRole === 'expert.a'
                        ? 'bg-[#EFF7FF] border-[#1473E6] ring-1 ring-[#1473E6]/30 shadow-xs'
                        : 'bg-white hover:bg-[#F8FAFC] border-[#E2E8F0] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-[#12345A] block leading-snug">
                          Aarav Sharma
                        </span>
                        <span className="text-[10px] text-[#64748B] block truncate">
                          expert.a@demo.local
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-tight">
                      Expert Author
                    </span>
                  </button>

                  {/* Lead Reviewer: Bhavna Patel */}
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('expert.b', 'expert.b@demo.local', 'ExpertB@Gurukul2026!')}
                    className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all ${
                      selectedRole === 'expert.b'
                        ? 'bg-[#EFF7FF] border-[#1473E6] ring-1 ring-[#1473E6]/30 shadow-xs'
                        : 'bg-white hover:bg-[#F8FAFC] border-[#E2E8F0] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-[#12345A] block leading-snug">
                          Bhavna Patel
                        </span>
                        <span className="text-[10px] text-[#64748B] block truncate">
                          expert.b@demo.local
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-tight">
                      Lead Reviewer
                    </span>
                  </button>

                  {/* Trainee: Devendra Verma */}
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('trainee', 'trainee@demo.local', 'Trainee@Gurukul2026!')}
                    className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all ${
                      selectedRole === 'trainee'
                        ? 'bg-[#EFF7FF] border-[#1473E6] ring-1 ring-[#1473E6]/30 shadow-xs'
                        : 'bg-white hover:bg-[#F8FAFC] border-[#E2E8F0] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-blue-500/10 text-[#1473E6] flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-[#12345A] block leading-snug">
                          Devendra Verma
                        </span>
                        <span className="text-[10px] text-[#64748B] block truncate">
                          trainee@demo.local
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-tight">
                      Trainee
                    </span>
                  </button>
                </div>
              </div>

              {/* Registration Link */}
              <div className="pt-1.5 text-center text-xs text-[#64748B]">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  className="text-[#1473E6] hover:text-[#1060C4] font-semibold underline underline-offset-4 transition-colors"
                >
                  Register as Trainee
                </Link>
              </div>

            </div>
          </div>

        </div>

        {/* Footer info (Desktop) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400 pt-6 border-t border-white/10">
          <span>&copy; {new Date().getFullYear()} Gurukul AI. Enterprise Medical Knowledge Platform.</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Secure Server-Managed Sessions • HttpOnly Cookies &amp; RBAC</span>
          </span>
        </div>
      </div>
    </div>
  );
};

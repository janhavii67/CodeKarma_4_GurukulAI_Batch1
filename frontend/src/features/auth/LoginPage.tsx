import React, { useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  User,
  Loader2,
  AlertTriangle,
  ShieldCheck,
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
        className="fixed inset-0 w-full h-[100dvh] z-0 overflow-hidden pointer-events-none select-none"
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

        {/* Layered cinematic overlays:
            - Left-side dark navy gradient for high contrast readability of headline
            - Restrained center-to-right gradient to frame the card without burying the medical lab video
            - Subtle radial ambient glow on top-left
            - Smooth top and bottom vignettes */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#07172B]/90 via-[#07172B]/50 to-[#07172B]/55" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07172B]/60 via-transparent to-[#07172B]/75" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(76,154,255,0.12),_transparent_65%)]" />
      </div>

      {/* ─── FOREGROUND CONTENT LAYER ─── */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 py-4 sm:py-6 min-h-screen min-h-[100dvh] flex flex-col justify-between">
        
        {/* Top Header Branding */}
        <header className="flex items-center justify-between pb-2 sm:pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1677F2] to-[#4C9AFF] flex items-center justify-center text-white shadow-lg shadow-[#1677F2]/25 ring-1 ring-white/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" fillOpacity="0.4" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-white block leading-none">
                Gurukul AI
              </span>
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#C7D4E4] block mt-1 uppercase">
                Medical &amp; Industrial Knowledge Engine
              </span>
            </div>
          </div>

          {/* Clinical status indicator */}
          <div className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#07172B]/70 backdrop-blur-md border border-white/10 text-xs font-medium text-[#C7D4E4] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Diagnostics Laboratory Platform</span>
          </div>
        </header>

        {/* ─── TWO-ZONE MAIN COMPOSITION: HERO LEFT (55-60%), LOGIN CARD RIGHT (40-45%) ─── */}
        <main className="my-auto py-2 sm:py-4 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-16 items-center">

          {/* ════════════ LEFT ZONE: BRANDING & EDITORIAL HEADLINE ════════════ */}
          <section className="lg:col-span-7 xl:col-span-7 space-y-6 sm:space-y-8 pr-0 lg:pr-6 text-white order-2 lg:order-1">
            
            {/* Eyebrow Label */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0B2342]/80 backdrop-blur-md border border-[#4C9AFF]/30 text-xs font-medium tracking-wide text-[#C7D4E4] animate-hero-fade"
              style={{ animationDelay: '0ms' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#4C9AFF]" />
              <span>The Gurukul for modern labs</span>
            </div>

            {/* Main Headline & Subtitle */}
            <div className="space-y-4">
              <h1
                className="text-4xl sm:text-5xl lg:text-[3.25rem] xl:text-[3.75rem] font-extrabold text-white tracking-tight leading-[1.08] animate-hero-fade"
                style={{ animationDelay: '100ms' }}
              >
                <span className="block text-white drop-shadow-md">
                  Every Expert Retires.
                </span>
                <span className="block mt-1 bg-gradient-to-r from-[#4C9AFF] via-[#60A5FA] to-[#93C5FD] bg-clip-text text-transparent drop-shadow-sm">
                  Their Expertise Shouldn’t.
                </span>
              </h1>
              <p
                className="text-base sm:text-lg text-[#C7D4E4] leading-relaxed max-w-xl font-normal drop-shadow-sm pt-2 animate-hero-fade"
                style={{ animationDelay: '200ms' }}
              >
                Gurukul AI captures what your best people know and turns it into verified, searchable guidance for the next generation.
              </p>
            </div>

          </section>

          {/* ════════════ RIGHT ZONE: PREMIUM FOREGROUND LOGIN CARD ════════════ */}
          <section className="lg:col-span-5 xl:col-span-5 w-full flex justify-center lg:justify-end order-1 lg:order-2">
            <div className="w-full max-w-[440px] bg-white rounded-3xl border border-[#DCE7F5] shadow-[0_20px_50px_-12px_rgba(7,23,43,0.35),0_0_0_1px_rgba(220,231,245,0.7)] p-6 sm:p-7 space-y-4.5 transition-all">
              
              {/* Card Header with Portal Tag */}
              <div className="text-left space-y-1 pb-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-lg bg-[#EDF4FF] border border-[#DCE7F5] flex items-center justify-center text-[#1677F2]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-bold text-[#1677F2] uppercase tracking-wider">
                    Enterprise Portal
                  </span>
                </div>

                <h2 className="text-2xl font-extrabold text-[#07172B] tracking-tight">
                  Welcome Back
                </h2>
                <p className="text-xs text-[#526985]">
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
                    className="block text-xs font-semibold text-[#07172B] mb-1.5"
                  >
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526985]/70">
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
                      className="w-full bg-[#EDF4FF] border border-[#DCE7F5] focus:bg-white focus:border-[#1677F2] focus:ring-2 focus:ring-[#1677F2]/15 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-[#07172B] placeholder:text-[#526985]/50 outline-none transition-all duration-150 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-[#07172B] mb-1.5"
                  >
                    Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526985]/70">
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
                      className="w-full bg-[#EDF4FF] border border-[#DCE7F5] focus:bg-white focus:border-[#1677F2] focus:ring-2 focus:ring-[#1677F2]/15 rounded-xl pl-10 pr-10 py-2.5 text-sm text-[#07172B] placeholder:text-[#526985]/50 outline-none transition-all duration-150 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#526985]/70 hover:text-[#07172B] transition-colors focus:outline-none"
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
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1677F2] hover:bg-[#1060C4] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-[#1677F2]/25 hover:shadow-lg transition-all duration-150 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
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
                <div className="w-full border-t border-[#DCE7F5]" />
                <span className="absolute bg-white px-3 text-[10px] font-bold tracking-wider text-[#526985] uppercase">
                  OR
                </span>
              </div>

              {/* ─── DEMO SEED CREDENTIALS (PRE-CONFIGURED) ─── */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#526985] block text-left">
                  Demo Seed Credentials (Pre-configured)
                </span>
                
                <div className="space-y-1.5">
                  {/* Expert Author: Aarav Sharma */}
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('expert.a', 'expert.a@demo.local', 'ExpertA@Gurukul2026!')}
                    className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all ${
                      selectedRole === 'expert.a'
                        ? 'bg-[#EDF4FF] border-[#1677F2] ring-1 ring-[#1677F2]/30 shadow-xs'
                        : 'bg-[#F7FAFF] hover:bg-white border-[#DCE7F5] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-[#07172B] block leading-snug">
                          Aarav Sharma
                        </span>
                        <span className="text-[10px] text-[#526985] block truncate">
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
                        ? 'bg-[#EDF4FF] border-[#1677F2] ring-1 ring-[#1677F2]/30 shadow-xs'
                        : 'bg-[#F7FAFF] hover:bg-white border-[#DCE7F5] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-[#07172B] block leading-snug">
                          Bhavna Patel
                        </span>
                        <span className="text-[10px] text-[#526985] block truncate">
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
                        ? 'bg-[#EDF4FF] border-[#1677F2] ring-1 ring-[#1677F2]/30 shadow-xs'
                        : 'bg-[#F7FAFF] hover:bg-white border-[#DCE7F5] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-blue-500/10 text-[#1677F2] flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-[#07172B] block leading-snug">
                          Devendra Verma
                        </span>
                        <span className="text-[10px] text-[#526985] block truncate">
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
              <div className="pt-1.5 text-center text-xs text-[#526985]">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  className="text-[#1677F2] hover:text-[#1060C4] font-semibold underline underline-offset-4 transition-colors"
                >
                  Register as Trainee
                </Link>
              </div>

            </div>
          </section>

        </main>

        {/* Footer info (Desktop & Mobile) */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#C7D4E4]/80 pt-6 pb-2 border-t border-white/10">
          <span>&copy; {new Date().getFullYear()} Gurukul AI. Enterprise Medical Knowledge Platform.</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Secure Server-Managed Sessions • HttpOnly Cookies &amp; RBAC</span>
          </span>
        </footer>
      </div>
    </div>
  );
};

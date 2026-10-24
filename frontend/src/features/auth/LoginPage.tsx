import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Factory, Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleQuickLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-screen bg-steel-950 flex flex-col justify-center items-center p-4 industrial-grid relative">
      <div className="absolute top-6 left-6 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
          <Factory className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-base tracking-wide text-slate-100">GURUKUL AI</span>
          <span className="text-[10px] block font-mono text-slate-400">Industrial Knowledge Engine</span>
        </div>
      </div>

      <div className="w-full max-w-md space-y-6">
        <Card className="border-slate-800 shadow-2xl bg-slate-900/80">
          <div className="text-center pb-4 border-b border-slate-800">
            <Badge variant="brand" size="sm" className="mb-2">
              Phase 1 · Foundation Authentication
            </Badge>
            <h2 className="text-xl font-bold text-slate-100">Sign in to Gurukul AI</h2>
            <p className="text-xs text-slate-400 mt-1">
              Secure, server-managed sessions with HttpOnly cookies & RBAC
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            {errorMessage && (
              <Alert variant="error" title="Authentication Error">
                {errorMessage}
              </Alert>
            )}

            <Input
              id="login-email"
              name="email"
              type="email"
              label="Email Address"
              autoComplete="email"
              inputMode="email"
              placeholder="worker@factory.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              leftIcon={<Mail className="w-4 h-4" />}
            />

            <Input
              id="login-password"
              name="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              leftIcon={<Lock className="w-4 h-4" />}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Sign In
            </Button>
          </form>

          {/* Seed demo quick-login shortcuts for easy evaluation */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2.5 text-center">
              Demo Seed Credentials (Pre-Configured)
            </span>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('expert.a@demo.local', 'ExpertA@Gurukul2026!')}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left text-xs text-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-400" />
                  <div>
                    <span className="font-semibold text-slate-200">Aarav Sharma</span>
                    <span className="block text-[10px] text-slate-400">expert.a@demo.local</span>
                  </div>
                </div>
                <Badge variant="brand" size="sm">Expert Author</Badge>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('expert.b@demo.local', 'ExpertB@Gurukul2026!')}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left text-xs text-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-slate-200">Bhavna Patel</span>
                    <span className="block text-[10px] text-slate-400">expert.b@demo.local</span>
                  </div>
                </div>
                <Badge variant="success" size="sm">Lead Reviewer</Badge>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('trainee@demo.local', 'Trainee@Gurukul2026!')}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left text-xs text-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="font-semibold text-slate-200">Devendra Verma</span>
                    <span className="block text-[10px] text-slate-400">trainee@demo.local</span>
                  </div>
                </div>
                <Badge variant="info" size="sm">Trainee</Badge>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 text-center text-xs text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold underline underline-offset-4">
              Register as Trainee
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

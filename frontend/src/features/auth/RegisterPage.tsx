import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Factory, Lock, Mail, User as UserIcon, ShieldAlert } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/app', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      setErrorMessage('Password must contain at least one letter and one number.');
      return;
    }

    setIsLoading(true);

    try {
      await register(email, name, password);
      navigate('/app', { replace: true });
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col justify-center items-center p-4 relative">
      <div className="absolute top-6 left-6 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
          <Factory className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-base tracking-wide text-[#17324D]">GURUKUL AI</span>
          <span className="text-[10px] block font-mono text-[#5D7188]">Industrial Knowledge Engine</span>
        </div>
      </div>

      <div className="w-full max-w-md space-y-6">
        <Card className="border-[#DCE6F0] shadow-sm bg-white">
          <div className="text-center pb-4 border-b border-[#DCE6F0]">
            <Badge variant="info" size="sm" className="mb-2">
              Trainee Self-Registration
            </Badge>
            <h2 className="text-xl font-bold text-[#17324D]">Create Trainee Account</h2>
            <p className="text-xs text-[#5D7188] mt-1">
              Join the factory floor training and procedures portal
            </p>
          </div>

          <div className="pt-3">
            <div className="flex items-start gap-2 p-2.5 rounded bg-[#F3F8FE] border border-[#DCE6F0] text-[11px] text-[#17324D] mb-4">
              <ShieldAlert className="w-4 h-4 text-[#1976D2] shrink-0 mt-0.5" />
              <span>
                <strong>Role Invariant:</strong> Self-registration strictly creates <code>TRAINEE</code> accounts.
                Expert and Lead Reviewer roles are provisioned by factory administrators.
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <Alert variant="error" title="Registration Error">
                  {errorMessage}
                </Alert>
              )}

              <Input
                id="register-name"
                name="name"
                type="text"
                label="Full Name"
                autoComplete="name"
                placeholder="Ramesh Gupta"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                leftIcon={<UserIcon className="w-4 h-4" />}
              />

              <Input
                id="register-email"
                name="email"
                type="email"
                label="Email Address"
                autoComplete="email"
                inputMode="email"
                placeholder="ramesh@factory.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                leftIcon={<Mail className="w-4 h-4" />}
              />

              <Input
                id="register-password"
                name="password"
                type="password"
                label="Password"
                autoComplete="new-password"
                placeholder="Min 8 chars with letter & number"
                helperText="Must be at least 8 characters with letters and numbers."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                leftIcon={<Lock className="w-4 h-4" />}
              />

              <Input
                id="register-confirm-password"
                name="confirmPassword"
                type="password"
                label="Confirm Password"
                autoComplete="new-password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                Create Account
              </Button>
            </form>
          </div>

          <div className="mt-5 pt-3 border-t border-[#DCE6F0] text-center text-xs text-[#5D7188]">
            Already have an account?{' '}
            <Link to="/login" className="text-[#1976D2] hover:text-[#1677F2] font-semibold underline underline-offset-4">
              Sign In
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

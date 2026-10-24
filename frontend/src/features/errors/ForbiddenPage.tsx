import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const ForbiddenPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-6 shadow-lg shadow-rose-500/10">
        <ShieldAlert className="w-8 h-8" />
      </div>

      <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold mb-3">
        HTTP 403 · Access Denied
      </span>

      <h1 className="text-2xl font-bold text-slate-100 mb-2">Insufficient Permissions</h1>

      <p className="text-xs text-slate-400 leading-relaxed mb-6">
        Your current user role or permission set does not permit access to this industrial resource.
        Certain actions require <code>EXPERT</code> authority or specific custom overrides (e.g. <code>knowledge.approve</code>).
      </p>

      <div className="flex gap-3">
        <Link to="/app">
          <Button variant="primary" size="md" icon={<ArrowLeft className="w-4 h-4" />}>
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};

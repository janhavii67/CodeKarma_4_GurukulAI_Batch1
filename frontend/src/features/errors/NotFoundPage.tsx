import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Compass, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-steel-950 flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-6 shadow-inner">
        <Compass className="w-8 h-8 text-brand-400" />
      </div>

      <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold mb-3">
        HTTP 404 · Not Found
      </span>

      <h1 className="text-2xl font-bold text-slate-100 mb-2">Resource Does Not Exist</h1>

      <p className="text-xs text-slate-400 leading-relaxed mb-6">
        The page or manufacturing resource you requested could not be located on the Gurukul AI gateway.
      </p>

      <div className="flex gap-3">
        <Link to="/app">
          <Button variant="primary" size="md" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Application
          </Button>
        </Link>
      </div>
    </div>
  );
};

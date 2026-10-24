import React from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

export interface AlertProps {
  variant?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  className = '',
}) => {
  const configs = {
    info: {
      border: 'border-sky-500/30 bg-sky-950/30 text-sky-200',
      icon: <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />,
      titleColor: 'text-sky-300',
    },
    warning: {
      border: 'border-amber-500/30 bg-amber-950/30 text-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
      titleColor: 'text-amber-300',
    },
    error: {
      border: 'border-rose-500/30 bg-rose-950/30 text-rose-200',
      icon: <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
      titleColor: 'text-rose-300',
    },
    success: {
      border: 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200',
      icon: <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
      titleColor: 'text-emerald-300',
    },
  }[variant];

  return (
    <div
      role="alert"
      className={`rounded-lg border p-4 flex gap-3 text-sm backdrop-blur-sm ${configs.border} ${className}`}
    >
      {configs.icon}
      <div className="space-y-1">
        {title && <h5 className={`font-semibold ${configs.titleColor}`}>{title}</h5>}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
};

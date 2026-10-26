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
      border: 'border-[#BCD7F5] bg-[#EAF3FF] text-[#124A78]',
      icon: <Info className="w-5 h-5 text-[#1976D2] shrink-0 mt-0.5" />,
      titleColor: 'text-[#124A78]',
    },
    warning: {
      border: 'border-amber-200 bg-amber-50 text-amber-900',
      icon: <AlertTriangle className="w-5 h-5 text-[#D98B13] shrink-0 mt-0.5" />,
      titleColor: 'text-amber-900',
    },
    error: {
      border: 'border-rose-200 bg-rose-50 text-rose-900',
      icon: <XCircle className="w-5 h-5 text-[#D94848] shrink-0 mt-0.5" />,
      titleColor: 'text-rose-900',
    },
    success: {
      border: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      icon: <CheckCircle className="w-5 h-5 text-[#15966A] shrink-0 mt-0.5" />,
      titleColor: 'text-emerald-900',
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

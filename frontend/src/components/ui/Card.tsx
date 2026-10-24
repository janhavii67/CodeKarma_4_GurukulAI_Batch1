import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  header,
  footer,
  title,
  subtitle,
  badge,
  interactive = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`
        rounded-xl bg-slate-900/70 border border-slate-800/80 shadow-lg shadow-black/20
        backdrop-blur-md overflow-hidden flex flex-col
        ${interactive ? 'hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5' : ''}
        ${className}
      `}
      {...props}
    >
      {(header || title) && (
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
          {header ? (
            header
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">{title}</h3>
                {badge}
              </div>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          )}
        </div>
      )}

      <div className="p-5 flex-1">{children}</div>

      {footer && (
        <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
          {footer}
        </div>
      )}
    </div>
  );
};

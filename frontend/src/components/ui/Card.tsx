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
        rounded-xl bg-white border border-[#DCE6F0] shadow-sm
        overflow-hidden flex flex-col
        ${interactive ? 'hover:border-[#1976D2]/50 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5' : ''}
        ${className}
      `}
      {...props}
    >
      {(header || title) && (
        <div className="px-5 py-4 border-b border-[#E8EEF5] flex items-center justify-between gap-3">
          {header ? (
            header
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[#17324D]">{title}</h3>
                {badge}
              </div>
              {subtitle && <p className="text-xs text-[#5D7188] mt-0.5">{subtitle}</p>}
            </div>
          )}
        </div>
      )}

      <div className="p-5 flex-1">{children}</div>

      {footer && (
        <div className="px-5 py-3 border-t border-[#E8EEF5] bg-[#F3F8FE]/60 flex items-center justify-between text-xs text-[#5D7188]">
          {footer}
        </div>
      )}
    </div>
  );
};

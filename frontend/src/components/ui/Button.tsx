import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-2.5 text-base gap-2.5',
  }[size];

  const variantStyles = {
    primary:
      'bg-[#1976D2] hover:bg-[#1565C0] text-white font-semibold shadow-sm focus:ring-[#1976D2]/40 border border-[#1976D2]',
    secondary:
      'bg-white hover:bg-[#F3F8FE] text-[#17324D] border border-[#DCE6F0] hover:border-[#1976D2]/50 focus:ring-[#1976D2]/20 shadow-xs',
    outline:
      'bg-transparent hover:bg-[#EAF3FF] text-[#1976D2] border border-[#DCE6F0] hover:border-[#1976D2] focus:ring-[#1976D2]/20',
    danger:
      'bg-[#D94848] hover:bg-[#C23939] text-white shadow-xs focus:ring-[#D94848]/30 border border-[#D94848]',
    ghost:
      'bg-transparent hover:bg-[#EAF3FF] text-[#5D7188] hover:text-[#17324D] focus:ring-[#1976D2]/20',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>Processing...</span>
        </>
      ) : (
        <>
          {icon && <span className="inline-flex shrink-0">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};

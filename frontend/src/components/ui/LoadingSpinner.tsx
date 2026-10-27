import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center gap-3 p-4 ${className}`}>
      <div className={`relative ${sizeMap}`}>
        <div className="absolute inset-0 rounded-full border-2 border-[#DCE6F0]" />
        <div className="absolute inset-0 rounded-full border-2 border-[#1976D2] border-t-transparent animate-spin" />
      </div>
      {message && <p className="text-xs text-[#5D7188] font-medium tracking-wide animate-pulse">{message}</p>}
    </div>
  );
};

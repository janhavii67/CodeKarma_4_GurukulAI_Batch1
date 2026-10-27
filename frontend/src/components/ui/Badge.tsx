import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'brand',
  size = 'md',
  dot = false,
  className = '',
}) => {
  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5 font-medium tracking-wide',
    md: 'text-xs px-2.5 py-1 font-semibold tracking-wide',
  }[size];

  const variantStyles = {
    brand: 'bg-[#EAF3FF] text-[#1976D2] border border-[#BCD7F5]',
    success: 'bg-emerald-50 text-[#15966A] border border-emerald-200',
    warning: 'bg-amber-50 text-[#D98B13] border border-amber-200',
    danger: 'bg-rose-50 text-[#D94848] border border-rose-200',
    info: 'bg-[#EAF3FF] text-[#1976D2] border border-[#BCD7F5]',
    neutral: 'bg-[#F3F8FE] text-[#5D7188] border border-[#DCE6F0]',
  }[variant];

  const dotColors = {
    brand: 'bg-[#1976D2]',
    success: 'bg-[#15966A]',
    warning: 'bg-[#D98B13]',
    danger: 'bg-[#D94848]',
    info: 'bg-[#1976D2]',
    neutral: 'bg-[#7C8DA1]',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full select-none uppercase ${sizeStyles} ${variantStyles} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors} animate-pulse`} />}
      {children}
    </span>
  );
};

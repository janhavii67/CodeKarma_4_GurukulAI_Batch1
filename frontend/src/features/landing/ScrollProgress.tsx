import React, { useEffect, useRef } from 'react';

export const ScrollProgress: React.FC = () => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const el = barRef.current;
      if (!el) return;
      const scrolled = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      el.style.width = total > 0 ? `${(scrolled / total) * 100}%` : '0%';
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-[200] bg-transparent">
      <div ref={barRef} className="h-full bg-gradient-to-r from-brand-500 to-cyan-500 transition-none" style={{ width: '0%' }} />
    </div>
  );
};


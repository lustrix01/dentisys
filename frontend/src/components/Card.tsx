import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  glow?: 'clinical' | 'accent' | 'warning' | 'error' | 'success' | 'none';
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hoverEffect = false,
  glow = 'none',
  onClick,
}) => {
  const glowClasses = {
    clinical: 'shadow-md border-clinical-300/30 dark:border-clinical-700/20 hover:shadow-clinical-500/10 hover:border-clinical-500/30',
    accent: 'shadow-md border-accent-300/30 dark:border-accent-700/20 hover:shadow-accent-500/10 hover:border-accent-500/30',
    warning: 'shadow-md border-amber-300/40 dark:border-amber-700/20 hover:shadow-amber-500/10 hover:border-amber-500/35',
    error: 'shadow-md border-rose-300/40 dark:border-rose-700/20 hover:shadow-rose-500/10 hover:border-rose-500/35',
    success: 'shadow-md border-emerald-300/40 dark:border-emerald-700/20 hover:shadow-emerald-500/10 hover:border-emerald-500/35',
    none: 'shadow-sm border-slate-200/60 dark:border-slate-800/40',
  };

  const interactiveClasses = onClick || hoverEffect 
    ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 ease-out' 
    : 'transition-colors duration-300';

  return (
    <div
      onClick={onClick}
      className={`glass rounded-2xl p-6 border ${glowClasses[glow]} ${interactiveClasses} ${className}`}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>;

export const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <h3 className={`text-lg font-semibold font-heading tracking-tight text-slate-800 dark:text-slate-100 ${className}`}>{children}</h3>;

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`${className}`}>{children}</div>;

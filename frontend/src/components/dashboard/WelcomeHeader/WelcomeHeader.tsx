import React from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { Card } from '../../Card';

export const WelcomeHeader: React.FC = () => {
  const { user } = useAuth();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const formattedDate = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (!user) return null;

  return (
    <Card className="flex items-center gap-4 p-6">
      <div className="w-12 h-12 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center font-bold text-lg">
        {user.name.charAt(0)}
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          {greeting}, {user.name}
        </h2>
        <p className="text-sm text-slate-500">{user.role}</p>
        <p className="text-xs text-slate-400 mt-1">{formattedDate}</p>
      </div>
    </Card>
  );
};

export default WelcomeHeader;

import React, { useState } from 'react';
import { Search, UserPlus, Shield, User, GraduationCap, Edit, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';

interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'faculty' | 'secretary';
  status: 'active' | 'inactive';
  lastActive: string;
}

export const UserManagement: React.FC = () => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserAccount[]>([
    { id: '1', name: 'Dr. Eleanor Vance', email: 'faculty@bicol-u.edu.ph', role: 'faculty', status: 'active', lastActive: '2026-07-04 18:34' },
    { id: '2', name: 'Dr. Marcus Aurelius', email: 'admin@bicol-u.edu.ph', role: 'admin', status: 'active', lastActive: '2026-07-04 21:12' },
    { id: '3', name: 'Miss Clara Oswald', email: 'secretary@bicol-u.edu.ph', role: 'secretary', status: 'active', lastActive: '2026-07-04 20:45' },
    { id: '4', name: 'Dr. Sarah Ramos', email: 'sarah.ramos@dentisys.edu', role: 'faculty', status: 'active', lastActive: '2026-07-03 14:10' },
    { id: '5', name: 'Dr. Claire Lopez', email: 'claire.lopez@dentisys.edu', role: 'faculty', status: 'inactive', lastActive: '2026-06-28 09:15' },
  ]);

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(search.toLowerCase()) || 
    user.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStatus = (id: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u));
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-3.5 h-3.5 text-violet-500" />;
      case 'faculty': return <GraduationCap className="w-3.5 h-3.5 text-emerald-500" />;
      case 'secretary': return <User className="w-3.5 h-3.5 text-clinical-500" />;
      default: return <User className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">User Account Management</h1>
          <p className="text-xs text-slate-400">View and coordinate system roles, password states, and portal privileges.</p>
        </div>
        <button
          onClick={() => alert('Add User functionality will be wired to backend.')}
          className="flex items-center gap-1.5 px-4 py-2 bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer mt-2 sm:mt-0"
        >
          <UserPlus className="w-4 h-4" />
          Add Account
        </button>
      </div>

      {/* Control Card */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <CardTitle>Registered System Users</CardTitle>
          <div className="relative w-full md:w-80">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search user by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/60 dark:border-slate-800 pb-3 text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">User Details</th>
                <th className="py-3 px-4">Role Type</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150/40 dark:divide-slate-850">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">{user.name}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{user.email}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-750 dark:text-slate-300">
                      {getRoleIcon(user.role)}
                      <span className="capitalize">{user.role}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <button
                      onClick={() => toggleStatus(user.id)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer border ${
                        user.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                      }`}
                    >
                      {user.status}
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                    {user.lastActive}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => alert(`Editing profile of ${user.name}`)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 rounded-md cursor-pointer transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => alert(`Deleting account of ${user.name}`)}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 rounded-md cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

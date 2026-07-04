import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, RefreshCw, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';

interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  component: string;
  severity: 'info' | 'warning' | 'security';
}

export const SystemAudit: React.FC = () => {
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([
    { id: '1', timestamp: '2026-07-04 21:12:05', user: 'admin@bicol-u.edu.ph', action: 'User logged in (dr. Marcus Aurelius)', component: 'AuthService', severity: 'info' },
    { id: '2', timestamp: '2026-07-04 20:54:12', user: 'secretary@bicol-u.edu.ph', action: 'Created new attendance log for CLIN401', component: 'AttendanceService', severity: 'info' },
    { id: '3', timestamp: '2026-07-04 19:22:40', user: 'faculty@bicol-u.edu.ph', action: 'Modified student grades (CLIN402)', component: 'GradeService', severity: 'warning' },
    { id: '4', timestamp: '2026-07-04 18:05:00', user: 'admin@bicol-u.edu.ph', action: 'Backup schedule altered', component: 'BackupScheduler', severity: 'warning' },
    { id: '5', timestamp: '2026-07-04 14:12:35', user: 'guest_10.20.12.54', action: 'Failed login attempt (invalid credentials)', component: 'AuthService', severity: 'security' },
    { id: '6', timestamp: '2026-07-04 11:30:10', user: 'faculty@bicol-u.edu.ph', action: 'Uploaded remedial exam marks for DENT-2022-0051', component: 'GradeService', severity: 'info' },
  ]);

  const filteredLogs = logs.filter(log => 
    log.user.toLowerCase().includes(search.toLowerCase()) || 
    log.action.toLowerCase().includes(search.toLowerCase()) ||
    log.component.toLowerCase().includes(search.toLowerCase())
  );

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'security':
        return <span className="px-2 py-0.5 border border-rose-500/20 text-rose-600 bg-rose-500/10 text-[9px] font-bold uppercase rounded-md">Security</span>;
      case 'warning':
        return <span className="px-2 py-0.5 border border-amber-500/20 text-amber-600 bg-amber-500/10 text-[9px] font-bold uppercase rounded-md">Warning</span>;
      default:
        return <span className="px-2 py-0.5 border border-blue-500/20 text-blue-600 bg-blue-500/10 text-[9px] font-bold uppercase rounded-md">Info</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">System Audit Trail</h1>
          <p className="text-xs text-slate-400">Audit system events, grade modifications, security breaches, and admin configurations.</p>
        </div>
        <button
          onClick={() => alert('Log export initialized.')}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-350 font-bold text-xs rounded-xl transition-all cursor-pointer mt-2 sm:mt-0"
        >
          <FileText className="w-4 h-4" />
          Export Audit Trail
        </button>
      </div>

      {/* Control Board */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <CardTitle>System Activity Logs</CardTitle>
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <div className="relative w-full md:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search audit actions, users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <button 
              onClick={() => alert('Logs reloaded.')}
              className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-white rounded-xl cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/60 dark:border-slate-800 pb-3 text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Event Timestamp</th>
                <th className="py-3 px-4">Trigger User</th>
                <th className="py-3 px-4">Action details</th>
                <th className="py-3 px-4">Component</th>
                <th className="py-3 px-4 text-center">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150/40 dark:divide-slate-850">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-slate-550 dark:text-slate-400">
                    {log.timestamp}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-350">
                    {log.user}
                  </td>
                  <td className="py-3.5 px-4 text-slate-800 dark:text-slate-200">
                    {log.action}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-semibold">
                    {log.component}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {getSeverityBadge(log.severity)}
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

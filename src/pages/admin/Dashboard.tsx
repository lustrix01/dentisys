import React, { useState } from 'react';
import { Shield, Users, Server, Database, Activity, RefreshCw, Key } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';

export const Dashboard: React.FC = () => {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const trafficData = [
    { name: 'Mon', requests: 1200 },
    { name: 'Tue', requests: 1900 },
    { name: 'Wed', requests: 1500 },
    { name: 'Thu', requests: 2100 },
    { name: 'Fri', requests: 2400 },
    { name: 'Sat', requests: 800 },
    { name: 'Sun', requests: 950 },
  ];

  const handleBackup = () => {
    setIsBackingUp(true);
    setTimeout(() => {
      setIsBackingUp(false);
      alert('Database backup completed successfully! Backup archive: dentisys_db_backup_20260704.sql');
    }, 1500);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-650 text-white p-6 rounded-[24px] shadow-lg border border-violet-500/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading tracking-tight">System Admin Console</h1>
          <p className="text-xs text-violet-100 mt-1">Configure root settings, supervise API transactions, and manage security parameters.</p>
        </div>
        <button
          onClick={handleBackup}
          disabled={isBackingUp}
          className="px-4 py-2 bg-white text-indigo-700 font-bold text-xs rounded-xl shadow-md hover:bg-slate-50 transition-all flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
        >
          <Database className="w-3.5 h-3.5" />
          {isBackingUp ? 'Backing up...' : 'Backup Database Now'}
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total User Accounts</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">42</span>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Database Health</span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 block mt-1">100%</span>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
            <Server className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">API Response Time</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">124ms</span>
          </div>
          <div className="p-2 bg-violet-500/10 text-violet-600 rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Active Sessions</span>
            <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 block mt-1">5</span>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg">
            <Shield className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Main Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Traffic Chart */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Activity className="w-5 h-5 text-indigo-500" />
                Weekly Server Traffic (API Requests)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficData}>
                  <defs>
                    <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
                  <XAxis dataKey="name" className="text-slate-400 text-xs font-semibold" />
                  <YAxis className="text-slate-400 text-xs font-semibold" />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      background: 'rgba(255,255,255,0.9)', 
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'
                    }} 
                  />
                  <Area type="monotone" dataKey="requests" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorTraffic)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Column: Quick Settings & Controls */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-violet-500" />
                Administrative Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/40 dark:border-slate-800/40">
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">Maintenance Mode</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Lock public portal access</span>
                </div>
                <button
                  onClick={() => setIsMaintenanceMode(!isMaintenanceMode)}
                  className={`p-1 rounded-full w-10 transition-colors flex ${
                    isMaintenanceMode ? 'bg-indigo-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  } cursor-pointer`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/40 dark:border-slate-800/40">
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">LDAP SSO Sync</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Synchronize LDAP records</span>
                </div>
                <button 
                  onClick={() => alert('SSO sync scheduled successfully.')}
                  className="p-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="pt-2 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">System Uptime</span>
                <span className="text-xs font-extrabold text-slate-600 dark:text-slate-350 block mt-1">14 days, 3 hours, 22 minutes</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

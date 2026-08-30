import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { Card } from '../../components/Card';
import { getAdminDashboardKpisApi } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiData, setApiData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadKpis = () => {
    setLoading(true);
    setError('');
    getAdminDashboardKpisApi()
      .then((res) => {
        setApiData(res);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to connect to backend server.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadKpis();
  }, []);

  const totalStudents = apiData?.kpis?.totalStudents ?? 0;
  const totalFaculty = apiData?.kpis?.totalFaculty ?? 0;
  const goodStanding = apiData?.kpis?.goodStanding ?? 0;
  const atRisk = apiData?.kpis?.atRisk ?? 0;
  const attendanceRate = apiData?.kpis?.attendanceRate ?? 0;

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        Loading administration dashboard data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center space-y-3 max-w-md mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        <button
          type="button"
          onClick={loadKpis}
          className="px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold transition-all shadow-md"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <span className="text-xs font-extrabold text-accent-600 dark:text-accent-400 uppercase tracking-widest block mb-0.5">
            Dean & Administration Portal • Bicol University CDM
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Welcome back, {user?.display_name || 'Dean Maria Santos'}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Oversee university faculty email invitations, student attendance logs, system reports, and activity audit trails.
          </p>
        </div>

        <button
          onClick={() => navigate('/admin/faculty-invite')}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-extrabold text-xs shadow-md shadow-accent-600/20 transition-all cursor-pointer flex-shrink-0"
        >
          <span>Invite Faculty</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Workspace Column (Spans 8) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* 2. Admin Workspace Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
              <div>
                <span className="text-[10px] font-extrabold text-accent-600 dark:text-accent-400 uppercase tracking-widest block">
                  Administration Workspace
                </span>
                <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100 mt-0.5">
                  Faculty Email Invitations & Operations
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg leading-relaxed">
                  Send email invitations to new faculty members, monitor registered accounts, and analyze audit logs.
                </p>
              </div>

              <button
                onClick={() => navigate('/admin/faculty-invite')}
                className="self-start sm:self-center flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-accent-600/20 transition-all cursor-pointer flex-shrink-0"
              >
                <span>Invite Faculty</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Concise Admin Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Faculty</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {totalFaculty}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Students</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {totalStudents}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Good Standing</span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  {goodStanding}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">At Risk</span>
                <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400 block mt-0.5">
                  {atRisk}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Dashboard Overview (4 Metric Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Faculty</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{totalFaculty}</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Students</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{totalStudents}</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">At-Risk Count</span>
              <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 block mt-1">{atRisk}</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Attendance Rate</span>
              <span className="text-2xl font-extrabold text-accent-600 dark:text-accent-400 block mt-1">{attendanceRate}%</span>
            </Card>
          </div>

          {/* 4. Quick Actions Panel */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => navigate('/admin/approvals')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-accent-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-accent-600 dark:text-accent-400 uppercase tracking-wider block">Approvals</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-accent-600 transition-colors">
                  Faculty Approvals
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Review applicant faculty
                </p>
              </button>

              <button
                onClick={() => navigate('/admin/rules')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-purple-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">Governance</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-purple-600 transition-colors">
                  System Rules
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Configure institutional settings
                </p>
              </button>

              <button
                onClick={() => navigate('/admin/audit-trail')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-slate-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Security</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-slate-600 transition-colors">
                  Audit Trail
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Inspect system activity log
                </p>
              </button>

              <button
                onClick={() => navigate('/admin/reports')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-pink-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider block">Analytics</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-pink-600 transition-colors">
                  Reports & Analytics
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  University-wide reports
                </p>
              </button>
            </div>
          </div>

          {/* 5. Search Bar Section */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Search University Accounts & Audit Logs
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Search faculty members, student records, or audit event details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-accent-500 dark:text-slate-100 placeholder-slate-400"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

        </div>

        {/* Right Sidebar Panel (Spans 4) */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* Widget 1: Announcements */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Announcements
              </h3>
              <span className="text-[10px] font-bold text-accent-600 bg-[#EAE5F8] dark:bg-accent-950/60 px-2 py-0.5 rounded-full">
                Dean's Office
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-accent-600 dark:text-accent-400 uppercase tracking-wider">
                  Governance Directive
                </span>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                  Midterm Retention Review Session
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Academic committee review for students under critical retention standing.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                  Faculty Approvals
                </span>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                  New Faculty Applications Pending
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Review applicant credentials under the Faculty Approvals panel.
                </p>
              </div>
            </div>
          </div>

          {/* Widget 2: System Status */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                System Health & Services
              </h3>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                Operational
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100">PostgreSQL Database</h4>
                  <p className="text-[10px] text-slate-400">DentiSys Local Container Engine</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-md">
                  Connected
                </span>
              </div>
            </div>
          </div>

          {/* Widget 3: Recent Activity */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Recent Audit Trail
              </h3>
              <button 
                onClick={() => navigate('/admin/audit-trail')}
                className="text-[10px] font-bold text-accent-600 dark:text-accent-400 hover:underline"
              >
                View Audit
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <p className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                  Verified system security policies & active sessions.
                </p>
                <span className="text-[10px] text-slate-400 block mt-1">Audit Trail • System</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

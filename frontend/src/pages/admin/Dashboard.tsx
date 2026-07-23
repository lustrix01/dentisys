import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  BookOpenCheck,
  CalendarCheck,
  ShieldAlert,
  FileSpreadsheet,
  ClipboardList,
  TrendingUp,
  Activity,
} from 'lucide-react';
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';

import { getAdminDashboardKpisApi } from '../../services/apiClient';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [apiData, setApiData] = React.useState<any>(null);

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

  React.useEffect(() => {
    loadKpis();
  }, []);

  const facultyList = apiData?.facultyList || [];

  // ── KPI calculations ──────────────────────────────────────
  const totalStudents = apiData?.kpis?.totalStudents ?? 0;
  const totalFaculty = apiData?.kpis?.totalFaculty ?? 0;
  const goodStanding = apiData?.kpis?.goodStanding ?? 0;
  const atRisk = apiData?.kpis?.atRisk ?? 0;
  const remedialCount = apiData?.kpis?.remedialCount ?? 0;
  const attendanceRate = apiData?.kpis?.attendanceRate ?? 0;

  // ── GWA Distribution chart ────────────────────────────────
  const gwaBuckets = useMemo(() => {
    if (apiData?.gwaBuckets) return apiData.gwaBuckets;
    const buckets = [
      { range: '1.0–1.5', count: 0, color: '#10B981' },
      { range: '1.5–2.0', count: 0, color: '#34D399' },
      { range: '2.0–2.5', count: 0, color: '#F59E0B' },
      { range: '2.5–3.0', count: 0, color: '#F97316' },
      { range: '3.0+', count: 0, color: '#EF4444' },
    ];
    return buckets;
  }, [apiData]);

  // ── Retention Status Donut ────────────────────────────────
  const pieData = useMemo(() => {
    const counts = apiData?.statusCounts || {
      active: goodStanding,
      warning: 0,
      critical: atRisk,
      remedial: remedialCount,
    };
    return [
      { name: 'Good Standing', value: counts.active || 0, color: '#10B981' },
      { name: 'Warning', value: counts.warning || 0, color: '#F59E0B' },
      { name: 'Critical', value: counts.critical || 0, color: '#EF4444' },
      { name: 'Remedial', value: counts.remedial || 0, color: '#8B5CF6' },
    ].filter(d => d.value > 0);
  }, [apiData, goodStanding, atRisk, remedialCount]);

  // ── Class attendance summary ──────────────────────────────
  const classAttendance = apiData?.classAttendance ?? [];

  const kpis = [
    { label: 'Total Faculty', value: totalFaculty, icon: GraduationCap, color: 'text-accent-600 dark:text-accent-400', bg: 'bg-accent-500/10' },
    { label: 'Total Students', value: totalStudents, icon: Users, color: 'text-accent-600 dark:text-accent-400', bg: 'bg-accent-500/10' },
    { label: 'Good Standing', value: goodStanding, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    { label: 'At Risk', value: atRisk, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/10' },
    { label: 'Under Remedial', value: remedialCount, icon: ShieldAlert, color: 'text-rose-600', bg: 'bg-rose-500/10' },
    { label: 'Attendance Rate', value: `${attendanceRate}%`, icon: CalendarCheck, color: 'text-sky-600', bg: 'bg-sky-500/10' },
  ];

  const quickActions = [
    { label: 'Retention Criteria', desc: 'Define and manage academic retention policies', icon: BookOpenCheck, path: '/admin/retention-criteria', color: 'from-amber-500 to-orange-500' },
    { label: 'Reports & Analytics', desc: 'Generate institutional academic reports', icon: FileSpreadsheet, path: '/admin/reports', color: 'from-clinical-500 to-accent-500' },
  ];

  const recentReports: Array<{ title: string; date: string; type: string }> = [];

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading persisted dashboard data…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          type="button"
          onClick={loadKpis}
          className="px-4 py-2 rounded-xl bg-accent-600 text-white text-xs font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent-500" />
            Dean's Academic Dashboard
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Logged in: <span className="font-bold text-accent-600 dark:text-accent-400">{user?.display_name || 'Dean'}</span> · Office of the Dean
          </p>
        </div>
        <div className="flex gap-2 mt-3 sm:mt-0">
          <button
            onClick={() => navigate('/admin/reports')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold text-xs transition-all shadow-md cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Generate Report
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={loadKpis} className="font-bold underline hover:opacity-80">
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4 flex flex-col gap-2">
            <div className={`w-9 h-9 ${kpi.bg} rounded-xl flex items-center justify-center`}>
              <kpi.icon className={`w-4.5 h-4.5 ${kpi.color}`} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-2xl font-extrabold font-heading mt-0.5 ${kpi.color}`}>{kpi.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Retention threshold banner */}
      <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        Active retention threshold: <span className="font-extrabold ml-1">GWA 2.5</span>
        &nbsp;— students with clinical grades above this threshold are flagged automatically.
        <button onClick={() => navigate('/admin/retention-criteria')} className="ml-auto underline font-bold whitespace-nowrap hover:text-amber-900">
          Manage Criteria →
        </button>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* GWA Distribution Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4.5 h-4.5 text-accent-500" />
              GWA Distribution — All Students
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gwaBuckets} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fontWeight: 600 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: any) => [`${v} students`, 'Count']}
                  contentStyle={{ borderRadius: '12px', fontSize: '11px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {gwaBuckets.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Retention Status Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="w-4.5 h-4.5 text-amber-500" />
              Retention Standing
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3}>
                    {pieData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v} students`, '']} contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick Actions */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Access</h3>
          {quickActions.map(qa => (
            <button
              key={qa.path}
              onClick={() => navigate(qa.path)}
              className={`w-full text-left p-4 rounded-2xl bg-gradient-to-r ${qa.color} text-white shadow-md hover:shadow-lg transition-all hover:scale-[1.01] cursor-pointer`}
            >
              <div className="flex items-center gap-3">
                <qa.icon className="w-5 h-5 flex-shrink-0 opacity-90" />
                <div>
                  <p className="font-bold text-sm">{qa.label}</p>
                  <p className="text-[10px] opacity-80 mt-0.5">{qa.desc}</p>
                </div>
              </div>
            </button>
          ))}

          {/* Class Attendance Summary */}
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Class Attendance</p>
            <div className="space-y-2.5">
              {classAttendance.map((cls: any) => (
                <div key={cls.name}>
                  <div className="flex justify-between text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    <span>{cls.name}</span>
                    <span className={cls.rate < 80 ? 'text-rose-500' : 'text-emerald-600'}>{cls.rate}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${cls.rate >= 90 ? 'bg-emerald-500' : cls.rate >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${cls.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Recent Reports */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ClipboardList className="w-4.5 h-4.5 text-accent-500" />
              Recent Academic Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {recentReports.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">
                  No persisted generated-report history is available.
                </p>
              )}
              {recentReports.map((rep, i) => (
                <div key={i} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{rep.title}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{rep.date}</p>
                  </div>
                  <span className={`text-[9px] px-2.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider whitespace-nowrap ${
                    rep.type === 'Academic' ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/30 dark:text-accent-400'
                    : rep.type === 'Retention' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                    : rep.type === 'Remedial' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400'
                    : 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400'
                  }`}>
                    {rep.type}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/admin/reports')}
              className="mt-4 w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              View All Reports →
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Faculty Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GraduationCap className="w-4.5 h-4.5 text-accent-500" />
            Faculty Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="pb-2 px-3">Faculty Member</th>
                <th className="pb-2 px-3">Assigned Classes</th>
                <th className="pb-2 px-3">Subjects Handled</th>
                <th className="pb-2 px-3 text-center">Student Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {facultyList.map((f: any, i: number) => {
                const count = Number(f.studentCount ?? 0);
                return (
                  <tr key={f.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{f.name}</td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{f.classes}</td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">{f.subjects}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-400 font-extrabold text-xs">{count}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

    </div>
  );
};

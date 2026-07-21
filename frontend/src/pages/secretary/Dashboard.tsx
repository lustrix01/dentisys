import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ClipboardPenLine, Video, UserCircle, Users, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { getSecretaryDashboardKpisApi } from '../../services/apiClient';
import {
  getAssignedClassId,
  getAssignedClassName,
  getAttendanceRate,
  getClassAttendance,
  getClassStudents,
  getCurrentSecretary,
} from './utils';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { students, attendanceRecords } = useApp();
  const secretary = getCurrentSecretary();
  const fallbackClassId = getAssignedClassId(secretary);
  const fallbackClassName = getAssignedClassName(secretary);
  const fallbackClassStudents = getClassStudents(students, fallbackClassId);
  const fallbackClassAttendance = getClassAttendance(attendanceRecords, fallbackClassStudents);
  const today = new Date().toISOString().split('T')[0];
  const fallbackTodayRecords = fallbackClassAttendance.filter(record => record.date === today);
  const fallbackOverriddenCount = fallbackClassAttendance.filter(record => record.auditTrail?.length).length;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<{
    kpis: {
      assignedStudents: number;
      attendanceRate: number;
      todayRecords: number;
      overriddenCount: number;
    };
    recentActivity: Array<{ id: string; studentName: string; date: string; subjectCode: string; status: string }>;
    assignedClass: {
      classId: string;
      className: string;
      classroomName: string;
      cctvCameraId: string;
    };
  } | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSecretaryDashboardKpisApi();
      setDashboardData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to the backend server. Showing fallback data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const assignedStudentsCount = dashboardData?.kpis.assignedStudents ?? fallbackClassStudents.length;
  const attendanceRatePct = dashboardData?.kpis.attendanceRate ?? getAttendanceRate(fallbackClassAttendance);
  const todayRecordsCount = dashboardData?.kpis.todayRecords ?? fallbackTodayRecords.length;
  const overriddenCountVal = dashboardData?.kpis.overriddenCount ?? fallbackOverriddenCount;
  const activeClassName = dashboardData?.assignedClass.className ?? fallbackClassName;

  const actionCards = [
    {
      title: 'Attendance List',
      description: 'Review class records, search students, and filter by date.',
      icon: CalendarCheck,
      path: '/secretary/attendance',
    },
    {
      title: 'Manual Override',
      description: 'Correct attendance with reasons and audit history.',
      icon: ClipboardPenLine,
      path: '/secretary/override',
    },
    {
      title: 'Live CCTV Feed',
      description: 'Open the assigned classroom camera stream.',
      icon: Video,
      path: '/secretary/cctv',
    },
    {
      title: 'Profile',
      description: 'View secretary account and class assignment details.',
      icon: UserCircle,
      path: '/secretary/profile',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Standard Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-4 border-b border-slate-200/40 dark:border-slate-800/40 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Class Secretary Portal
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Viewing clinical assignments and logs for <span className="font-semibold text-blue-650 dark:text-blue-400">{activeClassName}</span> (Assigned: {secretary?.name || 'Class Secretary'})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/secretary/attendance')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
          >
            <ClipboardPenLine className="w-4 h-4" />
            Open Attendance
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchDashboardData}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading class secretary metrics from backend...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-blue-50 to-blue-100/20 dark:from-blue-950/20 dark:to-blue-900/10 border-blue-200/50 dark:border-blue-800/20 hover:scale-101 transition-all">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Students</span>
                <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{assignedStudentsCount}</span>
              </div>
              <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-emerald-50 to-emerald-100/20 dark:from-emerald-950/20 dark:to-emerald-900/10 border-emerald-200/50 dark:border-emerald-800/20 hover:scale-101 transition-all">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
                <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{attendanceRatePct}%</span>
              </div>
              <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
                <CalendarCheck className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-blue-50 to-blue-100/20 dark:from-blue-950/20 dark:to-blue-900/10 border-blue-200/50 dark:border-blue-800/20 hover:scale-101 transition-all">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today Records</span>
                <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{todayRecordsCount}</span>
              </div>
              <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-amber-50 to-amber-100/20 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200/50 dark:border-amber-800/20 hover:scale-101 transition-all">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Overrides</span>
                <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 block mt-1">{overriddenCountVal}</span>
              </div>
              <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
                <AlertCircle className="w-5 h-5" />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {actionCards.map(action => {
              const Icon = action.icon;
              return (
                <Card key={action.title} hoverEffect onClick={() => navigate(action.path)} className="min-h-[170px]">
                  <CardContent className="h-full flex flex-col justify-between">
                    <div className="w-11 h-11 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{action.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{action.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Class Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {fallbackClassAttendance.length === 0 && (!dashboardData?.recentActivity || dashboardData.recentActivity.length === 0) ? (
                <div className="py-10 text-center text-sm text-slate-400">No attendance records are available for this assigned class yet.</div>
              ) : (
                <div className="space-y-3">
                  {fallbackClassAttendance.slice(-5).reverse().map(record => {
                    const student = fallbackClassStudents.find(item => item.id === record.studentId);
                    return (
                      <div key={record.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{student?.name || 'Unknown student'}</p>
                          <p className="text-xs text-slate-400">{record.subjectCode} - {record.date}</p>
                        </div>
                        <span className="text-xs font-bold capitalize text-slate-600 dark:text-slate-300">{record.status}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};


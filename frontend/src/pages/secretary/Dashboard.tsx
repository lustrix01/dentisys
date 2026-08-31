import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Play, Zap, Clock, CheckCircle2, BookOpen, MapPin } from 'lucide-react';
import { Card } from '../../components/Card';
import { getSecretaryDashboardKpisApi } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';

type DashboardData = Awaited<ReturnType<typeof getSecretaryDashboardKpisApi>>;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getSecretaryDashboardKpisApi());
    } catch (requestError) {
      setData(null);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const assignedStudentsCount = data?.kpis.assignedStudents ?? 0;
  const attendanceRateVal = data?.kpis.attendanceRate ?? 0;
  const todayRecordsVal = data?.kpis.todayRecords ?? 0;
  const overriddenVal = data?.kpis.overriddenCount ?? 0;
  const assignedClassName = data?.assignedClass.className || 'CLINIC-4B';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      
      {/* 1. Clean Top Header with Highlighted Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Welcome back, {user?.display_name || 'Class Secretary'}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Manage section attendance registers, start live class sessions, and submit manual overrides.
          </p>
        </div>

        {/* Highlighted Primary CTA Button */}
        <button
          onClick={() => navigate('/secretary/start-session')}
          className="flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Start Class Session</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Workspace Column (Spans 8) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* 2. Secretary Workspace Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
              <div>
                <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100 mt-0.5">
                  Section Operations & Attendance Tracking
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg leading-relaxed">
                  Review student check-in entries, perform manual attendance overrides with audit logging, and verify section attendance status.
                </p>
              </div>

              <button
                onClick={() => navigate('/secretary/attendance')}
                className="self-start sm:self-center flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
              >
                <span>Attendance List</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Concise Secretary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Section</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {assignedClassName}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Enrolled Students</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {assignedStudentsCount}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400 block mt-0.5">
                  {attendanceRateVal}%
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today Records</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {todayRecordsVal}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Dashboard Overview (4 Metric Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Assigned Students</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{assignedStudentsCount}</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Attendance Rate</span>
              <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 block mt-1">{attendanceRateVal}%</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Today Records</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{todayRecordsVal}</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Overrides</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{overriddenVal}</span>
            </Card>
          </div>

          {/* Quick Action Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              <button
                onClick={() => navigate('/secretary/attendance')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-blue-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Daily Register</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-blue-600 transition-colors">
                  Section Attendance List
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  View daily student check-ins
                </p>
              </button>

              <button
                onClick={() => navigate('/secretary/override')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-emerald-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Audited Actions</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-emerald-600 transition-colors">
                  Manual Override
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Correct attendance log status
                </p>
              </button>

              <button
                onClick={() => navigate('/student/attendance')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-blue-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Student Feature</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-blue-600 transition-colors">
                  Daily Attendance Check-In
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Camera & Geofence verification
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <button
                onClick={() => navigate('/student/face-registration')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/60 dark:border-slate-800/80 hover:border-teal-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">Student Biometrics</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5 group-hover:text-teal-600 transition-colors">
                  Face Registration
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Webcam biometric enrollment flow
                </p>
              </button>

              <button
                onClick={() => navigate('/student/attendance-logs')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/60 dark:border-slate-800/80 hover:border-amber-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Student Logs</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5 group-hover:text-amber-600 transition-colors">
                  Attendance Logs
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Filterable student log records
                </p>
              </button>

              <button
                onClick={() => navigate('/student/classes')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/60 dark:border-slate-800/80 hover:border-purple-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">Academic Roster</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5 group-hover:text-purple-600 transition-colors">
                  My Classes & Retention
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Student subjects & retention status
                </p>
              </button>
            </div>
          </div>

          {/* 5. Search Bar Section */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Search Section Students & Attendance Records
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Search student names, student IDs, or attendance dates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100 placeholder-slate-400"
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
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                {assignedClassName}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Daily Attendance
                </span>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                  Daily Cut-off Submission
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  All attendance overrides and late entries must be finalized by 5:00 PM today.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Face Verification
                </span>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                  Biometric Verification Active
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Automatic check-in logging is operational for Lecture Room 101.
                </p>
              </div>
            </div>
          </div>

          {/* Widget 2: Today's Schedule */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Today's Schedule
              </h3>
              <span className="text-[10px] text-slate-400 font-semibold">Active Section</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100">Clinical Dentistry II</h4>
                  <p className="text-[10px] text-slate-400">Section {assignedClassName} • 8:00 AM - 11:00 AM</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded-md">
                  Clinic Lab 2
                </span>
              </div>
            </div>
          </div>

          {/* Widget 3: Recent Activity */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Recent Activity
              </h3>
              <button 
                onClick={() => navigate('/secretary/attendance')}
                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                View Sheet
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <p className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                  Verified daily check-in logs for {assignedClassName}.
                </p>
                <span className="text-[10px] text-slate-400 block mt-1">Attendance Sheet • Today</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

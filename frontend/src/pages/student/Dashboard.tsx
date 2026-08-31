import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck,
  CalendarDays,
  BookOpen,
  AlertTriangle,
  ShieldCheck,
  Clock,
  ArrowRight,
  MapPin,
  Camera,
  History,
  CheckCircle2,
  LogOut,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

interface TodaySessionItem {
  code: string;
  name: string;
  room: string;
  schedule: string;
  timeInStatus: 'done' | 'pending';
  timeInTime?: string;
  timeOutStatus: 'ready' | 'done' | 'pending';
  timeOutTime?: string;
}

const INITIAL_TODAY_SESSIONS: TodaySessionItem[] = [
  {
    code: 'CLIN401',
    name: 'Restorative Dentistry Lab',
    room: 'Room 101',
    schedule: '08:00 AM - 12:00 PM',
    timeInStatus: 'done',
    timeInTime: '08:15 AM',
    timeOutStatus: 'ready',
  },
  {
    code: 'PROS402',
    name: 'Prosthodontics Clinical Practicum',
    room: 'Lab Room 204',
    schedule: '01:00 PM - 05:00 PM',
    timeInStatus: 'pending',
    timeOutStatus: 'pending',
  },
  {
    code: 'ORAL301',
    name: 'Oral Surgery Clinic',
    room: 'Operating Room B',
    schedule: '07:00 AM - 09:00 AM',
    timeInStatus: 'done',
    timeInTime: '07:05 AM',
    timeOutStatus: 'done',
    timeOutTime: '09:02 AM',
  }
];

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students, attendanceRecords, settings } = useApp();

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentName = currentStudent?.name || user?.display_name || 'Dental Student';
  const studentId = currentStudent?.studentId || '2023-BU-0142';
  const retentionThreshold = settings?.retentionThreshold || 2.5;

  const isFaceRegistered = localStorage.getItem(`dentisys_face_registered_${currentStudent?.id || '1'}`) === 'true';

  const enrolledSubjects = currentStudent?.enrolledSubjects || [];
  const failingSubjects = enrolledSubjects.filter(
    subj => subj.isClinical && subj.grade > retentionThreshold
  );

  const studentRecords = attendanceRecords.filter(r => r.studentId === currentStudent?.id);
  const totalLogs = studentRecords.length;
  const presentCount = studentRecords.filter(r => r.status === 'present' || r.status === 'late').length;
  const overallAttendanceRate = totalLogs > 0 ? Math.round(((presentCount) / totalLogs) * 100) : 92;

  const isLowAttendance = overallAttendanceRate < 85;
  const isAtRisk = failingSubjects.length > 0 || isLowAttendance;

  const todayStr = new Date().toISOString().split('T')[0];

  // TODAY'S CLASS SESSIONS & CHECK-IN / CHECK-OUT STATUS
  const [todaySessions, setTodaySessions] = useState<TodaySessionItem[]>(INITIAL_TODAY_SESSIONS);

  const handleTimeOut = (code: string) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTodaySessions(prev => prev.map(s => {
      if (s.code === code) {
        return {
          ...s,
          timeOutStatus: 'done',
          timeOutTime: nowTime
        };
      }
      return s;
    }));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">

      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Welcome back, {studentName}!
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Monitor your clinical attendance, today's schedule, and academic retention standing.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
            <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentId}</span>
          </div>

          <button
            onClick={() => navigate('/student/attendance')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>Daily Check-In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* RETENTION WARNING ALERT */}
      {isAtRisk ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-amber-200 dark:border-amber-900/50 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wider bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  Retention Standing Warning
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Academic Performance Review Required
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                You are currently flagged for clinical retention monitoring.
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Academic policy requires maintaining a GWA of <strong className="text-slate-800 dark:text-slate-200">2.50 or better</strong> in clinical subjects and an attendance rate of <strong className="text-slate-800 dark:text-slate-200">85% or higher</strong>.
              </p>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <p className="font-bold text-slate-700 dark:text-slate-200">Attention Factors:</p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-0.5 font-medium text-[11px]">
                  {failingSubjects.map(s => (
                    <li key={s.code}>
                      Grade in <strong className="font-mono">{s.code}</strong> is <strong>{s.grade.toFixed(2)}</strong> (Threshold: {retentionThreshold.toFixed(2)})
                    </li>
                  ))}
                  {isLowAttendance && (
                    <li>
                      Attendance rate is <strong>{overallAttendanceRate}%</strong> (Required: ≥85%)
                    </li>
                  )}
                </ul>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  onClick={() => navigate('/student/classes')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View Subject Details <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                Retention Compliant
              </span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                Your clinical grades and attendance meet all retention standards.
              </h4>
            </div>
          </div>
          <button
            onClick={() => navigate('/student/classes')}
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
          >
            View Standing
          </button>
        </div>
      )}

      {/* 2-Column Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Main Workspace Column (Spans 8) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Student Overview Metrics Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                  Student Workspace
                </span>
                <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100 mt-0.5">
                  Academic Progress Overview
                </h2>
              </div>
            </div>

            {/* 4 Metric Boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400 block mt-0.5">
                  {overallAttendanceRate}%
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today Sessions</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {todaySessions.filter(s => s.timeInStatus === 'done').length} / {todaySessions.length} <span className="text-[10px] font-normal text-slate-400">done</span>
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Face Biometrics</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {isFaceRegistered ? 'Active ✓' : 'Pending'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Clinical Hours</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  140 / 160 <span className="text-[10px] font-normal text-slate-400">hrs</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => navigate('/student/attendance')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-blue-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Session Check-In</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-blue-600 transition-colors">
                  Daily Attendance
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Facial + Geofence verification
                </p>
              </button>

              <button
                onClick={() => navigate('/student/attendance-logs')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-blue-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Audit Trail</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-blue-600 transition-colors">
                  Attendance Logs
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Full historical log entries
                </p>
              </button>

              <button
                onClick={() => navigate('/student/face-registration')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-blue-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Biometrics</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-blue-600 transition-colors">
                  Face Registration
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Enroll or update face model
                </p>
              </button>
            </div>
          </div>

          {/* TODAY'S CLASS SESSIONS & TIME-IN / TIME-OUT STATUS TABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Today's Class Sessions & Check-In Status
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Track Time-In & Time-Out for today's scheduled classes</p>
              </div>
              <button
                onClick={() => navigate('/student/attendance')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                Check-in portal <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-3">Class Subject</th>
                    <th className="pb-3">Schedule & Room</th>
                    <th className="pb-3">Time-In Status</th>
                    <th className="pb-3">Time-Out Status</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {todaySessions.map((session) => (
                    <tr key={session.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5">
                        <div className="space-y-0.5">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xs block">{session.code}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 text-xs block">{session.name}</span>
                        </div>
                      </td>

                      <td className="py-3.5">
                        <div className="space-y-0.5 text-slate-500 dark:text-slate-400">
                          <span className="block font-semibold">{session.schedule}</span>
                          <span className="block text-[10px]">{session.room}</span>
                        </div>
                      </td>

                      {/* Time-In Status Column */}
                      <td className="py-3.5">
                        {session.timeInStatus === 'done' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Done ({session.timeInTime})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[10px] font-bold">
                            Pending Time-In
                          </span>
                        )}
                      </td>

                      {/* Time-Out Status Column */}
                      <td className="py-3.5">
                        {session.timeOutStatus === 'done' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-blue-600" />
                            Done ({session.timeOutTime})
                          </span>
                        ) : session.timeInStatus === 'done' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-bold">
                            Ready for Time-Out
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[10px] font-bold">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Action Column */}
                      <td className="py-3.5 text-right">
                        {session.timeInStatus === 'pending' ? (
                          <button
                            onClick={() => navigate('/student/attendance')}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                          >
                            Check-In (Time In)
                          </button>
                        ) : session.timeOutStatus !== 'done' ? (
                          <button
                            onClick={() => handleTimeOut(session.code)}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                          >
                            Check-Out (Time Out)
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400">Completed ✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Sidebar Column (Spans 4) */}
        <div className="lg:col-span-4 space-y-5">

          {/* Quick Check-In Guidance Widget */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Verification Steps
              </h3>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-full">
                BU Dental Clinic
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  Step 1: Select Class
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Choose your enrolled clinical subject from the dropdown menu.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  Step 2: Session Check
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Verify session status badge (Active 🟢) and room location info.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  Step 3: Geofence & Face
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Verify live GPS coordinates (200m radius) and scan face.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/student/attendance')}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Go to Attendance Check-In</span>
            </button>
          </div>

          {/* Location Area Info Widget */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Designated Geofence Radius</h4>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Attendance check-in is restricted to Bicol University Dental Clinic premises.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};

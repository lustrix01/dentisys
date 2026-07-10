import React, { useState } from 'react';
import { 
  CalendarDays, 
  BookOpen, 
  Check, 
  UserX, 
  Clock, 
  CheckCircle2, 
  Save, 
  AlertCircle,
  TrendingUp,
  History
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student, AttendanceRecord } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';

export const AttendanceMonitoring: React.FC = () => {
  const { students, attendanceRecords, addAttendanceRecord } = useApp();

  // List of all unique courses from all students
  const availableCourses = Array.from(
    new Set(students.flatMap(s => s.enrolledSubjects.map(subj => JSON.stringify({ code: subj.code, name: subj.name }))))
  ).map(str => JSON.parse(str) as { code: string; name: string });

  // State selectors
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>(
    availableCourses.length > 0 ? availableCourses[0].code : ''
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Quick State for current sheet
  const [attendanceSheet, setAttendanceSheet] = useState<Record<string, 'present' | 'absent' | 'late' | 'excused'>>({});
  const [isSaved, setIsSaved] = useState(false);

  // Active course
  const currentCourse = availableCourses.find(c => c.code === selectedCourseCode);

  // Filter students enrolled in the active course
  const enrolledStudents = students.filter(s => 
    s.enrolledSubjects.some(subj => subj.code === selectedCourseCode)
  );

  // Load existing records if any
  const existingRecordsForDay = attendanceRecords.filter(
    r => r.date === selectedDate && r.subjectCode === selectedCourseCode
  );

  // Initialize sheet state on subject/date change
  React.useEffect(() => {
    const initialSheet: Record<string, 'present' | 'absent' | 'late' | 'excused'> = {};
    
    enrolledStudents.forEach(student => {
      const match = existingRecordsForDay.find(r => r.studentId === student.id);
      initialSheet[student.id] = match ? match.status : 'present'; // default present
    });

    setAttendanceSheet(initialSheet);
    setIsSaved(false);
  }, [selectedCourseCode, selectedDate, students]);

  const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
    setAttendanceSheet(prev => ({
      ...prev,
      [studentId]: status
    }));
    setIsSaved(false);
  };

  const handleSaveAttendance = () => {
    Object.entries(attendanceSheet).forEach(([studentId, status]) => {
      addAttendanceRecord({
        studentId,
        date: selectedDate,
        subjectCode: selectedCourseCode,
        status
      });
    });

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  // Calculations for current day stats
  const totalEnrolled = enrolledStudents.length;
  const countStatus = (status: 'present' | 'absent' | 'late' | 'excused') => {
    return Object.values(attendanceSheet).filter(s => s === status).length;
  };

  const presentsCount = countStatus('present');
  const latesCount = countStatus('late');
  const absentsCount = countStatus('absent');
  const excusedCount = countStatus('excused');

  const presentPercentage = totalEnrolled > 0 
    ? Math.round(((presentsCount + latesCount) / totalEnrolled) * 100) 
    : 100;

  // Past Logs list for this course
  const pastDatesLogs = Array.from(
    new Set(attendanceRecords.filter(r => r.subjectCode === selectedCourseCode && r.date !== selectedDate).map(r => r.date))
  ).sort().reverse().slice(0, 5); // top 5 past dates

  const getPastDateStats = (date: string) => {
    const records = attendanceRecords.filter(r => r.subjectCode === selectedCourseCode && r.date === date);
    const total = records.length;
    if (total === 0) return '0%';
    const presentOrLate = records.filter(r => r.status === 'present' || r.status === 'late').length;
    return `${Math.round((presentOrLate / total) * 100)}% Present`;
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">Attendance Monitoring Portal</h1>
        <p className="text-xs text-slate-400">Record daily class attendance worksheets and track clinic log percentages</p>
      </div>

      {/* Control selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Course Selection */}
        <Card className="p-4 md:col-span-2 flex flex-col sm:flex-row gap-4 items-center">
          <div className="w-full sm:flex-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <BookOpen className="w-3.5 h-3.5 text-clinical-500" />
              Select Course
            </label>
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              {availableCourses.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-56">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-accent-500" />
              Attendance Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>
        </Card>

        {/* Daily Stats Summary */}
        <Card className="p-4 bg-gradient-to-tr from-clinical-500 to-accent-500 text-white flex items-center justify-between shadow-md">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-clinical-100">Live Attendance Rate</p>
            <h3 className="text-3xl font-extrabold font-heading">{presentPercentage}%</h3>
            <p className="text-[10px] text-clinical-100 font-medium">For {selectedDate}</p>
          </div>
          <div className="text-right text-xs space-y-0.5">
            <div>Present: {presentsCount}</div>
            <div>Late: {latesCount}</div>
            <div>Absent: {absentsCount}</div>
            <div>Excused: {excusedCount}</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Middle Panel: Attendance check grid */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/20 flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Attendance Sheets ({totalEnrolled} Enrolled Students)
              </h3>
              {existingRecordsForDay.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold uppercase tracking-wider">
                  Existing Log Overwrite
                </span>
              )}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {enrolledStudents.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-semibold text-sm">
                  No students currently enrolled in this dentistry class.
                </div>
              ) : (
                enrolledStudents.map(student => {
                  const currentStatus = attendanceSheet[student.id] || 'present';

                  return (
                    <div key={student.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{student.name}</h4>
                        <span className="text-xs text-slate-400">{student.studentId} • Year {student.yearLevel}</span>
                      </div>

                      {/* Selector Actions buttons */}
                      <div className="flex items-center space-x-2">
                        {/* Present */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.id, 'present')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            currentStatus === 'present'
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-900 text-slate-450 hover:bg-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          Present
                        </button>

                        {/* Late */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.id, 'late')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            currentStatus === 'late'
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-900 text-slate-450 hover:bg-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          Late
                        </button>

                        {/* Excused */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.id, 'excused')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            currentStatus === 'excused'
                              ? 'bg-sky-500 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-900 text-slate-450 hover:bg-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          Excused
                        </button>

                        {/* Absent */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.id, 'absent')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            currentStatus === 'absent'
                              ? 'bg-rose-500 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-900 text-slate-450 hover:bg-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          Absent
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {enrolledStudents.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 flex justify-end">
                <button
                  onClick={handleSaveAttendance}
                  className="flex items-center space-x-2 px-5 py-3 bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm rounded-2xl shadow-md transition-all active:scale-97"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaved ? 'Attendance Logged Successfully!' : 'Save Attendance Ledger'}</span>
                </button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Panel: History Logs */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-accent-500" />
                Course Attendance History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pastDatesLogs.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No previous records registered for this course yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {pastDatesLogs.map(date => (
                    <div
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 hover:border-clinical-500/30 cursor-pointer flex justify-between items-center transition-all hover:translate-x-0.5"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{date}</div>
                        <p className="text-[10px] text-slate-400 mt-0.5">Click to load worksheet</p>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 bg-clinical-50 text-clinical-600 dark:bg-clinical-950/40 dark:text-clinical-400 rounded-md font-bold">
                        {getPastDateStats(date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

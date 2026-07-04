import React, { useState } from 'react';
import { Calendar, Search, ClipboardCheck, CheckCircle, User } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { useApp } from '../../context/AppContext';

export const AttendanceLogger: React.FC = () => {
  const { attendanceRecords, students, addAttendanceRecord } = useApp();
  const [search, setSearch] = useState('');

  // Secretary is also a student
  const allStudents = [
    { id: 'sec-01', studentId: 'DENT-2023-0999', name: 'Miss Clara Oswald (Secretary)', email: 'secretary@bicol-u.edu.ph', yearLevel: 3 },
    ...students
  ];

  // Manual Attendance Form States
  const [selectedStudentId, setSelectedStudentId] = useState(allStudents[0]?.id || '');
  const [selectedSubject, setSelectedSubject] = useState('CLIN401');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'late' | 'absent'>('present');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group records or create simple mock logs
  const classLogs = [
    { id: '1', date: '2026-07-04', subject: 'CLIN401', topic: 'Endodontic Canal Preparation', presents: 12, absents: 1 },
    { id: '2', date: '2026-07-03', subject: 'CLIN402', topic: 'Amalgam Restoration Lab', presents: 15, absents: 0 },
    { id: '3', date: '2026-07-02', subject: 'CLIN401', topic: 'Pulpectomy Clinic Procedures', presents: 11, absents: 2 },
    { id: '4', date: '2026-07-01', subject: 'ODON401', topic: 'Legal Aspects of Dental Malpractice', presents: 13, absents: 0 },
  ];

  const filteredLogs = classLogs.filter(log => 
    log.subject.toLowerCase().includes(search.toLowerCase()) || 
    log.topic.toLowerCase().includes(search.toLowerCase())
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      addAttendanceRecord({
        studentId: selectedStudentId,
        subjectCode: selectedSubject,
        date: attendanceDate,
        status: attendanceStatus,
      });
      setIsSubmitting(false);
      alert(`Manual attendance logged successfully for the student!`);
    }, 800);
  };

  // Match student name helper
  const getStudentName = (id: string) => {
    const student = allStudents.find(s => s.id === id || s.studentId === id);
    return student ? student.name : 'Unknown Student';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Daily Attendance Registry</h1>
          <p className="text-xs text-slate-400">Log class sessions, manage manual sheet entries, and audit student presence ratios.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Sessions Table (Col 2) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <CardTitle>Attendance Sessions</CardTitle>
              <div className="relative w-full md:w-64">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Search by class code..."
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
                    <th className="py-3 px-4">Class Date</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Topic / Session Lecture</th>
                    <th className="py-3 px-4 text-center">Present</th>
                    <th className="py-3 px-4 text-center">Absent</th>
                    <th className="py-3 px-4 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150/40 dark:divide-slate-850">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-350">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {log.date}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                        {log.subject}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {log.topic}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-600 dark:text-emerald-400">
                        {log.presents}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-rose-500">
                        {log.absents}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/30">
                          <CheckCircle className="w-3 h-3" />
                          Signed
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Log Manual Attendance (Col 1) */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-accent-500" />
                Log Manual Entry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualSubmit} className="space-y-4">
                {/* Student Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Student</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-accent-500 dark:text-slate-100"
                  >
                    {allStudents.map(s => (
                      <option key={s.id} value={s.id} className="dark:bg-slate-900">
                        {s.name} ({s.studentId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Selector */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Subject Class</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-accent-500 dark:text-slate-100"
                  >
                    <option value="CLIN401" className="dark:bg-slate-900">CLIN401 - Clinical Dentistry I</option>
                    <option value="CLIN402" className="dark:bg-slate-900">CLIN402 - Restorative Clinic</option>
                    <option value="ODON401" className="dark:bg-slate-900">ODON401 - Jurisprudence & Ethics</option>
                  </select>
                </div>

                {/* Date Picker */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Attendance Date</label>
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-accent-500 dark:text-slate-100 font-semibold"
                  />
                </div>

                {/* Status Segmented Picker */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                  <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/20 dark:border-slate-750/30">
                    {['present', 'late', 'absent'].map(statusOption => (
                      <button
                        key={statusOption}
                        type="button"
                        onClick={() => setAttendanceStatus(statusOption as any)}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                          attendanceStatus === statusOption
                            ? statusOption === 'present'
                              ? 'bg-emerald-500 text-white shadow-xs'
                              : statusOption === 'late'
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-rose-500 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                        }`}
                      >
                        {statusOption}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer mt-3"
                >
                  {isSubmitting ? 'Logging...' : 'Submit Entry'}
                </button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity / Raw Registry Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-indigo-500" />
            Recent Attendance Registry Entries (Biometric & Manual)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {attendanceRecords.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No recent logs recorded in this session.</p>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/60 dark:border-slate-800 pb-3 text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-2.5 px-4">Student</th>
                  <th className="py-2.5 px-4">Subject Class</th>
                  <th className="py-2.5 px-4">Logged Date</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150/40 dark:divide-slate-850">
                {[...attendanceRecords].reverse().slice(0, 10).map((record, index) => (
                  <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-250">
                      <span className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {getStudentName(record.studentId)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">
                      {record.subjectCode}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {record.date}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        record.status === 'present'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : record.status === 'late'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-750 dark:bg-rose-950/30 dark:text-rose-400'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

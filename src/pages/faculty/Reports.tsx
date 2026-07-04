import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  User, 
  GraduationCap, 
  AlertTriangle, 
  CalendarDays,
  FileCheck,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { gwaToDescription } from '../../utils/gradeHelper';

export const Reports: React.FC = () => {
  const { students, attendanceRecords } = useApp();
  
  // Selected Report states
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    students.length > 0 ? students[0].id : ''
  );
  const [reportType, setReportType] = useState<'card' | 'standing' | 'attendance'>('card');

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const handlePrint = () => {
    window.print();
  };

  // Calculations for Standing summary report
  const activeCount = students.filter(s => s.status === 'active').length;
  const warningCount = students.filter(s => s.status === 'warning').length;
  const criticalCount = students.filter(s => s.status === 'critical').length;
  const remedialCount = students.filter(s => s.status === 'remedial').length;

  // Attendance stats for selected student
  const getStudentAttendanceStats = (studentId: string) => {
    const studentRecords = attendanceRecords.filter(r => r.studentId === studentId);
    const total = studentRecords.length;
    if (total === 0) return { present: 96, absent: 4, rate: 96 };
    
    const presentOrLate = studentRecords.filter(r => r.status === 'present' || r.status === 'late').length;
    const rate = Math.round((presentOrLate / total) * 100);
    const absent = total - presentOrLate;

    return {
      present: presentOrLate,
      absent,
      rate
    };
  };

  const attStats = selectedStudent ? getStudentAttendanceStats(selectedStudent.id) : { present: 0, absent: 0, rate: 0 };

  return (
    <div className="space-y-6">
      
      {/* Page Header - Hidden during print */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-clinical-500" />
            Academic Reports Ledger
          </h1>
          <p className="text-xs text-slate-400">Generate printable transcript cards, retention lists, and attendance metrics</p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm shadow-md transition-all active:scale-95"
        >
          <Printer className="w-4 h-4" />
          <span>Print Report Sheet</span>
        </button>
      </div>

      {/* Selector Controls Card - Hidden during print */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center no-print">
        <div className="w-full md:flex-1">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">Report Template</label>
          <div className="flex space-x-2">
            <button
              onClick={() => setReportType('card')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                reportType === 'card' 
                  ? 'bg-clinical-500 text-white' 
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Academic Report Card
            </button>
            <button
              onClick={() => setReportType('standing')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                reportType === 'standing' 
                  ? 'bg-clinical-500 text-white' 
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Retention Standing Summary
            </button>
          </div>
        </div>

        {reportType === 'card' && (
          <div className="w-full md:w-64">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">Student Name</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {/* REPORT SHEETS PRINT AREA */}
      <div className="print-area">
        
        {/* Template 1: Student Report Card */}
        {reportType === 'card' && selectedStudent && (
          <Card className="max-w-3xl mx-auto p-8 bg-white text-slate-800 border border-slate-200 dark:border-slate-800/80 shadow-md">
            
            {/* School Header */}
            <div className="text-center space-y-1.5 border-b-2 border-clinical-500 pb-6 mb-6">
              <span className="text-3xl">🦷</span>
              <h2 className="font-heading font-extrabold text-2xl tracking-tight text-slate-800 uppercase">
                DentiSys College of Dentistry
              </h2>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Official Transcript of Student Grades</p>
              <p className="text-[10px] text-slate-400">120 Medical Plaza, Taft Ave, Metro Manila</p>
            </div>

            {/* Profile Info Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Student Name</p>
                <p className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-0.5">{selectedStudent.name}</p>
                
                <p className="text-slate-400 uppercase font-bold tracking-wider text-[10px] mt-3">Student ID</p>
                <p className="font-medium mt-0.5 text-slate-700 dark:text-slate-300">{selectedStudent.studentId}</p>
              </div>

              <div>
                <p className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Year Level</p>
                <p className="font-semibold mt-0.5 text-slate-700 dark:text-slate-300">
                  {selectedStudent.yearLevel}rd Year (Clinician)
                </p>

                <p className="text-slate-400 uppercase font-bold tracking-wider text-[10px] mt-3">Email Address</p>
                <p className="font-medium mt-0.5 text-slate-700 dark:text-slate-300">{selectedStudent.email}</p>
              </div>
            </div>

            {/* Grades Table */}
            <div className="space-y-4">
              <h3 className="font-bold text-xs uppercase text-clinical-650 tracking-wider">Academic Performance Ledger</h3>
              
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 pb-2 text-[10px] text-slate-450 font-bold uppercase">
                    <th className="py-2">Course Code</th>
                    <th className="py-2">Subject Title</th>
                    <th className="py-2 text-center">Units</th>
                    <th className="py-2 text-center">Type</th>
                    <th className="py-2 text-right">Grade (GWA)</th>
                    <th className="py-2 text-right">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                  {selectedStudent.enrolledSubjects.map(subj => (
                    <tr key={subj.code}>
                      <td className="py-3 font-bold text-slate-750 dark:text-slate-300 uppercase">{subj.code}</td>
                      <td className="py-3 text-slate-800 dark:text-slate-200">{subj.name}</td>
                      <td className="py-3 text-center text-slate-600">{subj.units}</td>
                      <td className="py-3 text-center text-slate-500">{subj.isClinical ? 'Clinical' : 'Lecture'}</td>
                      <td className="py-3 text-right font-extrabold text-slate-900 dark:text-slate-100">{subj.grade}</td>
                      <td className={`py-3 text-right font-bold ${
                        subj.grade > 2.5 && subj.isClinical 
                          ? 'text-rose-500' 
                          : subj.grade === 5.0 
                          ? 'text-rose-600' 
                          : 'text-emerald-500'
                      }`}>
                        {subj.grade > 2.5 && subj.isClinical 
                          ? 'FAIL (Retention)' 
                          : subj.grade === 5.0 
                          ? 'FAIL' 
                          : 'PASS'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Overall calculations panel */}
            <div className="grid grid-cols-3 gap-4 border-t-2 border-slate-150 dark:border-slate-850 pt-6 mt-6 text-center">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Overall GWA</p>
                <p className="text-2xl font-extrabold font-heading mt-0.5 text-clinical-600 dark:text-clinical-400">
                  {selectedStudent.overallGWA}
                </p>
                <p className="text-[9px] text-slate-450 italic mt-0.5">({gwaToDescription(selectedStudent.overallGWA)})</p>
              </div>

              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Attendance Rate</p>
                <p className="text-2xl font-extrabold font-heading mt-0.5 text-accent-500">
                  {attStats.rate}%
                </p>
                <p className="text-[9px] text-slate-450 mt-0.5">{attStats.present} present | {attStats.absent} absent</p>
              </div>

              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Retention standing</p>
                <p className={`text-sm font-extrabold mt-2 uppercase tracking-wide ${
                  selectedStudent.status === 'active' ? 'text-emerald-500' :
                  selectedStudent.status === 'remedial' ? 'text-accent-500' : 'text-rose-500'
                }`}>
                  {selectedStudent.status}
                </p>
              </div>
            </div>

            {/* Remedial Record details in Card if any */}
            {selectedStudent.remedialExams.length > 0 && (
              <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Remedial Exams Log</h4>
                {selectedStudent.remedialExams.map(rem => (
                  <div key={rem.id} className="text-[11px] flex justify-between items-center py-1">
                    <div>
                      <span className="font-bold text-slate-700 dark:text-slate-350">{rem.subjectCode} - {rem.subjectName}</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">Original Grade: {rem.originalGrade} | Exam Date: {rem.examDate}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                        rem.status === 'passed' 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' 
                          : rem.status === 'failed' 
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400' 
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                      }`}>
                        {rem.status}
                      </span>
                      {rem.remedialScore && <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">{rem.remedialScore}%</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* School Seal and Signatures */}
            <div className="flex justify-between items-end mt-12 pt-8 border-t border-dashed border-slate-200">
              <div className="text-center w-40">
                <div className="h-0.5 w-full bg-slate-400 mb-1" />
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Registrar Seal</p>
              </div>
              
              <div className="text-center w-40">
                <p className="text-xs font-bold text-slate-800">Dr. Eleanor Vance</p>
                <div className="h-0.5 w-full bg-slate-400 mt-1 mb-1" />
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Academic Dean Signature</p>
              </div>
            </div>

          </Card>
        )}

        {/* Template 2: Retention Standing Summary List */}
        {reportType === 'standing' && (
          <Card className="p-8 bg-white text-slate-800 border border-slate-200 dark:border-slate-800 shadow-md">
            {/* Report Header */}
            <div className="text-center space-y-1 pb-5 border-b-2 border-slate-350 mb-6">
              <h2 className="font-heading font-extrabold text-xl uppercase tracking-tight text-slate-800">
                Retention Standing Master Ledger
              </h2>
              <p className="text-xs text-slate-450 uppercase tracking-widest font-bold">List of all active enrolled students with warning counts</p>
              <p className="text-[10px] text-slate-400">Semester 1 Evaluation Period - Created: {new Date().toISOString().split('T')[0]}</p>
            </div>

            {/* Standing summary Stats boxes */}
            <div className="grid grid-cols-4 gap-4 text-center mb-6">
              <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl">
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">Active Good Standing</p>
                <h4 className="text-2xl font-bold font-heading">{activeCount}</h4>
              </div>
              <div className="p-3 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl">
                <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">Academic Warnings</p>
                <h4 className="text-2xl font-bold font-heading">{warningCount}</h4>
              </div>
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl">
                <p className="text-[9px] font-bold uppercase tracking-wider text-rose-500">Critical Standings</p>
                <h4 className="text-2xl font-bold font-heading">{criticalCount}</h4>
              </div>
              <div className="p-3 bg-accent-50 text-accent-700 border border-accent-100 rounded-xl">
                <p className="text-[9px] font-bold uppercase tracking-wider text-accent-500">Under Remedial</p>
                <h4 className="text-2xl font-bold font-heading">{remedialCount}</h4>
              </div>
            </div>

            {/* Students Standing table */}
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 pb-2 text-[10px] text-slate-400 uppercase font-bold">
                  <th className="py-2.5">Student ID</th>
                  <th className="py-2.5">Student Name</th>
                  <th className="py-2.5">Year</th>
                  <th className="py-2.5">GWA</th>
                  <th className="py-2.5">Standing</th>
                  <th className="py-2.5 text-right">Violations List</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {students.map(s => {
                  const violations = s.enrolledSubjects.filter(sub => (sub.isClinical && sub.grade > 2.5) || sub.grade === 5.0);
                  
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3 font-semibold text-slate-500">{s.studentId}</td>
                      <td className="py-3 font-bold text-slate-800">{s.name}</td>
                      <td className="py-3">Year {s.yearLevel}</td>
                      <td className="py-3 font-bold text-slate-800">{s.overallGWA}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                          s.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          s.status === 'remedial' ? 'bg-accent-100 text-accent-700' :
                          s.status === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[11px] text-rose-500 font-semibold">
                        {violations.length > 0 ? (
                          <span>{violations.map(v => v.code).join(', ')}</span>
                        ) : (
                          <span className="text-emerald-500 font-bold">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

      </div>
    </div>
  );
};

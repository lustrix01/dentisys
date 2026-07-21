import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Activity, 
  Search, 
  Calendar, 
  UserCheck, 
  Plus, 
  ClipboardCheck, 
  CheckCircle, 
  XCircle,
  HelpCircle,
  Clock,
  BookOpen
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student, RemedialExam } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';

import { getRetentionMonitoring, updateRemedialScore } from '../../services/facultyService';

export const RetentionMonitoring: React.FC = () => {
  const { students, settings, addRemedialExam, updateRemedialExam, deleteRemedialExam } = useApp();
  
  useEffect(() => {
    getRetentionMonitoring()
      .then(res => {
        if (res.success) {
          console.log('Fetched retention records from backend:', res.retention_records.length);
        }
      })
      .catch(err => {
        console.warn('Backend retention monitoring note:', err);
      });
  }, []);

  // Tab Management
  const [activeTab, setActiveTab] = useState<'watchlist' | 'remedials' | 'all'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');

  // Record Score modal states
  const [selectedRemedialId, setSelectedRemedialId] = useState<string | null>(null);
  const [remedialScore, setRemedialScore] = useState('');
  const [remedialNotes, setRemedialNotes] = useState('');

  // Schedule Remedial modal states
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  // 1.Watchlist Calculations
  const watchlistStudents = students.filter(s => s.status === 'warning' || s.status === 'critical');
  const remedialStudents = students.filter(s => s.status === 'remedial');
  
  // List of all active remedial exams across all students
  const allRemedialExams = students.flatMap(s => 
    s.remedialExams.map(rem => ({
      ...rem,
      studentName: s.name,
      studentIdNum: s.studentId,
    }))
  );

  const filteredRemedials = allRemedialExams.filter(rem => 
    rem.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rem.subjectCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rem.subjectName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWatchlist = watchlistStudents.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.studentId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAllStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.studentId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 2. Form submission handler for Recording Remedial Results
  const handleResolveRemedial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRemedialId) return;
    const scoreVal = parseInt(remedialScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      alert('Please enter a valid percentage score (0-100).');
      return;
    }
    updateRemedialExam(selectedRemedialId, scoreVal, remedialNotes);
    setSelectedRemedialId(null);
    setRemedialScore('');
    setRemedialNotes('');
  };

  // 3. Form submission handler for scheduling a new Remedial manually
  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedSubjectCode || !scheduleDate) {
      alert('Please complete all fields.');
      return;
    }
    const student = students.find(s => s.id === selectedStudentId);
    const subject = student?.enrolledSubjects.find(s => s.code === selectedSubjectCode);
    
    if (student && subject) {
      addRemedialExam({
        studentId: selectedStudentId,
        studentName: student.name,
        subjectCode: selectedSubjectCode,
        subjectName: subject.name,
        originalGrade: subject.grade,
        examDate: scheduleDate,
        notes: scheduleNotes,
      });
      setIsScheduleOpen(false);
      setSelectedStudentId('');
      setSelectedSubjectCode('');
      setScheduleDate('');
      setScheduleNotes('');
    }
  };

  const handleDeleteRemedial = (id: string) => {
    if (confirm('Are you sure you want to remove this remedial exam log?')) {
      deleteRemedialExam(id);
    }
  };

  const getStatusBadge = (status: Student['status']) => {
    const styles = {
      active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
      warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/30',
      critical: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/30 animate-pulse-slow',
      remedial: 'bg-accent-50 text-accent-600 dark:bg-accent-950/40 dark:text-accent-400 border border-accent-200/30',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const selectedStudentForSchedule = students.find(s => s.id === selectedStudentId);
  const activeRemedialToRecord = allRemedialExams.find(r => r.id === selectedRemedialId);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Retention & Remedial Management
          </h1>
          <p className="text-xs text-slate-400">Manage dental program academic standards (Strict clinical course threshold: 2.5 passing limits)</p>
        </div>
        <button
          onClick={() => {
            setIsScheduleOpen(true);
            setSelectedStudentId('');
            setSelectedSubjectCode('');
            setScheduleDate(new Date().toISOString().split('T')[0]);
            setScheduleNotes('');
          }}
          className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm shadow-md transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Schedule Remedial</span>
        </button>
      </div>

      {/* Dentistry Policy Callout */}
      <Card className="glass-accent border-clinical-500/20 p-5 flex items-start gap-4">
        <div className="p-3 bg-clinical-500/10 text-clinical-600 dark:text-clinical-400 rounded-2xl">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Dental Academic Retention Policy</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Students are required to maintain a grade of **2.5 or better** in all major clinical subjects. A grade worse than 2.5 (e.g., 2.75, 3.0, 5.0) in these subjects, or a failing grade of 5.0 in lecture courses, automatically triggers a **Warning / Critical** status. The student must pass a **Remedial Exam** (passing mark: 75% or above) which will resolve the standing and update the course grade to the maximum capped passing score of **2.5 (Clinical)** or **3.0 (Lecture)**.
          </p>
        </div>
      </Card>

      {/* Tabs Layout */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => { setActiveTab('watchlist'); setSearchQuery(''); }}
          className={`pb-3 font-semibold text-sm transition-all relative ${
            activeTab === 'watchlist' 
              ? 'text-clinical-600 dark:text-clinical-400 border-b-2 border-clinical-500' 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
          }`}
        >
          Retention Watchlist ({watchlistStudents.length})
        </button>
        <button
          onClick={() => { setActiveTab('remedials'); setSearchQuery(''); }}
          className={`pb-3 font-semibold text-sm transition-all relative ${
            activeTab === 'remedials' 
              ? 'text-clinical-600 dark:text-clinical-400 border-b-2 border-clinical-500' 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
          }`}
        >
          Remedial Exams Manager ({allRemedialExams.filter(e => e.status === 'pending').length} Pending)
        </button>
        <button
          onClick={() => { setActiveTab('all'); setSearchQuery(''); }}
          className={`pb-3 font-semibold text-sm transition-all relative ${
            activeTab === 'all' 
              ? 'text-clinical-600 dark:text-clinical-400 border-b-2 border-clinical-500' 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
          }`}
        >
          All Enrolled Standings ({students.length})
        </button>
      </div>

      {/* Search Filter input */}
      <div className="relative w-full">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder={
            activeTab === 'watchlist' ? 'Search at risk watchlist...' : 
            activeTab === 'remedials' ? 'Search remedial logs...' : 'Search all standings...'
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
        />
      </div>

      {/* TAB CONTENTS */}
      
      {/* 1. Retention Watchlist */}
      {activeTab === 'watchlist' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 text-xs font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Current GWA</th>
                  <th className="px-6 py-4">Triggering Courses (Failed Limits)</th>
                  <th className="px-6 py-4">Remedial Status</th>
                  <th className="px-6 py-4">Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-medium">
                      🎉 No students currently in the retention watchlist! All have clean clinical averages.
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map(student => {
                    const clinicalViolations = student.enrolledSubjects.filter(
                      s => (s.isClinical && s.grade > settings.retentionThreshold) || s.grade === 5.0
                    );

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="px-6 py-4.5">
                          <h4 className="font-bold text-slate-850 dark:text-slate-200">{student.name}</h4>
                          <span className="text-xs text-slate-400">{student.studentId} • Year {student.yearLevel}</span>
                        </td>

                        <td className="px-6 py-4.5">
                          <span className="text-base font-extrabold text-slate-850 dark:text-slate-100 font-heading">{student.overallGWA}</span>
                        </td>

                        <td className="px-6 py-4.5">
                          <div className="space-y-1">
                            {clinicalViolations.map(subj => (
                              <div key={subj.code} className="text-xs flex items-center space-x-1.5 text-rose-500 font-medium">
                                <span className="px-1 bg-rose-500/10 rounded font-bold uppercase">{subj.code}</span>
                                <span>{subj.name} (Grade: {subj.grade})</span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="px-6 py-4.5">
                          {student.remedialExams.length > 0 ? (
                            <div className="space-y-1">
                              {student.remedialExams.map(rem => (
                                <div key={rem.id} className="text-xs flex items-center space-x-1 text-slate-500">
                                  <Clock className="w-3.5 h-3.5 text-clinical-500" />
                                  <span>{rem.subjectCode} ({rem.status})</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No scheduled exam</span>
                          )}
                        </td>

                        <td className="px-6 py-4.5">
                          {getStatusBadge(student.status)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 2. Remedial Exams Manager */}
      {activeTab === 'remedials' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 text-xs font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Subject Info</th>
                  <th className="px-6 py-4">Exam Date</th>
                  <th className="px-6 py-4">Status / Score</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                {filteredRemedials.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-medium">
                      No remedial exam logs matched your search filters.
                    </td>
                  </tr>
                ) : (
                  filteredRemedials.map(rem => (
                    <tr key={rem.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                      <td className="px-6 py-4.5">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200">{rem.studentName}</h4>
                        <span className="text-xs text-slate-400">{rem.studentIdNum}</span>
                      </td>

                      <td className="px-6 py-4.5">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{rem.subjectCode}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{rem.subjectName}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Original Grade: {rem.originalGrade}</div>
                      </td>

                      <td className="px-6 py-4.5">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-clinical-500" />
                          {rem.examDate}
                        </span>
                      </td>

                      <td className="px-6 py-4.5">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                            rem.status === 'passed' 
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' 
                              : rem.status === 'failed' 
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400' 
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                          }`}>
                            {rem.status}
                          </span>
                          {rem.remedialScore !== null && (
                            <span className="font-bold text-slate-700 dark:text-slate-300">{rem.remedialScore}%</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4.5 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          {rem.status === 'pending' ? (
                            <button
                              onClick={() => {
                                setSelectedRemedialId(rem.id);
                                setRemedialScore('');
                                setRemedialNotes('');
                              }}
                              className="px-3 py-1.5 bg-clinical-500 hover:bg-clinical-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              Grade Score
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Resolved</span>
                          )}
                          <button
                            onClick={() => handleDeleteRemedial(rem.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Remove log"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 3. All Enrolled Standings */}
      {activeTab === 'all' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 text-xs font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Year Level</th>
                  <th className="px-6 py-4">Overall GWA</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Retention Checks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                {filteredAllStudents.map(student => {
                  const clinicalFails = student.enrolledSubjects.filter(
                    s => s.isClinical && s.grade > settings.retentionThreshold
                  ).length;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                      <td className="px-6 py-4.5">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200">{student.name}</h4>
                        <span className="text-xs text-slate-400">{student.studentId} • {student.email}</span>
                      </td>

                      <td className="px-6 py-4.5 text-slate-700 dark:text-slate-300">
                        {student.yearLevel === 3 || student.yearLevel === 4 
                          ? `${student.yearLevel}rd Year (Clinician)` 
                          : `${student.yearLevel}nd Year`}
                      </td>

                      <td className="px-6 py-4.5 font-bold font-heading text-slate-850 dark:text-slate-150">
                        {student.overallGWA}
                      </td>

                      <td className="px-6 py-4.5">
                        {getStatusBadge(student.status)}
                      </td>

                      <td className="px-6 py-4.5 text-xs">
                        {clinicalFails > 0 ? (
                          <span className="text-rose-500 font-bold">{clinicalFails} Course Warning(s)</span>
                        ) : (
                          <span className="text-emerald-500 font-semibold flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" /> Satisfied
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Grade Score Modal */}
      <Modal
        isOpen={selectedRemedialId !== null}
        onClose={() => setSelectedRemedialId(null)}
        title="Grade Remedial Exam"
      >
        {activeRemedialToRecord && (
          <form onSubmit={handleResolveRemedial} className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-500">
              <div>
                <span className="font-bold text-slate-400">Student:</span>{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{activeRemedialToRecord.studentName}</span>
              </div>
              <div>
                <span className="font-bold text-slate-400">Course:</span>{' '}
                <span className="font-semibold text-clinical-600 dark:text-clinical-400">
                  {activeRemedialToRecord.subjectCode} - {activeRemedialToRecord.subjectName}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-400">Original Grade:</span>{' '}
                <span className="font-semibold text-rose-500">{activeRemedialToRecord.originalGrade}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Remedial Score Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                placeholder="Enter score (e.g. 78)"
                value={remedialScore}
                onChange={(e) => setRemedialScore(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">Note: &gt;= 75% passes the student, capping their grade at 2.5 (Clinical) or 3.0 (Lecture).</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Resolution Comments / Notes
              </label>
              <textarea
                rows={3}
                placeholder="Describe practical clinicial skills reassessment..."
                value={remedialNotes}
                onChange={(e) => setRemedialNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
              />
            </div>

            <div className="flex space-x-3 pt-4 justify-end">
              <button
                type="button"
                onClick={() => setSelectedRemedialId(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm shadow-md"
              >
                Resolve & Publish
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Schedule Remedial Modal */}
      <Modal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        title="Schedule Remedial Examination"
      >
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Student</label>
            <select
              required
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              <option value="">Select student...</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>
              ))}
            </select>
          </div>

          {selectedStudentForSchedule && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Course</label>
              <select
                required
                value={selectedSubjectCode}
                onChange={(e) => setSelectedSubjectCode(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
              >
                <option value="">Select course...</option>
                {selectedStudentForSchedule.enrolledSubjects.map(subj => (
                  <option key={subj.code} value={subj.code}>{subj.code} - {subj.name} (Grade: {subj.grade})</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Remedial Exam Date</label>
            <input
              type="date"
              required
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Scheduling Notes</label>
            <textarea
              rows={3}
              placeholder="e.g. Schedule for practical clinic instrumentation retry..."
              value={scheduleNotes}
              onChange={(e) => setScheduleNotes(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
            />
          </div>

          <div className="flex space-x-3 pt-4 justify-end">
            <button
              type="button"
              onClick={() => setIsScheduleOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm shadow-md"
            >
              Create Schedule
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

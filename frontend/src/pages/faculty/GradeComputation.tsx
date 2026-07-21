import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  User, 
  BookOpen, 
  Settings, 
  Save, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student, EnrolledSubject, GradeComponents } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { percentageToGWA, gwaToDescription, computeSubjectGrade } from '../../utils/gradeHelper';
import confetti from 'canvas-confetti';

export const GradeComputation: React.FC = () => {
  const { students, settings, updateStudentGrade } = useApp();

  // Selected state
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('');

  // Component Inputs
  const [quizzes, setQuizzes] = useState<number>(80);
  const [exams, setExams] = useState<number>(80);
  const [practicum, setPracticum] = useState<number>(80);
  const [attendance, setAttendance] = useState<number>(90);

  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Active student and subject
  const currentStudent = students.find(s => s.id === selectedStudentId);
  const currentSubject = currentStudent?.enrolledSubjects.find(s => s.code === selectedSubjectCode);

  // Auto-fill inputs when student or subject changes
  useEffect(() => {
    if (currentSubject) {
      setQuizzes(currentSubject.components.quizzes);
      setExams(currentSubject.components.exams);
      setPracticum(currentSubject.components.practicum);
      setAttendance(currentSubject.components.attendance);
      setIsSaved(false);
    }
  }, [selectedStudentId, selectedSubjectCode]);

  // Set default subject when student changes
  useEffect(() => {
    if (currentStudent && currentStudent.enrolledSubjects.length > 0) {
      setSelectedSubjectCode(currentStudent.enrolledSubjects[0].code);
      setIsSaved(false);
    } else {
      setSelectedSubjectCode('');
    }
  }, [selectedStudentId]);

  // Auto select first student on mount
  useEffect(() => {
    if (students.length > 0 && !selectedStudentId) {
      setSelectedStudentId(students[0].id);
    }
  }, [students]);

  // Compute live preview values
  const weights = settings.weights;
  const totalWeight = weights.quizzes + weights.exams + weights.practicum + weights.attendance;
  
  const weightedQuizzes = (quizzes * weights.quizzes) / totalWeight;
  const weightedExams = (exams * weights.exams) / totalWeight;
  const weightedPracticum = (practicum * weights.practicum) / totalWeight;
  const weightedAttendance = (attendance * weights.attendance) / totalWeight;

  const rawPercentage = Math.round((weightedQuizzes + weightedExams + weightedPracticum + weightedAttendance) * 100) / 100;
  const computedGWA = percentageToGWA(rawPercentage);
  const gradeDescription = gwaToDescription(computedGWA);

  // Check retention limits (no grade worse than 2.5 in clinical subjects)
  const isClinical = currentSubject?.isClinical ?? false;
  const violatesRetention = isClinical && computedGWA > settings.retentionThreshold;
  const failsCourse = computedGWA === 5.0;

  const handleSaveGrates = () => {
    if (!selectedStudentId || !selectedSubjectCode) return;
    
    const components: GradeComponents = {
      quizzes,
      exams,
      practicum,
      attendance
    };

    updateStudentGrade(selectedStudentId, selectedSubjectCode, components);
    setIsSaved(true);

    // Trigger success confetti if GWA is excellent (1.0 or 1.25)
    if (computedGWA <= 1.25) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }

    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  const getSliderColor = (val: number) => {
    if (val >= 90) return 'accent-clinical-500';
    if (val >= 75) return 'accent-accent-500';
    return 'accent-rose-500';
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">Grade Computation Portal</h1>
        <p className="text-xs text-slate-400">Calculate final subject marks and check against dentistry clinical retention standards</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Form Panel: Selectors */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-clinical-500" />
                Select Student & Course
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Student selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Student Name</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                >
                  <option value="" disabled>Choose a student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>
                  ))}
                </select>
              </div>

              {/* Subject selector */}
              {currentStudent && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Enrolled Course</label>
                  <select
                    value={selectedSubjectCode}
                    onChange={(e) => setSelectedSubjectCode(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  >
                    {currentStudent.enrolledSubjects.map(subj => (
                      <option key={subj.code} value={subj.code}>{subj.code} - {subj.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Weights Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent-500" />
                Grading Weights System
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Clinical Practicum</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{weights.practicum}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-clinical-500 h-full" style={{ width: `${weights.practicum}%` }} />
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Written Exams</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{weights.exams}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-accent-500 h-full" style={{ width: `${weights.exams}%` }} />
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Quizzes & Assignments</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{weights.quizzes}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-sky-500 h-full" style={{ width: `${weights.quizzes}%` }} />
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Class Attendance</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{weights.attendance}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-teal-500 h-full" style={{ width: `${weights.attendance}%` }} />
                </div>
              </div>
              
              <div className="mt-4 p-2 bg-slate-100/50 dark:bg-slate-900/50 rounded-xl text-[10px] text-slate-400 text-center">
                Weights are adjustable in System Settings page.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center & Right Panel: Computation Sheet */}
        <div className="lg:col-span-2 space-y-6">
          {currentSubject ? (
            <Card className="glow-clinical">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-clinical-500/10 text-clinical-600 dark:text-clinical-400 font-bold uppercase tracking-wider">
                      {currentSubject.code}
                    </span>
                    <span className="text-xs text-slate-400">• {currentSubject.units} Lecture Units</span>
                  </div>
                  <CardTitle className="mt-1">{currentSubject.name}</CardTitle>
                </div>
                
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  currentSubject.isClinical 
                    ? 'bg-accent-100 text-accent-700 dark:bg-accent-950/40 dark:text-accent-400' 
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {currentSubject.isClinical ? 'Clinical Course' : 'Lecture Course'}
                </span>
              </CardHeader>

              <CardContent className="py-6 space-y-6">
                
                {/* Sliders Input Grid */}
                <div className="space-y-5">
                  {/* Practicum Score (only relevant if course allows it, normally we calculate for all based on settings weights) */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                        Clinical Practicum / Lab Score
                        {currentSubject.isClinical && <span className="text-[10px] text-rose-500 font-bold">(Major Weight)</span>}
                      </label>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{practicum}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={practicum}
                      onChange={(e) => setPracticum(parseInt(e.target.value))}
                      className={`w-full h-2 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer ${getSliderColor(practicum)}`}
                    />
                  </div>

                  {/* Written Exams Score */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Written Examinations Score</label>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{exams}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={exams}
                      onChange={(e) => setExams(parseInt(e.target.value))}
                      className={`w-full h-2 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer ${getSliderColor(exams)}`}
                    />
                  </div>

                  {/* Quizzes Score */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Quizzes & Assignments Score</label>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{quizzes}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={quizzes}
                      onChange={(e) => setQuizzes(parseInt(e.target.value))}
                      className={`w-full h-2 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer ${getSliderColor(quizzes)}`}
                    />
                  </div>

                  {/* Attendance Score */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Class Attendance Score</label>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{attendance}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={attendance}
                      onChange={(e) => setAttendance(parseInt(e.target.value))}
                      className={`w-full h-2 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer ${getSliderColor(attendance)}`}
                    />
                  </div>
                </div>

                {/* Score Output Banner */}
                <div className="p-6 rounded-3xl bg-gradient-to-tr from-slate-50 to-slate-100 dark:from-slate-900/60 dark:to-slate-900/40 border border-slate-200/50 dark:border-slate-800/80 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Live Weighted Result</div>
                    <div className="flex items-baseline space-x-2 mt-1">
                      <span className="text-4xl font-extrabold text-slate-800 dark:text-slate-100 font-heading">{rawPercentage}%</span>
                      <span className="text-slate-400 text-xs">overall score</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Calculated from your inputs against the weights configured.
                    </p>
                  </div>

                  <div className="w-px bg-slate-200 dark:bg-slate-800 h-16 hidden md:block" />

                  <div className="text-center md:text-right">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Philippine Academic GWA</div>
                    <div className="flex items-center justify-center md:justify-end space-x-2 mt-1">
                      <span className={`text-4xl font-extrabold font-heading ${
                        violatesRetention || failsCourse 
                          ? 'text-rose-500 dark:text-rose-400' 
                          : 'text-clinical-600 dark:text-clinical-400'
                      }`}>{computedGWA}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${
                        violatesRetention || failsCourse 
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' 
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      }`}>{gradeDescription}</span>
                    </div>

                    <div className="mt-2.5">
                      {violatesRetention ? (
                        <span className="text-rose-500 font-bold text-xs flex items-center justify-center md:justify-end gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Retention limit ({settings.retentionThreshold}) violated. Remedial scheduled.
                        </span>
                      ) : failsCourse ? (
                        <span className="text-rose-500 font-bold text-xs flex items-center justify-center md:justify-end gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Course Failed. Remedial scheduled.
                        </span>
                      ) : (
                        <span className="text-emerald-500 font-bold text-xs flex items-center justify-center md:justify-end gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Good Standing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    onClick={handleSaveGrates}
                    className="flex items-center space-x-2 px-6 py-3.5 bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm rounded-2xl shadow-md transition-all active:scale-98"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaved ? 'Grade Saved Successfully!' : 'Save & Publish Grades'}</span>
                  </button>
                </div>

              </CardContent>
            </Card>
          ) : (
            <Card className="py-16 text-center text-slate-400">
              <Calculator className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="font-semibold text-sm">No Student Enrolled</p>
              <p className="text-xs mt-1">Please select an enrolled dental student on the left panel to begin.</p>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
};

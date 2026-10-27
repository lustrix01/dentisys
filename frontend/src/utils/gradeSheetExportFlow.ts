// Grade workbook export used by Grade Computation and Reports -> Academic (contract official-exports.md, X1).
// Gathers the saved Grade Weights and the server's grade results, then downloads the official sheet,
// or the plain Grade Summary for classes whose Grade Weights are not the official layout.
import {
  ApiError, getFacultyGradingConfigApi, isPeriodComputeResult, previewFacultyGradesApi,
  type FacultyClassItem, type FacultyGradeComputeResult,
} from '../services/apiClient';
import type { Assessment, AssessmentScore, AttendanceRecord, Student } from '../types';
import {
  buildGradeSummarySheet, downloadOfficialGradeSheet, isOfficialLayout, savedGradeResult, type OfficialGradeResult,
} from './officialGradeSheetExport';
import { downloadXlsx } from './xlsxDownload';

export async function exportGradeWorkbook(a: {
  cls: FacultyClassItem;
  /** Currently enrolled students of the class. */
  students: Student[];
  assessments: Assessment[];
  scores: AssessmentScore[];
  attendanceRecords: AttendanceRecord[];
  /** Exporting Faculty's name for the summary's "Exported ... by" line. */
  by: string;
}): Promise<void> {
  const { cls } = a;
  const classKey = String(cls.csId || cls.id);
  const course = { code: cls.courseCode, title: cls.courseName, section: cls.csName, semester: cls.semester, schoolYear: cls.schoolYear };
  const { configuration } = await getFacultyGradingConfigApi({ courseId: cls.courseId, semester: cls.semester, schoolYear: cls.schoolYear });

  // The preview refuses past classes (409): they use the breakdown saved with each grade.
  let live: Record<string, FacultyGradeComputeResult> | null = {};
  try {
    for (const res of (await previewFacultyGradesApi(classKey)).results ?? []) live[String(res.studentId)] = res;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 409)) throw err;
    live = null;
  }
  const subjectOf = (student: Student) =>
    student.enrolledSubjects.find(sub => sub.code === cls.courseCode && String(sub.classId ?? student.classId ?? classKey) === classKey);

  if (configuration && isOfficialLayout(configuration)) {
    const results: Record<string, OfficialGradeResult | undefined> = {};
    for (const student of a.students) results[student.id] = live ? live[student.id] : savedGradeResult(subjectOf(student));
    await downloadOfficialGradeSheet({
      course, config: configuration, students: a.students,
      assessments: a.assessments.filter(x => String(x.classId) === classKey && x.subjectCode === cls.courseCode && x.status !== 'Archived'),
      scores: a.scores, results,
      attendanceStatus: (studentId, assessment) => a.attendanceRecords.find(record => String(record.classId) === classKey
        && record.studentId === studentId && record.date === assessment.attendanceSessionDate && record.sessionCode === assessment.attendanceSessionCode)?.status,
    });
    return;
  }

  const periodMode = configuration?.schemaMode === 'periods'
    || Object.values(live ?? {}).some(isPeriodComputeResult)
    || a.students.some(s => (subjectOf(s)?.components as { calculationMode?: string } | undefined)?.calculationMode === 'authoritative_periods');
  await downloadXlsx(`${cls.courseCode.replace(/\s+/g, '')}_Grade_Summary.xlsx`, [buildGradeSummarySheet({
    students: a.students, subjectCode: cls.courseCode, periodMode, results: live ?? {}, course, by: a.by,
  })]);
}

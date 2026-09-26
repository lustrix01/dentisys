import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Download,
  Trash2,
  Users,
  Search,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from './Modal';
import { showFeedback } from './FeedbackCenter';
import {
  ParsedRosterStudent,
  parseCSVText,
  extractTextFromPDF,
  parsePDFRosterLines,
  getSampleRegistrarCSV,
} from '../utils/rosterImportHelper';
import {
  createStudentApi,
  enrollStudentsInClassApi,
  FacultyClassItem,
} from '../services/apiClient';

interface RosterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: FacultyClassItem[];
  defaultClassId?: number;
  existingStudentIds?: Set<string>;
  onSuccess: () => Promise<void>;
}

export const RosterImportModal: React.FC<RosterImportModalProps> = ({
  isOpen,
  onClose,
  classes,
  defaultClassId,
  existingStudentIds = new Set(),
  onSuccess,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<number>(defaultClassId || classes[0]?.csId || 0);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedStudents, setParsedStudents] = useState<ParsedRosterStudent[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter out historical classes
  const activeClasses = classes.filter(c => !c.schoolYear?.includes('2024') && c.status === 'Active');
  const availableClasses = activeClasses.length > 0 ? activeClasses : classes;

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParsedStudents([]);

    try {
      const fileName = selectedFile.name.toLowerCase();

      if (fileName.endsWith('.pdf')) {
        const buffer = await selectedFile.arrayBuffer();
        const extractedLines = await extractTextFromPDF(buffer);
        const parsed = parsePDFRosterLines(extractedLines, existingStudentIds);

        if (parsed.length === 0) {
          showFeedback('No student records could be detected in this PDF. Please verify it is a registrar master list, or export to CSV.', 'error');
        } else {
          setParsedStudents(parsed);
          showFeedback(`Parsed ${parsed.length} student record(s) from PDF registrar list!`, 'success');
        }
      } else {
        // CSV / TSV / TXT
        const text = await selectedFile.text();
        const parsed = parseCSVText(text, existingStudentIds);

        if (parsed.length === 0) {
          showFeedback('No student records found in the uploaded file.', 'error');
        } else {
          setParsedStudents(parsed);
          showFeedback(`Parsed ${parsed.length} student record(s) from CSV!`, 'success');
        }
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      showFeedback(`Failed to parse file: ${err.message || 'Unknown format'}`, 'error');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDownloadSample = () => {
    const csvContent = getSampleRegistrarCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'dentisys_registrar_roster_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRemoveStudent = (tempKey: string) => {
    setParsedStudents(prev => prev.filter(s => s.tempKey !== tempKey));
  };

  const handleUpdateStudentField = (tempKey: string, field: keyof ParsedRosterStudent, value: any) => {
    setParsedStudents(prev => prev.map(s => {
      if (s.tempKey !== tempKey) return s;
      const updated = { ...s, [field]: value };
      if (!updated.studentId || !updated.firstName || !updated.lastName) {
        updated.status = 'error';
        updated.validationMessage = 'Missing required field';
      } else {
        updated.status = 'valid';
        updated.validationMessage = undefined;
      }
      return updated;
    }));
  };

  const handleExecuteImport = async () => {
    if (!selectedClassId || selectedClassId <= 0) {
      showFeedback('Please select a target class section to import students into.', 'error');
      return;
    }

    const validStudents = parsedStudents.filter(s => s.status !== 'error');
    if (validStudents.length === 0) {
      showFeedback('No valid students to import. Please check for errors in the preview list.', 'error');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < validStudents.length; i++) {
      const student = validStudents[i];
      setImportProgress({
        current: i + 1,
        total: validStudents.length,
        name: `${student.firstName} ${student.lastName} (${student.studentId})`,
      });

      try {
        // Attempt to create student with classId attached
        await createStudentApi({
          studentId: student.studentId,
          prefix: student.prefix,
          suffix: student.suffix,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          email: student.email,
          yearLevel: student.yearLevel,
          sex: student.sex,
          classId: String(selectedClassId),
        });
        successCount++;
      } catch (createErr: any) {
        // If student already exists in database, fall back to enroll API
        if (createErr.status === 409 || createErr.message?.includes('already exists') || student.isExistingInDirectory) {
          try {
            const sid = Number(student.studentId);
            if (!isNaN(sid) && sid > 0) {
              await enrollStudentsInClassApi({
                csId: selectedClassId,
                studentIds: [sid],
              });
              successCount++;
            } else {
              throw new Error('Numeric student database ID required for enrollment');
            }
          } catch (enrollErr: any) {
            failCount++;
            errors.push(`${student.studentId}: ${enrollErr.message || 'Enrollment failed'}`);
          }
        } else {
          failCount++;
          errors.push(`${student.studentId}: ${createErr.message || 'Creation failed'}`);
        }
      }
    }

    setIsImporting(false);
    setImportProgress(null);

    if (successCount > 0) {
      showFeedback(`Successfully imported and enrolled ${successCount} student(s)!`, 'success');
      await onSuccess();
      onClose();
    } else {
      showFeedback(`Failed to import students. ${errors.slice(0, 2).join('; ')}`, 'error');
    }
  };

  const filteredPreview = parsedStudents.filter(s => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      s.studentId.toLowerCase().includes(q) ||
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isImporting) onClose();
      }}
      title="Import Student Roster from Registrar (CSV or PDF)"
    >
      <div className="space-y-5 text-xs max-h-[80vh] overflow-y-auto pr-1">
        {/* Step 1: Target Class Section */}
        <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 space-y-2">
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Target Class Section *
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
            disabled={isImporting}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            {availableClasses.map(c => (
              <option key={c.csId} value={c.csId}>
                {c.courseCode} - {c.courseName} ({c.block})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400">
            Imported students will be registered in the institution and immediately enrolled into this class section.
          </p>
        </div>

        {/* Step 2: File Upload Zone */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Registrar File (.csv, .tsv, .pdf)
            </span>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Sample CSV
            </button>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/40 dark:bg-slate-900/30 transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
            />

            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  {file ? file.name : 'Click to select or drag & drop registrar file'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Supports official Bicol University Registrar PDF rosters, CSV, and TSV spreadsheets
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Spinner during parse */}
        {isParsing && (
          <div className="p-6 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
            <p className="font-bold text-xs">Extracting and analyzing registrar student records...</p>
          </div>
        )}

        {/* Step 3: Parsed Results Preview */}
        {!isParsing && parsedStudents.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">
                  Parsed Students ({parsedStudents.length})
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                  {parsedStudents.filter(s => s.status === 'valid').length} Ready
                </span>
              </div>

              <div className="relative w-full sm:w-52">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5">Student ID</th>
                    <th className="p-2.5">Full Name</th>
                    <th className="p-2.5">Email</th>
                    <th className="p-2.5 text-center">Yr</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPreview.map((st) => (
                    <tr key={st.tempKey} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                        <input
                          type="text"
                          value={st.studentId}
                          onChange={(e) => handleUpdateStudentField(st.tempKey, 'studentId', e.target.value)}
                          className="w-28 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-xs"
                        />
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={st.firstName}
                            placeholder="First"
                            onChange={(e) => handleUpdateStudentField(st.tempKey, 'firstName', e.target.value)}
                            className="w-24 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-xs"
                          />
                          <input
                            type="text"
                            value={st.lastName}
                            placeholder="Last"
                            onChange={(e) => handleUpdateStudentField(st.tempKey, 'lastName', e.target.value)}
                            className="w-24 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-xs"
                          />
                        </div>
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={st.email}
                          onChange={(e) => handleUpdateStudentField(st.tempKey, 'email', e.target.value)}
                          className="w-44 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          min="1"
                          max="6"
                          value={st.yearLevel}
                          onChange={(e) => handleUpdateStudentField(st.tempKey, 'yearLevel', parseInt(e.target.value, 10) || 4)}
                          className="w-12 px-1 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-bold text-xs"
                        />
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveStudent(st.tempKey)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Progress Bar during import */}
        {isImporting && importProgress && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-200">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Importing: {importProgress.name}
              </span>
              <span>
                {importProgress.current} / {importProgress.total}
              </span>
            </div>
            <div className="w-full bg-emerald-200/60 dark:bg-emerald-900/60 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 transition-all duration-200"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={isImporting || isParsing || parsedStudents.length === 0 || !selectedClassId}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isImporting
                ? `Importing (${importProgress?.current || 0}/${importProgress?.total || 0})...`
                : `Confirm & Import (${parsedStudents.filter(s => s.status === 'valid').length}) Students`}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

import React, { useState } from 'react';
import {
  BookOpenCheck,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Save,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { recordAudit } from '../../services/auditService';

interface RetentionCriterion {
  id: string;
  name: string;
  description: string;
  minGrade: number;
  minAttendance: number;
  maxRemedialSubjects: number;
  appliesToClinical: boolean;
  enabled: boolean;
  lastUpdated: string;
  updatedBy: string;
}

const defaultCriteria: RetentionCriterion[] = [
  {
    id: 'RC-001',
    name: 'Standard Clinical Retention',
    description: 'Primary threshold for all Year 3–4 clinical rotations. Students failing this are flagged for warning.',
    minGrade: 2.5,
    minAttendance: 80,
    maxRemedialSubjects: 1,
    appliesToClinical: true,
    enabled: true,
    lastUpdated: '2026-06-01',
    updatedBy: 'admin@bicol-u.edu.ph',
  },
  {
    id: 'RC-002',
    name: 'Didactic Course Standard',
    description: 'Applies to non-clinical lecture and lab courses. Slightly relaxed compared to clinical standard.',
    minGrade: 3.0,
    minAttendance: 75,
    maxRemedialSubjects: 2,
    appliesToClinical: false,
    enabled: true,
    lastUpdated: '2026-05-15',
    updatedBy: 'admin@bicol-u.edu.ph',
  },
  {
    id: 'RC-003',
    name: 'Probationary Watch Policy',
    description: 'Applies to students with multiple failing clinical subjects — triggers mandatory intervention.',
    minGrade: 2.0,
    minAttendance: 85,
    maxRemedialSubjects: 0,
    appliesToClinical: true,
    enabled: false,
    lastUpdated: '2026-04-20',
    updatedBy: 'admin@bicol-u.edu.ph',
  },
];

const emptyForm = (): Omit<RetentionCriterion, 'id' | 'lastUpdated' | 'updatedBy'> => ({
  name: '',
  description: '',
  minGrade: 2.5,
  minAttendance: 80,
  maxRemedialSubjects: 1,
  appliesToClinical: true,
  enabled: true,
});

export const RetentionCriteria: React.FC = () => {
  const { settings, updateSettings } = useApp();

  const userStr = localStorage.getItem('dentisys_user');
  const currentUser = userStr ? JSON.parse(userStr) : { email: 'admin@bicol-u.edu.ph', role: 'admin' };

  if (currentUser.role !== 'admin') {
    return <div className="p-8 text-rose-600 font-bold">Access Denied. Dean access only.</div>;
  }

  const [criteria, setCriteria] = useState<RetentionCriterion[]>(defaultCriteria);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RetentionCriterion | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // ── Validation ──────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Criterion name is required.';
    if (form.minGrade < 1.0 || form.minGrade > 5.0) e.minGrade = 'Grade must be between 1.0 and 5.0.';
    if (form.minAttendance < 0 || form.minAttendance > 100) e.minAttendance = 'Attendance must be 0–100%.';
    if (form.maxRemedialSubjects < 0) e.maxRemedialSubjects = 'Must be 0 or more.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setErrors({});
    setIsModalOpen(true);
  };

  const openEdit = (c: RetentionCriterion) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description,
      minGrade: c.minGrade,
      minAttendance: c.minAttendance,
      maxRemedialSubjects: c.maxRemedialSubjects,
      appliesToClinical: c.appliesToClinical,
      enabled: c.enabled,
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    recordAudit({ action: editingId ? 'Updated retention criterion' : 'Created retention criterion', module: 'Retention Criteria', description: `${editingId ? 'Updated' : 'Created'} retention criterion ${form.name}.`, status: 'Success' });
    if (!validate()) return;
    const now = new Date().toISOString().split('T')[0];

    if (editingId) {
      setCriteria(prev =>
        prev.map(c => c.id === editingId
          ? { ...c, ...form, lastUpdated: now, updatedBy: currentUser.email }
          : c
        )
      );
      // If this is the enabled criterion, sync the system threshold
      const target = criteria.find(c => c.id === editingId);
      if (target?.enabled && form.enabled) {
        updateSettings({ ...settings, retentionThreshold: form.minGrade });
      }
    } else {
      const newId = `RC-${String(criteria.length + 1).padStart(3, '0')}`;
      const newCriterion: RetentionCriterion = {
        id: newId,
        ...form,
        lastUpdated: now,
        updatedBy: currentUser.email,
      };
      setCriteria(prev => [...prev, newCriterion]);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setIsModalOpen(false);
  };

  const toggleEnabled = (id: string) => {
    const updated = criteria.map(c =>
      c.id === id ? { ...c, enabled: !c.enabled, lastUpdated: new Date().toISOString().split('T')[0], updatedBy: currentUser.email } : c
    );
    setCriteria(updated);
    // Sync system threshold from the first enabled clinical criterion
    const activeClinical = updated.find(c => c.enabled && c.appliesToClinical);
    if (activeClinical) {
      updateSettings({ ...settings, retentionThreshold: activeClinical.minGrade });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    recordAudit({ action: 'Deleted retention criterion', module: 'Retention Criteria', description: `Deleted retention criterion ${deleteTarget.name}.`, status: 'Warning' });
    setCriteria(prev => prev.filter(c => c.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-[10px] text-rose-500 mt-1 font-semibold">{errors[field]}</p> : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BookOpenCheck className="w-6 h-6 text-amber-500" />
            Retention Criteria Management
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Define and manage academic retention policies. Active criteria are applied system-wide.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer mt-3 sm:mt-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Criterion
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold animate-fade-in">
          <CheckCircle2 className="w-4 h-4" />
          Criterion saved successfully. System threshold updated.
        </div>
      )}

      {/* Info Banner */}
      <div className="flex items-start gap-3 px-5 py-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-800/40 text-xs text-sky-700 dark:text-sky-400">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">How criteria work:</span>
          Enable at least one clinical criterion to set the system's active retention threshold.
          Students whose clinical subject grade exceeds the <em>Minimum Grade</em> are automatically flagged in the Retention Monitoring module.
        </div>
      </div>

      {/* Criteria List */}
      <div className="space-y-4">
        {criteria.map(c => (
          <Card key={c.id} className={`border-l-4 transition-all ${c.enabled ? 'border-l-accent-500' : 'border-l-slate-300 dark:border-l-slate-700 opacity-70'}`}>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1.5">
                    <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">{c.name}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{c.id}</span>
                    {c.appliesToClinical ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-400">Clinical</span>
                    ) : (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400">Didactic</span>
                    )}
                    {c.enabled ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">Active</span>
                    ) : (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400">Disabled</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">{c.description}</p>

                  {/* Metric chips */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Min Grade</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">{c.minGrade.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Min Attendance</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">{c.minAttendance}%</span>
                    </div>
                    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Max Remedial</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">{c.maxRemedialSubjects} subj.</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 font-mono mt-3">Last updated {c.lastUpdated} by {c.updatedBy}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleEnabled(c.id)}
                    title={c.enabled ? 'Disable criterion' : 'Enable criterion'}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${c.enabled ? 'bg-emerald-50 hover:bg-rose-50 text-emerald-600 hover:text-rose-600 dark:bg-emerald-950/20 dark:hover:bg-rose-950/20' : 'bg-slate-100 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 dark:bg-slate-800 dark:hover:bg-emerald-950/20'}`}
                  >
                    {c.enabled ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-accent-50 text-slate-500 hover:text-accent-600 dark:bg-slate-800 dark:hover:bg-accent-950/20 transition-colors cursor-pointer"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {criteria.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <BookOpenCheck className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-bold text-sm">No criteria defined yet.</p>
            <p className="text-xs mt-1">Click "Add Criterion" above to create your first retention policy.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Edit Retention Criterion' : 'New Retention Criterion'}>
         <form onSubmit={handleSave} className="space-y-4 p-1">

           <div>
             <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Criterion Name *</label>
             <input
               type="text"
               value={form.name}
               onChange={e => setForm({ ...form, name: e.target.value })}
               placeholder="e.g. Standard Clinical Retention"
               className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
             />
             <FieldError field="name" />
           </div>

           <div>
             <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Description / Remarks</label>
             <textarea
               rows={2}
               value={form.description}
               onChange={e => setForm({ ...form, description: e.target.value })}
               placeholder="Describe when and how this criterion applies..."
               className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500 resize-none"
             />
           </div>

           <div className="grid grid-cols-3 gap-3">
             <div>
               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Min Grade (1.0–5.0) *</label>
               <input
                 type="number"
                 min={1.0} max={5.0} step={0.25}
                 value={form.minGrade}
                 onChange={e => setForm({ ...form, minGrade: parseFloat(e.target.value) })}
                 className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
               />
               <FieldError field="minGrade" />
             </div>
             <div>
               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Min Attendance % *</label>
               <input
                 type="number"
                 min={0} max={100}
                 value={form.minAttendance}
                 onChange={e => setForm({ ...form, minAttendance: parseInt(e.target.value) })}
                 className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
               />
               <FieldError field="minAttendance" />
             </div>
             <div>
               <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Max Remedial Subjects *</label>
               <input
                 type="number"
                 min={0}
                 value={form.maxRemedialSubjects}
                 onChange={e => setForm({ ...form, maxRemedialSubjects: parseInt(e.target.value) })}
                 className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
               />
               <FieldError field="maxRemedialSubjects" />
             </div>
           </div>

           <div className="flex flex-col sm:flex-row gap-4">
             <label className="flex items-center gap-2 cursor-pointer">
               <input
                 type="checkbox"
                 checked={form.appliesToClinical}
                 onChange={e => setForm({ ...form, appliesToClinical: e.target.checked })}
                 className="w-4 h-4 rounded accent-accent-600 focus:ring-0"
               />
               <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Applies to Clinical subjects</span>
             </label>
             <label className="flex items-center gap-2 cursor-pointer">
               <input
                 type="checkbox"
                 checked={form.enabled}
                 onChange={e => setForm({ ...form, enabled: e.target.checked })}
                 className="w-4 h-4 rounded accent-accent-600 focus:ring-0"
               />
               <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Enabled (active system-wide)</span>
             </label>
           </div>

           <div className="flex gap-3 pt-2">
             <button
               type="submit"
               className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold text-xs transition-all shadow-md cursor-pointer"
             >
               <Save className="w-3.5 h-3.5" />
               {editingId ? 'Update Criterion' : 'Save Criterion'}
             </button>
             <button
               type="button"
               onClick={() => setIsModalOpen(false)}
               className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-650 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 font-bold text-xs transition-all cursor-pointer"
             >
               <X className="w-4 h-4" />
             </button>
           </div>
         </form>
       </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Criterion">
        <div className="space-y-4 p-1">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40">
            <Trash2 className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-400">Permanently delete this criterion?</p>
              <p className="text-xs text-rose-600 dark:text-rose-400/80 mt-1">
                <strong>{deleteTarget?.name}</strong> will be removed. This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all cursor-pointer"
            >
              Yes, Delete Permanently
            </button>
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

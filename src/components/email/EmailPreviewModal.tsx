import React from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import { Modal } from '../Modal';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'consent' | 'risk';
  recipientName: string;
  facultyName: string;
  academicSummary?: string;
  subjectsOfConcern?: string;
  onConsentAction?: (action: 'approved' | 'declined') => void;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({ isOpen, onClose, type, recipientName, facultyName, academicSummary, subjectsOfConcern, onConsentAction }) => {
  const consent = type === 'consent';
  return <Modal isOpen={isOpen} onClose={onClose} title="Email Preview" size="lg">
    <article className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-sm">
      <div className="p-5 bg-clinical-50/70 dark:bg-clinical-950/30 border-b border-slate-200 dark:border-slate-800 flex gap-3">
        {consent ? <ShieldCheck className="w-5 h-5 text-clinical-600" /> : <Mail className="w-5 h-5 text-clinical-600" />}
        <div><p className="font-bold text-slate-800 dark:text-slate-100">{consent ? 'Privacy Consent for Facial Recognition' : 'Academic Support & At-Risk Notification'}</p><p className="text-xs text-slate-500">To: {recipientName}</p></div>
      </div>
      <div className="p-6 space-y-4 text-slate-600 dark:text-slate-300 leading-relaxed">
        <p>Dear {recipientName},</p>
        {consent ? <>
          <p>We are requesting your consent to enroll you in DentiSys facial recognition for secure attendance verification. Your facial data will be collected as encrypted facial templates, stored securely, and used only for attendance-related identity verification.</p>
          <p>This processing follows the Philippine Data Privacy Act of 2012 (RA 10173). Please review and indicate your voluntary decision before any facial enrollment takes place.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={() => onConsentAction?.('approved')} className="px-4 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs">Approve consent</button>
            <button onClick={() => onConsentAction?.('declined')} className="px-4 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs">Decline</button>
          </div>
        </> : <>
          <p>Your current academic standing requires attention: <strong>{academicSummary || 'At-risk retention standing'}</strong>.</p>
          <p><strong>Subjects of concern:</strong> {subjectsOfConcern || 'Please consult your faculty member for details.'}</p>
          <p>We encourage you to arrange a consultation, attend available remedial classes, and seek academic advising so we can develop an appropriate support plan together.</p>
        </>}
        <p>Regards,<br /><strong>{facultyName}</strong><br />Faculty, BU College of Dental Medicine<br />faculty@dentisys.edu</p>
      </div>
    </article>
  </Modal>;
};

import React, { useState } from 'react';
import { Mail, Briefcase, CheckCircle2, XCircle, GraduationCap, Calendar, Clock, Copy, Check, BookOpen } from 'lucide-react';
import { Modal } from '../Modal';

export type EmailPreviewType =
  | 'class_invitation'
  | 'student_invitation'
  | 'consent'
  | 'risk'
  | 'secretary'
  | 'faculty_approval'
  | 'faculty_rejection';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: EmailPreviewType;
  recipientName: string;
  recipientEmail?: string;
  facultyName?: string;
  academicSummary?: string;
  subjectsOfConcern?: string;
  className?: string;
  schoolYear?: string;
  invitationLink?: string;
  onConsentAction?: (action: 'approved' | 'declined') => void;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({
  isOpen,
  onClose,
  type,
  recipientName,
  recipientEmail,
  facultyName = 'Dr. Eleanor Vance, DMD',
  academicSummary,
  subjectsOfConcern,
  className = 'Clinical Dentistry IV',
  schoolYear = '2026-2027',
  invitationLink,
}) => {
  const [copied, setCopied] = useState(false);

  const effectiveInvitationLink = invitationLink
    || 'https://dentisys.bicol-u.edu.ph/activate-student?token=inv_sample_activation_token_preview';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(effectiveInvitationLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSubjectAndMeta = () => {
    switch (type) {
      case 'class_invitation':
      case 'student_invitation':
      case 'consent':
        return {
          title: 'Class Invitation & Student Account Activation',
          subject: 'DentiSys Student Invitation',
          sender: `${facultyName} via DentiSys Portal`,
          senderEmail: 'notifications@dentisys.bicol-u.edu.ph',
          icon: GraduationCap,
          badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
        };
      case 'secretary':
        return {
          title: 'Class Secretary Appointment Invitation',
          subject: `Invitation: Class Secretary Appointment for ${className || 'Section'}`,
          sender: `${facultyName} via DentiSys Portal`,
          senderEmail: 'secretary-admin@dentisys.bicol-u.edu.ph',
          icon: Briefcase,
          badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
        };
      case 'faculty_approval':
        return {
          title: 'Faculty Registration Approved',
          subject: 'Account Approved: Welcome to DentiSys Faculty Portal',
          sender: 'Office of the Dean, BU College of Dental Medicine',
          senderEmail: 'dean.dental@bicol-u.edu.ph',
          icon: CheckCircle2,
          badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
        };
      case 'faculty_rejection':
        return {
          title: 'Faculty Registration Update',
          subject: 'Registration Update: DentiSys Faculty Account',
          sender: 'Office of the Dean, BU College of Dental Medicine',
          senderEmail: 'dean.dental@bicol-u.edu.ph',
          icon: XCircle,
          badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
        };
      case 'risk':
      default:
        return {
          title: 'Academic Retention Standing Notification',
          subject: `Urgent: Academic Performance Advisory (S.Y. ${schoolYear})`,
          sender: `${facultyName} (Faculty Advisory)`,
          senderEmail: 'retention@dentisys.bicol-u.edu.ph',
          icon: Mail,
          badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
        };
    }
  };

  const meta = getSubjectAndMeta();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Email Message Preview" size="lg">
      <div className="space-y-4">
        {/* Email Metadata Envelope Header */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-3.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Email preview</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              HTML email
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 w-14 font-mono uppercase text-[10px]">From:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{meta.sender}</span>
              <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">&lt;{meta.senderEmail}&gt;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 w-14 font-mono uppercase text-[10px]">To:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{recipientName}</span>
              {recipientEmail && <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">&lt;{recipientEmail}&gt;</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 w-14 font-mono uppercase text-[10px]">Subject:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{meta.subject}</span>
            </div>
          </div>
        </div>

        {/* Email HTML Body Canvas */}
        <article className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
          <div className="border-b-[3px] border-emerald-800 p-5 text-left">
            <p className="text-xs text-slate-600 dark:text-slate-400">Bicol University - College of Dental Medicine</p>
            <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">DentiSys Academic Portal</h2>
          </div>
          {/* Email Body Content */}
          <div className="p-6 sm:p-7 space-y-5 text-slate-700 dark:text-slate-300 text-sm font-sans">
            {(type === 'class_invitation' || type === 'student_invitation' || type === 'consent') && (
              <>
                {/* Hero Invitation Message */}
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                    Hello {recipientName},
                  </p>
                  <p className="leading-relaxed">
                    <strong>{facultyName}</strong> invited you to join <strong>{className || 'Clinical Dentistry'}</strong> on DentiSys.
                  </p>
                </div>

                {/* Class Invitation Card */}
                <div className="border-l-4 border-emerald-700 bg-slate-50 dark:bg-slate-900 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Class Invitation Details
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
                    <div className="space-y-0.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-slate-400" /> Class
                      </span>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        {className || 'Section 4-A'}
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" /> School year
                      </span>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        S.Y. {schoolYear}
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Faculty
                      </span>
                      <p className="font-bold text-slate-800 dark:text-slate-100">
                        {facultyName}
                      </p>
                    </div>
                </div>
                </div>

                {/* Explanation & Action CTA */}
                <div className="space-y-3">
                  <p className="leading-relaxed">
                    Accept the invitation to set your password and join the class.
                  </p>

                  <div className="py-2 text-center sm:text-left">
                    <a
                      href={invitationLink || '#'}
                      onClick={(e) => { e.preventDefault(); }}
                      className="inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm transition-colors cursor-pointer"
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Accept invitation</span>
                    </a>
                  </div>
                </div>

                {/* Alternative Direct Link */}
                <div className="space-y-1.5 pt-2">
                  <p className="text-[11px] text-slate-500">
                    If the button does not work, open this link:
                  </p>
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate flex-1 select-all">
                      {effectiveInvitationLink}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold hover:bg-slate-100 flex items-center gap-1 cursor-pointer flex-shrink-0"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Notice / Expiration warning */}
                <div className="flex items-start gap-2.5 p-3 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-sm">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p>
                    This invitation link is for your institutional email address and expires in <strong>7 days</strong>. If you were not expecting it, contact your Faculty instructor.
                  </p>
                </div>
              </>
            )}

            {type === 'risk' && (
              <>
                <p>Dear {recipientName},</p>
                <p>
                  Your current standing in <strong>{className || 'Dental Course'}</strong> requires advising: <strong>{academicSummary || 'At-Risk Academic Standing'}</strong>.
                </p>
                <p>
                  <strong>Specific Subjects / Procedures of Concern:</strong><br />
                  {subjectsOfConcern || 'Please consult your faculty instructor for details regarding clinical case backlogs.'}
                </p>
                <p>
                  Please contact {facultyName} to discuss next steps and available advising.
                </p>
              </>
            )}

            {type === 'secretary' && (
              <>
                <p>Dear {recipientName},</p>
                <p>
                  <strong>{facultyName}</strong> invited you to serve as Class Secretary for <strong>{className}</strong> (S.Y. {schoolYear}).
                </p>
                <p>
                  You will help with attendance and clinic logs. Use the link below to accept and activate your account.
                </p>
                <div className="p-3 rounded-xl font-mono text-xs break-all border bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-300">
                  {effectiveInvitationLink}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Notice: This invitation link is valid for 7 days from issuance.
                </p>
              </>
            )}

            {type === 'faculty_approval' && (
              <>
                <p>Dear Dr. {recipientName},</p>
                <p>
                  The Office of the Dean approved your Faculty account request.
                </p>
                <p>
                  You can now sign in to view your assigned classes and rosters.
                </p>
              </>
            )}

            {type === 'faculty_rejection' && (
              <>
                <p>Dear {recipientName},</p>
                <p>
                  The Office of the Dean reviewed your Faculty account request.
                </p>
                <p>
                  Your request could not be approved at this time. Please contact the Office of the Dean if you have questions.
                </p>
              </>
            )}

            {/* Email Signature & Institutional Footer */}
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {type === 'faculty_approval' || type === 'faculty_rejection'
                  ? 'Office of the Dean'
                  : facultyName}
              </p>
              <p>Bicol University College of Dental Medicine</p>
            </div>
          </div>
        </article>
      </div>
    </Modal>
  );
};

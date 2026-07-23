import React from 'react';
import { Mail, ShieldCheck, Briefcase, CheckCircle2, XCircle } from 'lucide-react';
import { Modal } from '../Modal';

export type EmailPreviewType =
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
  facultyName?: string;
  academicSummary?: string;
  subjectsOfConcern?: string;
  className?: string;
  invitationLink?: string;
  onConsentAction?: (action: 'approved' | 'declined') => void;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({
  isOpen,
  onClose,
  type,
  recipientName,
  facultyName = 'Dr. Eleanor Vance',
  academicSummary,
  subjectsOfConcern,
  className = '',
  invitationLink,
  onConsentAction,
}) => {
  const effectiveInvitationLink = invitationLink
    || 'Invitation link will be generated after the server issues the invitation.';
  const getHeader = () => {
    switch (type) {
      case 'consent':
        return {
          title: 'Privacy Consent for Facial Recognition',
          icon: ShieldCheck,
          color: 'text-clinical-600',
        };
      case 'secretary':
        return {
          title: 'Class Secretary Appointment Invitation',
          icon: Briefcase,
          color: 'text-blue-600',
        };
      case 'faculty_approval':
        return {
          title: 'Faculty Registration Approved - DentiSys Access',
          icon: CheckCircle2,
          color: 'text-emerald-600',
        };
      case 'faculty_rejection':
        return {
          title: 'Faculty Registration Update - DentiSys',
          icon: XCircle,
          color: 'text-rose-600',
        };
      case 'risk':
      default:
        return {
          title: 'Academic Support & At-Risk Notification',
          icon: Mail,
          color: 'text-clinical-600',
        };
    }
  };

  const header = getHeader();
  const IconComponent = header.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Email Content Preview" size="lg">
      <article className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-sm">
        {/* Email Header */}
        <div className="p-5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <IconComponent className={`w-5 h-5 ${header.color}`} />
          </div>
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">{header.title}</p>
            <p className="text-xs text-slate-500">To: {recipientName}</p>
          </div>
        </div>

        {/* Email Body */}
        <div className="p-6 space-y-4 text-slate-600 dark:text-slate-300 leading-relaxed text-xs sm:text-sm">
          <p>Dear {recipientName},</p>

          {type === 'consent' && (
            <>
              <p>
                We are requesting your formal privacy consent to enroll your facial data in the DentiSys Automated Attendance & Verification System. Your facial biometric templates will be encrypted, stored securely, and used strictly for identity verification during clinical rotations.
              </p>
              <p>
                This process complies with Republic Act No. 10173 (Philippine Data Privacy Act of 2012). Please review and submit your voluntary consent response below.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => onConsentAction?.('approved')}
                  className="px-4 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs"
                >
                  Approve consent
                </button>
                <button
                  onClick={() => onConsentAction?.('declined')}
                  className="px-4 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs"
                >
                  Decline
                </button>
              </div>
            </>
          )}

          {type === 'risk' && (
            <>
              <p>
                This notice is to inform you that your current academic standing requires attention: <strong>{academicSummary || 'At-risk retention standing'}</strong>.
              </p>
              <p>
                <strong>Subjects of concern:</strong> {subjectsOfConcern || 'Please consult your faculty member for details.'}
              </p>
              <p>
                We encourage you to schedule an academic advising session with your faculty instructor as soon as possible to discuss available remedial exam schedules and support plans.
              </p>
            </>
          )}

          {type === 'secretary' && (
            <>
              <p>
                You have been officially invited by <strong>{facultyName}</strong> to serve as the <strong>Class Secretary</strong> for <strong>{className}</strong> at the Bicol University College of Dental Medicine.
              </p>
              <p>
                As Class Secretary, you will assist in attendance monitoring and clinic log overrides. To accept this appointment and set up your account password, please open your activation link below:
              </p>
              <div className={`p-3 rounded-xl font-mono text-xs break-all border ${
                invitationLink
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-300'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 italic'
              }`}>
                {effectiveInvitationLink}
              </div>
              <p className="text-xs text-slate-400 italic">
                Notice: This invitation link is valid for 7 days from issuance.
              </p>
            </>
          )}

          {type === 'faculty_approval' && (
            <>
              <p>
                We are pleased to inform you that your registration request for a Faculty account at DentiSys has been <strong>Approved</strong> by the Office of the Dean.
              </p>
              <p>
                You may now sign in to the DentiSys portal using your official Bicol University email address and your password.
              </p>
            </>
          )}

          {type === 'faculty_rejection' && (
            <>
              <p>
                Thank you for your interest in registering for a Faculty account on DentiSys.
              </p>
              <p>
                After reviewing your registration request, the Office of the Dean was unable to approve your account at this time. If you believe this is in error, please contact the Office of the Dean or system support.
              </p>
            </>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500">
              Regards,<br />
              <strong className="text-slate-800 dark:text-slate-200">{type === 'faculty_approval' || type === 'faculty_rejection' ? 'Dr. Marcus Aurelius (Office of the Dean)' : facultyName}</strong><br />
              BU College of Dental Medicine · DentiSys System Communications
            </p>
          </div>
        </div>
      </article>
    </Modal>
  );
};

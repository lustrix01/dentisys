import React, { useState } from 'react';
import { Mail, Briefcase, CheckCircle2, XCircle, GraduationCap, Calendar, Clock, ArrowRight, Copy, Check, BookOpen, Building2 } from 'lucide-react';
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
          subject: `Class Invitation: Join ${className || 'Dental Course'} (S.Y. ${schoolYear})`,
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
  const IconComponent = meta.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Email Message Preview" size="lg">
      <div className="space-y-4">
        {/* Email Metadata Envelope Header */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-3.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${meta.badgeColor}`}>
              Simulated Outbox Message
            </span>
            <span className="text-[11px] text-slate-400">
              Format: Official HTML Email
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-14 font-mono uppercase text-[10px]">From:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{meta.sender}</span>
              <span className="text-slate-400 font-mono text-[10px]">&lt;{meta.senderEmail}&gt;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-14 font-mono uppercase text-[10px]">To:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{recipientName}</span>
              {recipientEmail && <span className="text-slate-400 font-mono text-[10px]">&lt;{recipientEmail}&gt;</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-14 font-mono uppercase text-[10px]">Subject:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{meta.subject}</span>
            </div>
          </div>
        </div>

        {/* Email HTML Body Canvas */}
        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-xs">
          {/* Institutional Header Banner */}
          <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 text-white p-5 sm:p-6 text-center relative overflow-hidden">
            <div className="relative z-10 space-y-1">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 shadow-inner mb-1">
                <IconComponent className="w-6 h-6 text-white" />
              </div>
              <p className="text-[10px] sm:text-[11px] font-bold tracking-widest uppercase text-emerald-200">
                Bicol University · College of Dental Medicine
              </p>
              <h2 className="text-lg sm:text-xl font-extrabold font-heading text-white">
                DentiSys Academic Portal
              </h2>
            </div>
          </div>

          {/* Email Body Content */}
          <div className="p-6 sm:p-8 space-y-6 text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
            {(type === 'class_invitation' || type === 'student_invitation' || type === 'consent') && (
              <>
                {/* Hero Invitation Message */}
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                    Hello {recipientName},
                  </p>
                  <p className="leading-relaxed">
                    You have been invited by your instructor, <strong>{facultyName}</strong>, to join the official class roster for <strong>{className || 'Clinical Dentistry'}</strong> on DentiSys for <strong>Academic Year {schoolYear}</strong>.
                  </p>
                </div>

                {/* Class Invitation Card */}
                <div className="rounded-2xl border-2 border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Class Invitation Details
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
                      Enrolled Roster
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-slate-400" /> Class Section / Course
                      </span>
                      <p className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                        {className || 'Section 4-A'}
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" /> Academic School Year
                      </span>
                      <p className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                        S.Y. {schoolYear}
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Course Faculty Instructor
                      </span>
                      <p className="font-bold text-slate-800 dark:text-slate-100">
                        {facultyName}
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" /> Department / College
                      </span>
                      <p className="font-bold text-slate-800 dark:text-slate-100">
                        BU College of Dental Medicine
                      </p>
                    </div>
                  </div>
                </div>

                {/* Explanation & Action CTA */}
                <div className="space-y-3">
                  <p className="leading-relaxed">
                    To activate your student account, confirm your class membership, and access clinical requirements, attendance logs, and academic assessments, please click the button below:
                  </p>

                  <div className="py-2 text-center sm:text-left">
                    <a
                      href={invitationLink || '#'}
                      onClick={(e) => { e.preventDefault(); }}
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Accept Invitation & Join Class</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Alternative Direct Link */}
                <div className="space-y-1.5 pt-2">
                  <p className="text-[11px] text-slate-500">
                    If the button above does not work, copy and paste this activation URL into your browser:
                  </p>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate flex-1 select-all">
                      {effectiveInvitationLink}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold hover:bg-slate-100 flex items-center gap-1 cursor-pointer flex-shrink-0"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Notice / Expiration warning */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p>
                    <strong>Important:</strong> This class invitation link is unique to your institutional email address and will expire in <strong>24 hours</strong>. If you already have a registered DentiSys student account, accepting this invitation will link the new course section directly to your profile.
                  </p>
                </div>
              </>
            )}

            {type === 'risk' && (
              <>
                <p>Dear {recipientName},</p>
                <p>
                  This official academic notice is to inform you that your current standing in <strong>{className || 'Dental Course'}</strong> requires advising: <strong>{academicSummary || 'At-Risk Academic Standing'}</strong>.
                </p>
                <p>
                  <strong>Specific Subjects / Procedures of Concern:</strong><br />
                  {subjectsOfConcern || 'Please consult your faculty instructor for details regarding clinical case backlogs.'}
                </p>
                <p>
                  Please contact Dr. {facultyName} promptly during designated consultation hours to review remedial exam schedules and clinical intervention plans.
                </p>
              </>
            )}

            {type === 'secretary' && (
              <>
                <p>Dear {recipientName},</p>
                <p>
                  You have been officially invited by <strong>{facultyName}</strong> to serve as the <strong>Class Secretary</strong> for <strong>{className}</strong> (S.Y. {schoolYear}) at the Bicol University College of Dental Medicine.
                </p>
                <p>
                  As Class Secretary, you will assist in attendance monitoring and clinic log management. To accept this appointment and activate your credentials, please use the activation link below:
                </p>
                <div className="p-3 rounded-xl font-mono text-xs break-all border bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-300">
                  {effectiveInvitationLink}
                </div>
                <p className="text-xs text-slate-400 italic">
                  Notice: This invitation link is valid for 7 days from issuance.
                </p>
              </>
            )}

            {type === 'faculty_approval' && (
              <>
                <p>Dear Dr. {recipientName},</p>
                <p>
                  We are pleased to inform you that your registration for a Faculty account at DentiSys has been <strong>Approved</strong> by the Office of the Dean.
                </p>
                <p>
                  You may now sign in using your official Bicol University credentials to access your assigned rosters and clinical sections.
                </p>
              </>
            )}

            {type === 'faculty_rejection' && (
              <>
                <p>Dear {recipientName},</p>
                <p>
                  Thank you for your interest in registering for a Faculty account on DentiSys.
                </p>
                <p>
                  Following review by the Office of the Dean, your registration request could not be approved at this time. Please contact the Office of the Dean for clarification.
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
              <p className="text-[11px] text-slate-400">
                DentiSys Academic & Clinical Management System · Legazpi City, Philippines
              </p>
            </div>
          </div>
        </article>
      </div>
    </Modal>
  );
};

import React, { useState } from 'react';
import { 
  UserCircle, 
  Mail, 
  MapPin, 
  Phone, 
  Briefcase, 
  Stethoscope, 
  Clock, 
  CheckCircle,
  Save
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';

export const Profile: React.FC = () => {
  const userStr = localStorage.getItem('dentisys_user');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isSecretary = currentUser?.role === 'secretary';

  const [name, setName] = useState(currentUser?.name || 'Dr. Eleanor Vance, DDM, MS');
  const [email, setEmail] = useState(currentUser?.email || 'eleanor.vance@dentisys.edu');
  const [phone, setPhone] = useState('+63 (917) 542-8910');
  const [office, setOffice] = useState(currentUser?.classroomName || 'Dental Clinic B, Room 402');
  const [specialty, setSpecialty] = useState(
    currentUser?.role === 'admin' 
      ? 'System Administration & Database Systems' 
      : currentUser?.role === 'secretary'
      ? 'Class Attendance & Room Monitoring'
      : 'Endodontics & Restorative Dentistry'
  );

  const getInitials = (fullName: string) => {
    if (!fullName) return 'U';
    const parts = fullName.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss)\s+/i, '').split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0] ? parts[0][0].toUpperCase() : 'U';
  };

  const initials = getInitials(name);
  
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const teachingSchedules = currentUser?.role === 'secretary'
    ? [
        { day: 'Mon & Wed', time: '8:00 AM - 11:00 AM', course: 'CLIN401 - Clinical Dentistry I' },
        { day: 'Tue & Thu', time: '1:00 PM - 4:00 PM', course: 'CLIN402 - Restorative Dentistry Clinic' },
        { day: 'Fri', time: '9:00 AM - 12:00 PM', course: 'Attendance Review & CCTV Monitoring' },
      ]
    : [
        { day: 'Mon & Wed', time: '8:00 AM - 11:00 AM', course: 'CLIN401 - Clinical Dentistry I' },
        { day: 'Tue & Thu', time: '1:00 PM - 3:00 PM', course: 'ODON202 - Oral Histology & Embryology' },
        { day: 'Fri', time: '9:00 AM - 12:00 PM', course: 'CLIN402 - Restorative Dentistry Clinic' },
      ];

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">
          {isSecretary ? 'My Class Secretary Profile' : 'My Faculty Profile'}
        </h1>
        <p className="text-xs text-slate-400">
          {isSecretary
            ? 'View your secretary account, assigned class, and classroom access details'
            : 'View and update your academic details, specialties, and teaching schedules'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Card: General Info Summary */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="text-center p-6">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-tr from-clinical-500 to-accent-500 flex items-center justify-center text-white text-3xl font-extrabold font-heading shadow-md mb-4 glow-clinical animate-pulse-slow">
              {initials}
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{name}</h3>
            <p className="text-xs text-clinical-650 dark:text-clinical-400 font-semibold mt-1">
              {currentUser?.title || 'Academic Dean & Faculty Clinician'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{specialty}</p>

            <div className="mt-6 border-t border-slate-100 dark:border-slate-800/80 pt-6 text-left space-y-4 text-xs">
              <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{email}</span>
              </div>
              <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{phone}</span>
              </div>
              <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{isSecretary ? currentUser?.classroomName || office : office}</span>
              </div>
              {isSecretary && (
                <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  <span>{currentUser?.assignedClassName || 'Clinical Rotation A'}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Specialty Departments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-clinical-500" />
                {isSecretary ? 'Secretary Access Scope' : 'Clinical Specialty Fields'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2.5">
                {(isSecretary
                  ? [currentUser?.assignedClassName || 'Clinical Rotation A', currentUser?.classroomName || 'Dental Clinic B - Room 402', currentUser?.cctvCameraId || 'CCTV-CLINIC-A-01']
                  : ['Endodontics', 'Restorative Dentistry', 'Prosthodontics', 'Clinical Supervision', 'Oral Pathology']
                ).map(spec => (
                  <span key={spec} className="px-3 py-1 bg-slate-100 dark:bg-slate-900 font-semibold text-xs rounded-xl text-slate-600 dark:text-slate-450 border border-slate-200/20 dark:border-slate-800/20">
                    {spec}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Forms and Schedules */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile details */}
          <Card>
            <CardHeader>
              <CardTitle>{isSecretary ? 'Profile Information' : 'Edit Contact Profile Information'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isSecretary ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    ['Full Name', name],
                    ['Email Address', email],
                    ['Role', currentUser?.title || 'Class Secretary'],
                    ['Assigned Class', currentUser?.assignedClassName || 'Clinical Rotation A'],
                    ['Assigned Classroom', currentUser?.classroomName || office],
                    ['CCTV Camera', currentUser?.cctvCameraId || 'CCTV-CLINIC-A-01'],
                  ].map(([label, value]) => (
                    <div key={label} className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
                    </div>
                  ))}
                  <div className="md:col-span-2 p-4 rounded-2xl bg-clinical-500/10 border border-clinical-500/20 text-xs text-clinical-800 dark:text-clinical-300">
                    This profile is read-only. Account, class, and access assignments are managed by authorized faculty or administrators.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Full Faculty Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Contact Number</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Dean Office Location
                    </label>
                    <input
                      type="text"
                      value={office}
                      onChange={(e) => setOffice(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Dentistry Specialty Title
                  </label>
                  <input
                    type="text"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="flex items-center space-x-2 px-5 py-3 bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm rounded-2xl shadow-md transition-all active:scale-97"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaved ? 'Profile Updated!' : 'Save Profile Details'}</span>
                  </button>
                </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Office Teaching Schedules */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent-500" />
                {isSecretary ? 'Assigned Class Schedule' : 'Teaching & Clinic Supervision Schedules'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teachingSchedules.map((schedule, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <div>
                    <h5 className="font-bold text-sm text-slate-800 dark:text-slate-200">{schedule.course}</h5>
                    <p className="text-xs text-slate-400 mt-0.5">{schedule.day}</p>
                  </div>
                  <span className="text-xs px-3 py-1 bg-clinical-50 text-clinical-600 dark:bg-clinical-950/40 dark:text-clinical-400 font-bold rounded-xl border border-clinical-200/20">
                    {schedule.time}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

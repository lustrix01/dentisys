import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Users, CalendarRange, FilePlus, BookOpen, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { useApp } from '../../context/AppContext';

export const Dashboard: React.FC = () => {
  const { students } = useApp();
  const navigate = useNavigate();

  const mockTasks = [
    { id: '1', title: 'Verify Clinic Completion for Year 4 students', date: 'Due Today', status: 'pending' },
    { id: '2', title: 'Collect attendance sheets for Restorative Clinic II', date: 'Due Tomorrow', status: 'pending' },
    { id: '3', title: 'File academic warning records', date: 'Completed', status: 'done' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-650 text-white p-6 rounded-[24px] shadow-lg border border-blue-500/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading tracking-tight flex items-center gap-2">
            Student Secretary Portal
          </h1>
          <p className="text-xs text-blue-100 mt-1">Review student registries, log attendance logs, and manage doc clearances.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/student/attendance')}
            className="px-4 py-2 bg-white text-blue-700 font-bold text-xs rounded-xl shadow-md hover:bg-slate-50 transition-all cursor-pointer"
          >
            Log Attendance
          </button>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Students</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{students.length}</span>
          </div>
          <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Attendance Sheets</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">14 / 15</span>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
            <ClipboardCheck className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Clearances Pending</span>
            <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 block mt-1">4</span>
          </div>
          <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
            <FilePlus className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Clinic Hours Checked</span>
            <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 block mt-1">8</span>
          </div>
          <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-blue-500" />
                Secretary Task Checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-900 rounded-xl border border-slate-200/30 dark:border-slate-800/40">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={task.status === 'done'}
                      readOnly
                      className="h-4 w-4 rounded text-blue-600 border-slate-350 dark:border-slate-800 focus:ring-blue-500"
                    />
                    <div>
                      <span className={`text-xs font-semibold text-slate-800 dark:text-slate-200 block ${task.status === 'done' ? 'line-through text-slate-450 dark:text-slate-500' : ''}`}>
                        {task.title}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{task.date}</span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    task.status === 'done' 
                      ? 'bg-emerald-500/10 text-emerald-600' 
                      : 'bg-amber-500/10 text-amber-600'
                  }`}>
                    {task.status === 'done' ? 'done' : 'pending'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Quick Operations */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-cyan-500" />
                Office Quick Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <button 
                onClick={() => navigate('/student/attendance')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer transition-all text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <span>Record Daily Attendance</span>
                <span className="text-blue-500 font-semibold">&rarr;</span>
              </button>
              <button 
                onClick={() => navigate('/student/documents')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer transition-all text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <span>Clearance & Signatures</span>
                <span className="text-blue-500 font-semibold">&rarr;</span>
              </button>
              <button 
                onClick={() => alert('Student Registry backup downloaded.')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer transition-all text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <span>Export Student Directory</span>
                <span className="text-blue-500 font-semibold">&rarr;</span>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

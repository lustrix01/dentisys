// src/components/reports/AnalyticsDashboard/AnalyticsDashboard.tsx
import React from "react";
import { useReports } from "../../../hooks/useReports";
import { Card } from "../../Card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from "recharts";

// Simple mock data generators
const generateGradeDistribution = () => [
  { grade: "A", count: 20 },
  { grade: "B", count: 30 },
  { grade: "C", count: 15 },
  { grade: "D", count: 5 },
  { grade: "F", count: 2 },
];

const generateAttendanceTrend = () => [
  { date: "2024-01", present: 80, absent: 20 },
  { date: "2024-02", present: 85, absent: 15 },
  { date: "2024-03", present: 78, absent: 22 },
];

export const AnalyticsDashboard: React.FC = () => {
  const { selectedReport } = useReports();

  // In a real implementation we would fetch data based on selectedReport
  const gradeData = generateGradeDistribution();
  const attendanceData = generateAttendanceTrend();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card glow="accent" className="p-4">
        <h3 className="text-lg font-semibold mb-2">Grade Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={gradeData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <XAxis dataKey="grade" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="#4f46e5" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card glow="accent" className="p-4">
        <h3 className="text-lg font-semibold mb-2">Attendance Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={attendanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="present" stroke="#10b981" name="Present" />
            <Line type="monotone" dataKey="absent" stroke="#ef4444" name="Absent" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};

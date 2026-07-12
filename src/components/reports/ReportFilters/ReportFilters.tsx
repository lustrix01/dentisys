import React from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '../../Card';
import { useAuth } from '../../../contexts/AuthContext';
import { ReportCategory } from '../ReportCategoryCards/ReportCategoryCards';
import { useReports } from '../../../hooks/useReports';

interface ReportFiltersProps {
  onSelectReport: (report: ReportCategory) => void;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({ onSelectReport }) => {
  const { filters, setFilters } = useReports();
  const { user } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };

  return (
    <Card glow="accent" className="mb-6">
      <CardHeader>
        <CardTitle>Report Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="academicYear">
              Academic Year
            </label>
            <select
              id="academicYear"
              name="academicYear"
              value={filters.academicYear || ''}
              onChange={handleChange}
              className="w-full rounded border-gray-300 focus:ring-2 focus:ring-accent-500"
            >
              <option value="">All Years</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="semester">
              Semester
            </label>
            <select
              id="semester"
              name="semester"
              value={filters.semester || ''}
              onChange={handleChange}
              className="w-full rounded border-gray-300 focus:ring-2 focus:ring-accent-5"
            >
              <option value="">All Semesters</option>
              <option value="Fall">Fall</option>
              <option value="Spring">Spring</option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// src/hooks/useReports.ts
import { useState, useEffect } from "react";
import { ReportType } from "../components/reports/ReportCategoryCards/ReportCategoryCards";
import { fetchReportData, exportPDF as serviceExportPDF, exportCSV as serviceExportCSV, ReportData } from "../services/mock/reportService";

export interface ReportFilters {
  academicYear?: string;
  semester?: string;
  [key: string]: any;
}

export const useReports = () => {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [selectedReportData, setSelectedReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch report data when a report is selected
  useEffect(() => {
    if (!selectedReport) {
      setSelectedReportData(null);
      return;
    }
    setLoading(true);
    fetchReportData(selectedReport)
      .then(data => setSelectedReportData(data))
      .finally(() => setLoading(false));
  }, [selectedReport]);

  const exportPDF = async () => {
    if (selectedReport && selectedReportData) {
      await serviceExportPDF(selectedReport, selectedReportData);
    }
  };

  const exportCSV = async () => {
    if (selectedReport && selectedReportData) {
      await serviceExportCSV(selectedReport, selectedReportData);
    }
  };

  return {
    selectedReport,
    setSelectedReport,
    filters,
    setFilters,
    selectedReportData,
    loading,
    exportPDF,
    exportCSV,
  };
};

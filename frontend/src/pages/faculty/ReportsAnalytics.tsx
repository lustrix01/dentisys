import React, { useState } from "react";
import { ReportCategoryCards } from "../../components/reports/ReportCategoryCards/ReportCategoryCards";
import { AnalyticsDashboard } from "../../components/reports/AnalyticsDashboard/AnalyticsDashboard";
import { ReportPreview } from "../../components/reports/ReportPreview/ReportPreview";
import { ExportDialog } from "../../components/reports/ExportDialog/ExportDialog";
import { useReports } from "../../hooks/useReports";

export const ReportsAnalytics: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"reports" | "analytics" | "export">("reports");
  const { selectedReport, setSelectedReport } = useReports();

  return (
    <div className="p-6">
      <div className="flex space-x-4 mb-6 border-b border-slate-200 dark:border-slate-800">
        <button
          className={`py-2 px-4 font-medium transition-colors border-b-2 ${
            activeTab === "reports"
              ? "border-accent-500 text-accent-600 dark:text-accent-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => setActiveTab("reports")}
        >
          Reports
        </button>
        <button
          className={`py-2 px-4 font-medium transition-colors border-b-2 ${
            activeTab === "analytics"
              ? "border-accent-500 text-accent-600 dark:text-accent-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => setActiveTab("analytics")}
        >
          Analytics
        </button>
        <button
          className={`py-2 px-4 font-medium transition-colors border-b-2 ${
            activeTab === "export"
              ? "border-accent-500 text-accent-600 dark:text-accent-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => setActiveTab("export")}
        >
          Export
        </button>
      </div>

      {activeTab === "reports" && (
        <div>
          <ReportCategoryCards onSelect={setSelectedReport} />
          {selectedReport && <ReportPreview reportType={selectedReport} />}
        </div>
      )}

      {activeTab === "analytics" && (
        <AnalyticsDashboard />
      )}

      {activeTab === "export" && (
        <ExportDialog reportType={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </div>
  );
};

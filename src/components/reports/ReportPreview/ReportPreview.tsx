// src/components/reports/ReportPreview/ReportPreview.tsx
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../../../Card";
import { ReportType } from "../ReportCategoryCards/ReportCategoryCards";

interface Props {
  reportType: ReportType;
}

export const ReportPreview: React.FC<Props> = ({ reportType }) => {
  // In a real implementation we would fetch data based on reportType
  return (
    <Card glow="accent" className="mt-6">
      <CardHeader>
        <CardTitle>{reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This is a placeholder preview for the <strong>{reportType}</strong> report. Data would be displayed here in a formatted table or chart.
        </p>
      </CardContent>
    </Card>
  );
};

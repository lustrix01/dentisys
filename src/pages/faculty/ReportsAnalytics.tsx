
import React, { useState } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import "react-tabs/style/react-tabs.css";
import { ReportCategoryCards } from "../../components/reports/ReportCategoryCards/ReportCategoryCards";
import { AnalyticsDashboard } from "../../components/reports/AnalyticsDashboard/AnalyticsDashboard";
import { ReportPreview } from "../../components/reports/ReportPreview/ReportPreview";
import { ExportDialog } from "../../components/reports/ExportDialog/ExportDialog";
import { useReports } from "../../hooks/useReports";

export const ReportsAnalytics: React.FC = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const { selectedReport, setSelectedReport } = useReports();

  return (
    <div className="p-6">
      <Tabs selectedIndex={tabIndex} onSelect={index => setTabIndex(index)}>
        <TabList className="flex space-x-4 mb-4">
          <Tab className="cursor-pointer py-2 px-4 border-b-2 border-transparent hover:border-accent-500">Reports</Tab>
          <Tab className="cursor-pointer py-2 px-4 border-b-2 border-transparent hover:border-accent-500">Analytics</Tab>
          <Tab className="cursor-pointer py-2 px-4 border-b-2 border-transparent hover:border-accent-500">Export</Tab>
        </TabList>

        <TabPanel>
          <ReportCategoryCards onSelect={setSelectedReport} />
          {selectedReport && <ReportPreview reportType={selectedReport} />}
        </TabPanel>
        <TabPanel>
          <AnalyticsDashboard reportType={selectedReport} />
        </TabPanel>
        <TabPanel>
          <ExportDialog reportType={selectedReport} onClose={() => setSelectedReport(null)} />
        </TabPanel>
      </Tabs>
    </div>
  );
};

// src/components/reports/ExportDialog/ExportDialog.tsx
import React, { useState } from "react";
import { Modal } from "../../Modal";
import { Card } from "../../Card";
import { useReports } from "../../../hooks/useReports";
import { toast } from "react-hot-toast";

interface ExportDialogProps {
  reportType: string | null;
  onClose?: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ reportType, onClose = () => {} }) => {
  const { exportPDF, exportCSV } = useReports();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: "pdf" | "csv") => {
    if (!reportType) return;
    setIsExporting(true);
    try {
      if (format === "pdf") {
        await exportPDF();
        toast.success("PDF exported successfully");
      } else {
        await exportCSV();
        toast.success("CSV exported successfully");
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={!!reportType} onClose={onClose} title="Export Report">
      <Card className="p-4 space-y-4">
        <button
          className="w-full py-2 bg-accent-600 text-white rounded hover:bg-accent-700 disabled:opacity-50"
          disabled={isExporting}
          onClick={() => handleExport("pdf")}
        >
          Export as PDF
        </button>
        <button
          className="w-full py-2 bg-accent-600 text-white rounded hover:bg-accent-700 disabled:opacity-50"
          disabled={isExporting}
          onClick={() => handleExport("csv")}
        >
          Export as CSV
        </button>
      </Card>
    </Modal>
  );
};

import React, { useState } from "react";
import { Modal } from "../../Modal";
import { Card } from "../../Card";
import { useReports } from "../../../hooks/useReports";
import { toast } from "react-hot-toast";

interface ExportDialogProps {
  reportType: string | null;
  onClose?: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ reportType, onClose = () => {} }) => {
  const { exportPDF, exportCSV } = useReports();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: "pdf" | "csv") => {
    if (!reportType) return;
    setIsExporting(true);
    try {
      if (format === "pdf") {
        await exportPDF();
        toast.success("PDF exported successfully");
      } else {
        await exportCSV();
        toast.success("CSV exported successfully");
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={!!reportType} onClose={onClose} title="Export Report">
      <Card className="p-4 space-y-4">
        <button
          className="w-full py-2 bg-accent-600 text-white rounded hover:bg-accent-700 disabled:opacity-50"
          disabled={isExporting}
          onClick={() => handleExport("pdf")}
        >
          Export as PDF
        </button>
        <button
          className="w-full py-2 bg-accent-600 text-white rounded hover:bg-accent-700 disabled:opacity-50"
          disabled={isExporting}
          onClick={() => handleExport("csv")}
        >
          Export as CSV
        </button>
      </Card>
    </Modal>
  );
};


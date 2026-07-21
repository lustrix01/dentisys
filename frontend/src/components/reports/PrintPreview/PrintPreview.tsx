// src/components/reports/PrintPreview/PrintPreview.tsx
import React, { useRef } from "react";
import { Modal } from "../../Modal";
import { Card, CardHeader, CardTitle, CardContent } from "../../Card";

interface PrintPreviewProps {
  reportType: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({ reportType, isOpen, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (contentRef.current) {
      const printContents = contentRef.current.innerHTML;
      const originalContents = document.body.innerHTML;
      document.body.innerHTML = printContents;
      window.print();
      document.body.innerHTML = originalContents;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Print Preview">
      <Card className="p-4">
        <CardHeader>
          <CardTitle>{reportType ? `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Preview` : "Print Preview"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={contentRef} className="print-area">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              This area would contain the formatted report ready for printing.
            </p>
          </div>
          <div className="mt-4 flex justify-end space-x-2">
            <button
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-accent-600 text-white rounded hover:bg-accent-700"
              onClick={handlePrint}
            >
              Print
            </button>
          </div>
        </CardContent>
      </Card>
    </Modal>
  );
};

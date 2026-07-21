// src/services/mock/reportService.ts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";

export interface ReportData {
  // generic shape – in real app this would be detailed per report type
  headers: string[];
  rows: (string | number)[][];
}

// Simulated fetch – returns dummy data based on report type
export const fetchReportData = async (reportType: string): Promise<ReportData> => {
  // simple mock data
  const headers = ["Column 1", "Column 2", "Column 3"];
  const rows = Array.from({ length: 10 }, (_, i) => [
    `${reportType} Row ${i + 1}`,
    Math.floor(Math.random() * 100),
    new Date().toLocaleDateString()
  ]);
  return { headers, rows };
};

export const exportPDF = async (reportType: string, data: ReportData): Promise<void> => {
  const doc = new jsPDF();
  doc.text(`${reportType} Report`, 14, 20);
  autoTable(doc, {
    head: [data.headers],
    body: data.rows,
    startY: 30,
  });
  doc.save(`${reportType}_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportCSV = async (reportType: string, data: ReportData): Promise<void> => {
  const csv = Papa.unparse({ fields: data.headers, data: data.rows });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${reportType}_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

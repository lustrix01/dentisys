// Shared .xlsx download for every export (contract docs/contracts/official-exports.md, X18/X22).
import writeXlsxFile from 'write-excel-file/browser';
import type { Sheet } from 'write-excel-file/browser';

export type { Cell, CellObject, Row, SheetData } from 'write-excel-file/browser';
export type XlsxSheet = Sheet<Blob>;

/** iBU look for every export (contract X29): one navy title row (the report name, index 3) with white text, other title lines plain (navy bold for BICOL UNIVERSITY / COLLEGE), light-blue header row with blue text. Styling only. */
const IBU_TITLE = { backgroundColor: '#0E436C', textColor: '#FFFFFF', fontWeight: 'bold' } as const;
const IBU_HEADER = { backgroundColor: '#E1F0FD', textColor: '#075F9D', fontWeight: 'bold' } as const;
export const ibuTitleRow = <T extends object>(cell: T, index: number): T =>
  index === 3 ? { ...cell, ...IBU_TITLE } : index === 1 || index === 2 ? { ...cell, textColor: '#0E436C', fontWeight: 'bold' } : { ...cell, textColor: '#1E2939' };
export const ibuHeader = <T extends object>(cell: T): T => ({ ...cell, ...IBU_HEADER });

/** Builds the workbook in the browser and saves it with the same link-click download the CSV exports used. */
export async function downloadXlsx(fileName: string, sheets: XlsxSheet[]): Promise<void> {
  const blob = await writeXlsxFile(sheets, { fontFamily: 'Calibri', fontSize: 11 }).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

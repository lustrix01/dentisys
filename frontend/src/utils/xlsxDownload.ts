// Shared .xlsx download for every export (contract docs/contracts/official-exports.md, X18/X22).
import writeXlsxFile from 'write-excel-file/browser';
import type { Sheet } from 'write-excel-file/browser';

export type { Cell, CellObject, Row, SheetData } from 'write-excel-file/browser';
export type XlsxSheet = Sheet<Blob>;

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

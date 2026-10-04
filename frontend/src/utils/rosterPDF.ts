import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parsePDFRosterPages, type RosterPDFPage } from './rosterImportHelper';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Possible red strike-throughs only. Every PDF row still requires review. */
function redMarkBands(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height);
  const bands: Array<{ top: number; bottom: number }> = [];
  for (let y = 0; y < height; y++) {
    let red = 0;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (data[offset] > 170 && data[offset + 1] < 140 && data[offset + 2] < 140
        && data[offset] > data[offset + 1] * 1.4) red++;
    }
    if (red < width * 0.18) continue;
    const last = bands.at(-1);
    if (last && y <= last.bottom + 3) last.bottom = y;
    else bands.push({ top: y, bottom: y });
  }
  return bands;
}

/** Browser-local processing: no PDF URL, upload, CDN worker or persistence. */
export async function parseRosterPDF(buffer: ArrayBuffer) {
  const task = getDocument({ data: new Uint8Array(buffer) });
  try {
    const document = await task.promise;
    const pages: RosterPDFPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.flatMap(item => {
        if (!('str' in item) || !item.str.trim()) return [];
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        return [{ text: item.str, x, y, width: item.width, height: item.height }];
      });
      if (!items.length) throw new Error(`Page ${pageNumber}: scanned/image-only PDFs are not supported. Use a text PDF or CSV.`);
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The browser could not inspect this PDF. Use CSV instead.');
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push({ page: pageNumber, width: viewport.width, height: viewport.height, items, redMarkBands: redMarkBands(context, canvas.width, canvas.height) });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    return parsePDFRosterPages(pages);
  } finally {
    await task.destroy();
  }
}

import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type Positioned = { text: string; x: number; y: number; width: number };

function pageLines(items: Positioned[], pageWidth: number): { text: string; x: number; y: number }[] {
  const rows: Positioned[][] = [];
  for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    let row = rows.find(r => Math.abs(r[0].y - item.y) <= 2.5);
    if (!row) { row = []; rows.push(row); }
    row.push(item);
  }
  const lines = rows.map(row => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let previousEnd = row[0].x;
    for (const item of row) {
      if (text && item.x - previousEnd > 2) text += ' ';
      text += item.text;
      previousEnd = Math.max(previousEnd, item.x + item.width);
    }
    return { text: text.trim(), x: row[0].x, y: row[0].y };
  }).filter(line => line.text);
  const left = lines.filter(l => l.x < pageWidth * .47);
  const right = lines.filter(l => l.x > pageWidth * .53);
  const overlapping = lines.filter(l => l.x < pageWidth * .47 && l.text.length > 100);
  const twoColumns = left.length > 5 && right.length > 5 && overlapping.length < lines.length * .15;
  if (!twoColumns) return lines.sort((a, b) => b.y - a.y || a.x - b.x);
  const full = lines.filter(l => l.text.length > 100 || (l.x >= pageWidth * .47 && l.x <= pageWidth * .53));
  const narrow = lines.filter(l => !full.includes(l));
  return [...full.filter(l => l.y > Math.max(...narrow.map(n => n.y), 0) - 10),
    ...narrow.filter(l => l.x < pageWidth * .5).sort((a, b) => b.y - a.y),
    ...narrow.filter(l => l.x >= pageWidth * .5).sort((a, b) => b.y - a.y),
    ...full.filter(l => l.y <= Math.max(...narrow.map(n => n.y), 0) - 10)];
}

export async function extractPdf(file: File): Promise<string[]> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: { text: string; y: number; height: number }[][] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const items = content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item)
      .map(item => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }));
    const viewport = page.getViewport({ scale: 1 });
    pages.push(pageLines(items, viewport.width).map(line => ({ text: line.text, y: line.y, height: viewport.height })));
    page.cleanup();
  }
  const edgeCounts = new Map<string, number>();
  for (const page of pages) {
    const edge = [...page.slice(0, 3), ...page.slice(-3)];
    for (const line of edge) {
      const normalized = line.text.replace(/\d+/g, '#').toLowerCase().trim();
      edgeCounts.set(normalized, (edgeCounts.get(normalized) || 0) + 1);
    }
  }
  const cleaned = pages.map(page => page.filter((line, index) => {
    if (/^\s*(?:página\s*)?\d+\s*$/i.test(line.text)) return false;
    const normalized = line.text.replace(/\d+/g, '#').toLowerCase().trim();
    return !((index < 3 || index >= page.length - 3) && pages.length > 2 && (edgeCounts.get(normalized) || 0) >= Math.max(3, Math.ceil(pages.length * .55)));
  }).map(line => line.text).join('\n').replace(/([\p{L}])-\n([\p{Ll}])/gu, '$1$2').replace(/\uFB00/g, 'ff').replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl'));
  await loadingTask.destroy();
  return cleaned;
}

export { pdfjs };

/// <reference lib="webworker" />
import { cachedDocument, storeDocument } from './lib/cache';
import { extractPdf } from './lib/pdf';
import { latexToText, markdownToText, parseBib, splitSentences, extractDefinitions } from './lib/extract';
import type { DocumentData, FileEntry } from './lib/types';

type Message = { entries: FileEntry[] };
const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<Message>) => {
  const entries = event.data.entries.filter(e => e.kind);
  const docs: DocumentData[] = [];
  const raw = new Map<string, string>();
  const bib: Record<string, string> = {};
  try {
    for (const entry of entries) if (entry.kind === 'tex' || entry.kind === 'bib') {
      const source = await entry.file.text(); raw.set(entry.path, source);
      if (entry.kind === 'bib') Object.assign(bib, parseBib(source));
    }
    const labels: Record<string, string> = {};
    for (const [path, source] of raw) {
      if (!path.endsWith('.tex')) continue;
      let heading = '';
      for (const match of source.matchAll(/\\(?:chapter|section|subsection)\*?\{([^}]+)\}|\\label\{([^}]+)\}/g)) {
        if (match[1]) heading = match[1];
        if (match[2]) labels[match[2]] = heading || match[2];
      }
    }
    const texDependencyKey = entries.filter(e => e.kind === 'tex' || e.kind === 'bib')
      .map(e => `${e.path}:${e.file.size}:${e.file.lastModified}`).join('|');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.kind) continue;
      // TeX output also depends on bibliography entries and cross-file labels.
      const key = `${entry.path}\0${entry.file.size}\0${entry.file.lastModified}${entry.kind === 'tex' ? `\0${texDependencyKey}` : ''}`;
      let doc = await cachedDocument(key).catch(() => undefined);
      if (!doc) {
        let text = '';
        let pages: string[] | undefined;
        let displaySource: string | undefined;
        if (entry.kind === 'pdf') { pages = await extractPdf(entry.file); text = pages.join('\n\n'); }
        else if (entry.kind === 'tex') { displaySource = raw.get(entry.path) || ''; text = latexToText(displaySource, bib, labels); }
        else if (entry.kind === 'md') { displaySource = await entry.file.text(); text = markdownToText(displaySource); }
        else text = await entry.file.text();
        doc = { path: entry.path, name: entry.file.name, kind: entry.kind, text, pages,
          displaySource, sentences: pages ? pages.flatMap((page, index) => splitSentences(page, index + 1)) : splitSentences(text) };
        await storeDocument(key, doc).catch(() => undefined);
      }
      docs.push(doc);
      scope.postMessage({ type: 'progress', done: i + 1, total: entries.length, path: entry.path });
    }
    // A PDF with matching TeX uses the source for speech; the PDF remains its visual view.
    for (const pdf of docs.filter(d => d.kind === 'pdf')) {
      const stem = pdf.path.replace(/\.pdf$/i, '');
      const source = docs.find(d => d.kind === 'tex' && d.path.replace(/\.tex$/i, '') === stem);
      if (!source) continue;
      const root = raw.get(source.path) || '';
      const directory = source.path.slice(0, source.path.lastIndexOf('/') + 1);
      const chunks = [source.text];
      for (const match of root.matchAll(/\\(?:include|input)\{([^}]+)\}/g)) {
        const target = `${directory}${match[1].replace(/\.tex$/i, '')}.tex`;
        const included = docs.find(d => d.path === target);
        if (included) chunks.push(included.text);
      }
      pdf.text = chunks.join('\n\n');
      pdf.sentences = splitSentences(pdf.text);
      pdf.sourcePath = source.path;
    }
    const definitions: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.kind === 'tex') Object.assign(definitions, extractDefinitions(raw.get(entry.path) || ''));
      else if (entry.kind) Object.assign(definitions, extractDefinitions(docs.find(d => d.path === entry.path)?.text || ''));
    }
    scope.postMessage({ type: 'done', docs, definitions });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

import type { DocumentData } from '../lib/types';

export function FormattedView({ doc, onSeek }: { doc: DocumentData; onSeek: (index: number) => void }) {
  const paragraphs = doc.text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const headings = new Set<string>();
  if (doc.kind === 'tex') for (const match of doc.displaySource?.matchAll(/\\(?:chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^{}]+)\}/g) || []) headings.add(match[1].trim());
  if (doc.kind === 'md') for (const match of doc.displaySource?.matchAll(/^#{1,6}\s+(.+)$/gm) || []) headings.add(match[1].trim());
  return <article className="formatted-text">{paragraphs.map((paragraph, paragraphIndex) => {
    const first = paragraph.split('\n')[0].trim();
    const sentenceIndex = doc.sentences.findIndex(sentence => sentence.paragraph === paragraphIndex);
    const props = { key: paragraphIndex, onClick: () => onSeek(Math.max(0, sentenceIndex)), title: 'Ler a partir deste trecho', className: 'formatted-block' };
    return headings.has(first) && paragraph === first ? <h2 {...props}>{paragraph}</h2> : <p {...props}>{paragraph}</p>;
  })}</article>;
}

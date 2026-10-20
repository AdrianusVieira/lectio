import type { Sentence, Term } from './types';

export function splitSentences(text: string, page?: number): Sentence[] {
  const paragraphs = text.split(/\n\s*\n/).map(s => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  return paragraphs.flatMap((paragraph, index) => {
    const protectedText = paragraph.replace(/\b(?:Cap|Dr|Dra|Prof|Fig|Eq|Art)\./gi, m => m.replace('.', '∯'))
      .replace(/\b\d+(?:\.\d+){2,}\b/g, m => m.replace(/\./g, '∯'));
    const fragments = protectedText.split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“])/u);
    return fragments.map(s => ({ text: s.replace(/∯/g, '.'), paragraph: index, page }));
  });
}

export function parseBib(text: string): Record<string, string> {
  const records: Record<string, string> = {};
  const pattern = /@\w+\s*\{\s*([^,]+),([\s\S]*?)(?=\n@\w+\s*\{|$)/g;
  for (const match of text.matchAll(pattern)) {
    const author = match[2].match(/author\s*=\s*[\{"]([^}"]+)/i)?.[1];
    const year = match[2].match(/year\s*=\s*[\{"]?(\d{4})/i)?.[1];
    const title = match[2].match(/title\s*=\s*[\{"]([^}"]+)/i)?.[1];
    records[match[1].trim()] = [author?.split(/\s+and\s+/i).map(a => a.split(',')[0]).join(' e '), year, title].filter(Boolean).join(', ');
  }
  return records;
}

export function latexToText(source: string, bib: Record<string, string> = {}, labels: Record<string, string> = {}): string {
  let text = source.replace(/(^|[^\\])%[^\n]*/gm, '$1');
  const ownLabels: Record<string, string> = { ...labels };
  let lastHeading = '';
  text = text.replace(/\\(?:chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, (_, title: string) => { lastHeading = title; return `\n\n${title}\n\n`; });
  text = text.replace(/\\label\{([^}]+)\}/g, (_, key: string) => { ownLabels[key] = lastHeading || key; return ''; });
  text = text.replace(/\\(?:ref|autoref|eqref)\{([^}]+)\}/g, (_, key: string) => ownLabels[key] || `referência ${key}`);
  text = text.replace(/\\(?:cite|citeonline|citeauthor|citeyear)(?:\[[^\]]*\])?\{([^}]+)\}/g, (_, keys: string) => keys.split(',').map(k => bib[k.trim()] || k.trim()).join('; '));
  text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, a: string, b: string) => `${a} sobre ${b}`);
  text = text.replace(/([\w\\]+)\^\{?([\w+-]+)\}?/g, '$1 elevado a $2').replace(/([\w\\]+)_\{?([\w+-]+)\}?/g, '$1 índice $2');
  text = text.replace(/\\(alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|tau|omega)\b/gi, '$1');
  text = text.replace(/\\(?:leq|le)\b/g, ' menor ou igual a ').replace(/\\(?:geq|ge)\b/g, ' maior ou igual a ').replace(/\\neq\b/g, ' diferente de ');
  text = text.replace(/\\begin\{(?:equation\*?|align\*?|displaymath)\}|\\end\{(?:equation\*?|align\*?|displaymath)\}|\$\$/g, '\n');
  text = text.replace(/\\(?:begin|end)\{[^}]+\}/g, '\n');
  text = text.replace(/\\(?:includegraphics|bibliography|bibliographystyle|input|include|usepackage|documentclass)(?:\[[^\]]*\])?\{[^}]*\}/g, '');
  text = text.replace(/\\(?:textbf|textit|emph|underline|mathrm|mathbf|texttt|caption|footnote|url)\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\(?:item)\b/g, '\n• ').replace(/\\(?:par|newline|\\)\b/g, '\n');
  text = text.replace(/\\[,;:!]|\\(?:quad|qquad|enspace|thinspace)\b/g, ' ');
  text = text.replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '');
  text = text.replace(/[{}$]/g, '').replace(/~/g, ' ').replace(/&/g, ' ');
  return text.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function markdownToText(source: string): string {
  return source.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s*/gm, '')
    .replace(/```[\s\S]*?```/g, '').replace(/[*_`>#]/g, '').trim();
}

// Schwartz & Hearst: align the short form's characters backwards to a long form.
function aligned(short: string, long: string): boolean {
  const letters = short.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (letters.length < 2 || letters.length > 15 || long.length > letters.length * 12) return false;
  let cursor = long.length - 1;
  for (let i = letters.length - 1; i >= 0; i--) {
    cursor = long.toLowerCase().lastIndexOf(letters[i], cursor);
    if (cursor < 0 || (i === 0 && cursor > 0 && /[\p{L}\d]/u.test(long[cursor - 1]))) return false;
    cursor--;
  }
  return true;
}

export function extractDefinitions(raw: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of raw.matchAll(/([\p{L}][\p{L}\s-]{4,100}?)\s*\(([A-Z][A-Z0-9/-]{1,14})\)/gu)) {
    const words = match[1].trim().split(/\s+/);
    for (let length = 1; length <= Math.min(words.length, match[2].length + 5); length++) {
      const candidate = words.slice(-length).join(' ');
      if (aligned(match[2], candidate)) { found[match[2]] = candidate; break; }
    }
  }
  for (const match of raw.matchAll(/\b([A-Z][A-Z0-9/-]{1,14})\s*\(([^()]{5,100})\)/g)) {
    if (aligned(match[1], match[2])) found[match[1]] = match[2].trim();
  }
  for (const match of raw.matchAll(/\\(?:newacronym|acro)\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}/g)) found[match[2]] = match[3];
  for (const match of raw.matchAll(/\\acro\{([A-Z][A-Z0-9/-]+)\}(?:\[[^\]]+\])?\{([^}]+)\}/g)) found[match[1]] = match[2];
  for (const match of raw.matchAll(/\\newglossaryentry\{[^}]+\}\{[^}]*name\s*=\s*\{?([A-Z][A-Z0-9/-]+)\}?\s*,\s*description\s*=\s*\{([^}]+)\}/g)) found[match[1]] = match[2];
  for (const match of raw.matchAll(/\\nomenclature\{([^}]+)\}\{([^}]+)\}/g)) found[match[1]] = match[2];
  for (const match of raw.matchAll(/\\sigla\{([^}]+)\}\{([^}]+)\}/g)) found[match[1]] = match[2];
  for (const environment of raw.matchAll(/\\begin\{siglas\}([\s\S]*?)\\end\{siglas\}/g)) {
    for (const match of environment[1].matchAll(/\\item\[([A-Z][A-Z0-9/-]+)\]\s*([^\\\n]+)/g)) found[match[1]] = match[2].trim();
  }
  for (const match of raw.matchAll(/^\s*([A-Z][A-Z0-9/-]{1,14})\s*&\s*([^\\\n]+)/gm)) found[match[1]] = match[2].trim();
  return found;
}

export function buildGlossary(docs: { path: string; text: string }[], definitions: Record<string, string>): Term[] {
  const terms = new Map<string, Term>();
  for (const doc of docs) {
    for (const match of doc.text.matchAll(/\b[A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇ0-9]*(?:[-/][A-Z0-9]+)*\b/g)) {
      const token = match[0];
      if (token.length < 2 || /^\d+$/.test(token)) continue;
      const entry = terms.get(token) || { term: token, definition: definitions[token], count: 0, files: [], contexts: [] };
      entry.count++;
      if (!entry.files.includes(doc.path)) entry.files.push(doc.path);
      if (entry.contexts.length < 3) entry.contexts.push(doc.text.slice(Math.max(0, match.index - 50), match.index + token.length + 70).replace(/\s+/g, ' '));
      terms.set(token, entry);
    }
  }
  return [...terms.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

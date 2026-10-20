import MiniSearch from 'minisearch';
import type { DocumentData } from './types';

export const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function stemPt(word: string): string {
  return fold(word).replace(/(amentos|imentos|adoras|adores|amento|imento|adora|ador|acoes|acao|mente|idades|idade|ismos|ismo|es|s)$/u, '');
}

export function createSearch(docs: DocumentData[]) {
  const index = new MiniSearch<{ id: string; path: string; text: string }>({
    fields: ['text', 'path'], storeFields: ['path'],
    processTerm: stemPt,
    searchOptions: { prefix: true, fuzzy: 0.1, boost: { path: 2 } },
  });
  index.addAll(docs.filter(doc => doc.kind !== 'bib').map(doc => ({ id: doc.path, path: doc.path, text: doc.text })));
  return index;
}

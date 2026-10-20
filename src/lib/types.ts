export type DocKind = 'pdf' | 'tex' | 'bib' | 'md' | 'txt';
export interface Sentence { text: string; paragraph: number; page?: number; }
export interface DocumentData { path: string; name: string; kind: DocKind; text: string; sentences: Sentence[]; pages?: string[]; sourcePath?: string; displaySource?: string; }
export interface Term { term: string; definition?: string; count: number; files: string[]; contexts: string[]; }
export interface FileEntry { path: string; file: File; kind?: DocKind; ignored?: boolean; }
export type Pronunciation = { mode?: 'spell' | 'word' | 'expand'; value?: string };

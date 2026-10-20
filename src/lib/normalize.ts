import rules from '../rules/pt-BR.json';
import type { Pronunciation } from './types';

export const defaultRules = rules;
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unitsPattern = new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${Object.keys(rules.units).sort((a, b) => b.length - a.length).map(escaped).join('|')})\\b`, 'gi');
const symbolsPattern = new RegExp(Object.keys(rules.symbols).sort((a, b) => b.length - a.length).map(escaped).join('|'), 'g');
const ones = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

export function integerWords(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `menos ${integerWords(-n)}`;
  if (n === 0) return 'zero';
  if (n >= 1_000_000) { const m = Math.floor(n / 1_000_000); return `${m === 1 ? 'um milhão' : `${integerWords(m)} milhões`}${n % 1_000_000 ? ` e ${integerWords(n % 1_000_000)}` : ''}`; }
  if (n >= 1000) { const k = Math.floor(n / 1000); return `${k === 1 ? 'mil' : `${integerWords(k)} mil`}${n % 1000 ? ` e ${integerWords(n % 1000)}` : ''}`; }
  if (n === 100) return 'cem';
  if (n >= 100) return `${hundreds[Math.floor(n / 100)]}${n % 100 ? ` e ${integerWords(n % 100)}` : ''}`;
  if (n >= 20) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` e ${ones[n % 10]}` : ''}`;
  if (n >= 10) return teens[n - 10];
  return ones[n];
}

function spell(term: string): string {
  return [...term].map(char => /\d/.test(char) ? integerWords(Number(char)) : char === '-' ? 'hífen' : char === '/' ? 'barra' : char).join(' ');
}

export interface NormalizeOptions { definitions?: Record<string, string>; overrides?: Record<string, Pronunciation>; firstUse?: Set<string>; }

export function normalizeForSpeech(input: string, options: NormalizeOptions = {}): string {
  const { definitions = {}, overrides = {}, firstUse = new Set<string>() } = options;
  let text = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  const protectedParts: string[] = [];
  const protect = (value: string) => { const index = protectedParts.push(value) - 1; return `\uE000${String.fromCharCode(0xE100 + index)}\uE001`; };
  // Dates must precede fractions and number sequences.
  text = text.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_, d: string, m: string, y: string) => protect(`${integerWords(+d)} de ${['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][+m - 1] || m} de ${integerWords(+y)}`));
  text = text.replace(/\b(?:NR[- ]?\d+,?\s*)?item\s+(\d+(?:\.\d+)+)(?:\s+([a-z]))?/gi, (all, seq: string, letter?: string) => {
    const prefix = /^NR/i.test(all) ? `norma regulamentadora ${integerWords(Number((all.match(/NR[- ]?(\d+)/i) || [])[1]))}, ` : '';
    return protect(`${prefix}item ${seq.split('.').map(integerPart => integerWords(+integerPart)).join(' ponto ')}${letter ? `, alínea ${letter}` : ''}`);
  });
  text = text.replace(/\bCap\.\s*(\d+)\s*[–-]\s*(\d+)/gi, (_, a: string, b: string) => protect(`capítulos ${integerWords(+a)} a ${integerWords(+b)}`));
  text = text.replace(/~\s*(\d[\d.,]*)/g, (_, n: string) => `aproximadamente ${n}`);
  const ordinalMasculine = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono', 'décimo'];
  const ordinalFeminine = ['', 'primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona', 'décima'];
  text = text.replace(/\b(\d{1,2})([ºª])(?=\s|$|[.,;:!?])/g, (_, value: string, gender: string) => protect((gender === 'ª' ? ordinalFeminine : ordinalMasculine)[+value] || `${integerWords(+value)} ordinal`));
  text = text.replace(/\b(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)\s*%/g, (_, n: string) => protect(`${numberWords(n)} por cento`));
  text = text.replace(/\b(\d+)\s*[–-]\s*(\d+)\b/g, (_, a: string, b: string) => protect(`${integerWords(+a)} a ${integerWords(+b)}`));
  text = text.replace(unitsPattern, (_, n: string, unit: string) => {
    const key = Object.keys(rules.units).find(k => k.toLowerCase() === unit.toLowerCase()) as keyof typeof rules.units | undefined;
    return protect(`${numberWords(n)} ${key ? rules.units[key] : unit}`);
  });
  text = text.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+(?:,\d+)?\b/g, n => numberWords(n));
  text = text.replace(symbolsPattern, symbol => rules.symbols[symbol as keyof typeof rules.symbols] || symbol);
  text = text.replace(/\s*=\s*/g, ' igual a ');
  text = text.replace(/\b[A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇ0-9]*(?:[-/][A-Z0-9]+)*\b/g, term => {
    if (term.length < 2 && !/\d/.test(term)) return term;
    const custom = overrides[term];
    if (custom?.value) return protect(custom.value);
    const mode = custom?.mode || (rules.acronyms as Record<string, Pronunciation>)[term]?.mode || (definitions[term] ? 'expand' : /^[A-Z]{3,}$/.test(term) && /[AEIOU]/.test(term) ? 'word' : 'spell');
    if (mode === 'expand') {
      if (definitions[term] && !firstUse.has(term)) {
        firstUse.add(term);
        const alreadyDefinedHere = input.toLocaleLowerCase('pt-BR').includes(definitions[term].toLocaleLowerCase('pt-BR'));
        return protect(alreadyDefinedHere ? spell(term) : `${definitions[term]}, ${spell(term)}`);
      }
      return protect(spell(term));
    }
    return protect(mode === 'spell' ? spell(term) : term.toLowerCase());
  });
  return text.replace(/\uE000([\uE100-\uF8FF])\uE001/g, (_, marker: string) => protectedParts[marker.charCodeAt(0) - 0xE100]).replace(/\s+/g, ' ').trim();
}

function numberWords(value: string): string {
  const normalized = value.replace(/\./g, '');
  const [whole, decimal] = normalized.split(',');
  if (!decimal) return integerWords(+whole);
  return `${integerWords(+whole)} vírgula ${[...decimal].map(d => integerWords(+d)).join(' ')}`;
}

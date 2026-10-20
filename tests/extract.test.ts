import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { expandLatexIncludes, extractDefinitions, latexToText, splitSentences } from '../src/lib/extract.ts';

test('Schwartz e Hearst encontra as duas direções', () => {
  const definitions = extractDefinitions('Controlador Lógico Programável (CLP). IHM (Interface Homem-Máquina).');
  assert.equal(definitions.CLP, 'Controlador Lógico Programável');
  assert.equal(definitions.IHM, 'Interface Homem-Máquina');
});

test('ambiente de siglas e tabela abnTeX2', () => {
  const definitions = extractDefinitions('\\begin{siglas}\\item[CLP] Controlador Lógico Programável\\end{siglas}\nIHM & Interface Homem-Máquina \\\\');
  assert.equal(definitions.CLP, 'Controlador Lógico Programável');
  assert.equal(definitions.IHM, 'Interface Homem-Máquina');
});

test('LaTeX mantém títulos, resolve citações e converte matemática simples', () => {
  const text = latexToText('\\section{Ensaio} A fração é $\\frac{1}{2}$ e x^{2}. Veja \\cite{silva}.', { silva: 'Silva, 2025' });
  assert.match(text, /Ensaio/);
  assert.match(text, /1 sobre 2/);
  assert.match(text, /x elevado a 2/);
  assert.match(text, /Silva, 2025/);
});

test('itens de norma não são divididos em frases', () => {
  assert.equal(splitSentences('Veja o item 12.11.3.1 b. Depois continue.').length, 2);
});

test('documento raiz lê inclusões em ordem e ignora preâmbulo e comentários', () => {
  const root = '\\documentclass{article}\n\\newcommand{\\foo}{ruído}\n\\begin{document}\n\\include{cap1}\n% \\include{ignorado}\n\\input{cap2}\n\\end{document}';
  const files = new Map([['raiz/cap1.tex', 'Primeiro capítulo.'], ['raiz/cap2.tex', 'Segundo capítulo.'], ['raiz/ignorado.tex', 'Não ler.']]);
  const result = latexToText(expandLatexIncludes(root, 'raiz/principal.tex', files));
  assert.equal(result, 'Primeiro capítulo.\n\nSegundo capítulo.');
});

test('desenhos TikZ não viram fala e legenda e unidades permanecem', () => {
  const result = latexToText('\\begin{figure}[htb]\\begin{tikzpicture}[node distance=8mm]\\draw (0,0)--(1,1);\\end{tikzpicture}\\caption{Motor a \\SI{24}{V}.}\\end{figure}');
  assert.match(result, /Motor a 24 V/);
  assert.doesNotMatch(result, /node distance|draw|htb/);
});

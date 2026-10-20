import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractDefinitions, latexToText, splitSentences } from '../src/lib/extract.ts';

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

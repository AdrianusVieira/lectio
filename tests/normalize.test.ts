import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeForSpeech } from '../src/lib/normalize.ts';

const cases: [string, string][] = [
  ['τ = 5,92 ms', 'tau igual a cinco vírgula nove dois milissegundos'],
  ['NR-12, item 12.11.3.1 b', 'norma regulamentadora doze, item doze ponto onze ponto três ponto um, alínea b'],
  ['A6N', 'A seis N'],
  ['PANATERM', 'panaterm'],
  ['FR01/FR02', 'F R zero um e F R zero dois'],
  ['~100 r/min', 'aproximadamente cem rotações por minuto'],
  ['Cap. 1–2', 'capítulos um a dois'],
  ['01/11/2026', 'um de novembro de dois mil e vinte e seis'],
  ['28/08 a 05/10', 'vinte e oito de agosto a cinco de outubro'],
];
for (const [source, expected] of cases) test(source, () => assert.equal(normalizeForSpeech(source), expected));
test('override de pronúncia', () => assert.equal(normalizeForSpeech('CLP', { overrides: { CLP: { value: 'controlador lógico programável' } } }), 'controlador lógico programável'));
test('definição expande somente na primeira ocorrência', () => {
  const firstUse = new Set<string>();
  const options = { definitions: { CLP: 'controlador lógico programável' }, firstUse };
  assert.equal(normalizeForSpeech('O CLP funciona.', options), 'O controlador lógico programável, C L P funciona.');
  assert.equal(normalizeForSpeech('O CLP parou.', options), 'O C L P parou.');
});
test('artigo a depois de número não vira ampères', () => {
  assert.equal(normalizeForSpeech('1 a 2 A'), 'um a dois ampères');
});
test('caminhos, nomes de arquivo e frações não geram barras na fala', () => {
  assert.equal(normalizeForSpeech('Veja ..\\MonografiaLaTeX\\ e Monografia.pdf; 1/2.'), 'Veja pasta MonografiaLaTeX e arquivo; um sobre dois.');
});
test('ordinais, porcentagens e separador de milhar', () => {
  assert.equal(normalizeForSpeech('1º'), 'primeiro');
  assert.equal(normalizeForSpeech('1ª'), 'primeira');
  assert.equal(normalizeForSpeech('1.200,5%'), 'mil e duzentos vírgula cinco por cento');
});

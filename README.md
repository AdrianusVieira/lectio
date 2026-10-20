# Lectio

Página web estática para abrir uma **pasta inteira** de documentos e ouvir seu texto em português brasileiro. O processamento usa regras, expressões regulares e algoritmos clássicos no navegador. Não há servidor, backend, LLM, embeddings nem modelos de IA na página. A fala usa a Web Speech API do navegador.

## Rodar

Requer Node.js 22.13 ou mais recente.

```sh
npm ci
npm run dev
```

Abra o endereço mostrado pelo Vite. Use **Abrir pasta** (o botão escolhe automaticamente entre `showDirectoryPicker` e o fallback `webkitdirectory`) ou solte uma pasta na janela. O acesso a arquivos locais exige `localhost` ou HTTPS. A pasta `exemplo/` contém um PDF, seu `.tex` de origem e notas Markdown.

```sh
npm test
npm run build
```

## Arquivos e leitura

Aceita `.pdf`, `.tex`, `.bib`, `.md` e `.txt`, inclusive em subpastas. Outros formatos aparecem como ignorados. PDFs são renderizados com camada de texto. Se um `.tex` com o mesmo nome base estiver na pasta, o PDF permanece visível e a leitura usa o LaTeX; arquivos `\include`/`\input` diretos são incluídos. PDF sem fonte LaTeX é extraído página a página com posição dos itens, ordenação por linhas/colunas, remoção de cabeçalhos e rodapés repetidos, números de página, ligaduras e hifenização de fim de linha. PDFs escaneados não produzem texto nesta versão.

O worker processa arquivos sem travar a interface. O cache IndexedDB usa `caminho + tamanho + lastModified`; arquivos inalterados são reutilizados. Documentos e posição de leitura permanecem só neste dispositivo. O glossário identifica siglas por alinhamento da forma curta com a forma longa (Schwartz & Hearst, 2003), formas LaTeX comuns e candidatos em maiúsculas. A busca full-text usa MiniSearch, normalização de acentos e redução simples de sufixos em português.

Clique em uma frase para iniciar nela. **Espaço** reproduz/pausa; **←/→** mudam de frase; **↑/↓** mudam de parágrafo. A posição por arquivo é salva localmente. As opções permitem pular referências, notas e legendas quando identificadas pelo início da frase.

## Pronúncia

As regras padrão ficam em [`src/rules/pt-BR.json`](src/rules/pt-BR.json). Edite os dicionários `units`, `symbols` e `acronyms`; depois execute os testes e gere uma nova versão da página. Siglas podem ser soletradas, faladas como palavra ou expandidas na primeira ocorrência. Na interface, selecione um termo do glossário para substituir sua pronúncia ou escolher o modo. Essas correções são salvas automaticamente no `localStorage` deste navegador. Para acrescentar padrões gerais de números ou normas, edite [`src/lib/normalize.ts`](src/lib/normalize.ts) e os testes.

As vozes pt-BR chegam de forma assíncrona. O Lectio prefere vozes Microsoft com “Natural” no nome, depois qualquer voz pt-BR. A interface indica se a voz selecionada é local ou online, conforme `localService`. **Vozes online podem enviar o texto falado ao provedor da voz (Microsoft/Google)**. A escolha e disponibilidade dependem do navegador e sistema operacional. O Lectio não envia arquivos para nenhum servidor próprio. O navegador pode consultar o provedor para sintetizar a fala.

## Publicação

O workflow de GitHub Pages compila e publica `dist/` a cada push em `main`, após os testes. No GitHub, configure **Settings → Pages → Build and deployment → GitHub Actions**. A URL usa a base `/lectio/` no build do workflow. Publicação depende dessa configuração do repositório.

## Limites e próximos passos

- OCR para PDFs escaneados com Tesseract.js.
- Voz offline de alta qualidade com Piper via WASM.
- Busca semântica, se no futuro for desejada, mantendo a restrição atual de não usar IA na v1.
- Importação e exportação das correções de pronúncia, com uma interface apropriada para compartilhar configurações sem editar JSON à mão.

O parser LaTeX é deliberadamente baseado em regras: macros arbitrárias e referências geradas dinamicamente podem exigir ajuste manual. O tratamento de duas colunas e cabeçalhos em PDF é heurístico; confira o texto extraído em documentos com diagramação incomum.

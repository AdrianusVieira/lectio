import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PdfView } from './components/PdfView';
import { FormattedView } from './components/FormattedView';
import { buildGlossary } from './lib/extract';
import { droppedFiles, fileEntry, pickDirectory } from './lib/files';
import { createSearch } from './lib/search';
import { SpeechReader, type SpeechSettings } from './lib/speech';
import type { DocumentData, FileEntry, Pronunciation } from './lib/types';

const OVERRIDES_KEY = 'lectio-pronunciations-v1';
const THEME_KEY = 'lectio-theme';
const positionKey = (path: string) => `lectio-position:${path}`;
const initialTheme = () => localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const initialOverrides = (): Record<string, Pronunciation> => { try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}'); } catch { return {}; } };

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter(v => /^pt[-_]BR$/i.test(v.lang)));
    load(); speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

function FileTree({ entries, selected, onSelect }: { entries: FileEntry[]; selected?: string; onSelect: (path: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const directories = new Set<string>();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  }
  const rows = [...directories].map(path => ({ path, directory: true })).concat(entries.map(entry => ({ path: entry.path, directory: false })))
    .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
  return <div className="file-list" role="tree">{rows.filter(row => !row.path.split('/').slice(0, -1).some((_, i, parts) => !expanded.has(parts.slice(0, i + 1).join('/')))).map(row => {
    const name = row.path.split('/').at(-1);
    const entry = entries.find(e => e.path === row.path);
    return <button type="button" role="treeitem" aria-selected={selected === row.path} aria-expanded={row.directory ? expanded.has(row.path) : undefined} className={`file-row ${selected === row.path ? 'selected' : ''} ${entry?.ignored ? 'muted' : ''}`} style={{ paddingLeft: `${12 + (row.path.split('/').length - 1) * 15}px` }} key={row.path} onClick={() => row.directory ? setExpanded(previous => { const next = new Set(previous); next.has(row.path) ? next.delete(row.path) : next.add(row.path); return next; }) : !entry?.ignored && onSelect(row.path)}>
      <span className="file-icon">{row.directory ? expanded.has(row.path) ? '▾' : '▸' : entry?.kind === 'pdf' ? '▣' : '◇'}</span><span className="truncate">{name}</span>
    </button>;
  })}</div>;
}

function SentenceView({ doc, index, word, onSeek }: { doc: DocumentData; index: number; word?: number; onSeek: (index: number) => void }) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [index]);
  return <div className="sentences">{doc.sentences.map((sentence, i) => {
    const words = sentence.text.split(/(\s+)/);
    let count = 0;
    return <button key={i} ref={i === index ? active : undefined} className={`sentence ${i === index ? 'active' : ''}`} onClick={() => onSeek(i)} title="Ler a partir daqui">
      {i === index && word !== undefined ? words.map((part, j) => { const number = /^\s+$/.test(part) ? -1 : count++; return <span key={j} className={number === word ? 'current-word' : ''}>{part}</span>; }) : sentence.text} </button>;
  })}</div>;
}

export default function App() {
  const [theme, setTheme] = useState(initialTheme);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [folderLoad, setFolderLoad] = useState(0);
  const [docs, setDocs] = useState<DocumentData[]>([]);
  const [definitions, setDefinitions] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>();
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'glossary' | 'search'>('glossary');
  const [query, setQuery] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [skipReferences, setSkipReferences] = useState(false);
  const [skipNotes, setSkipNotes] = useState(false);
  const [skipCaptions, setSkipCaptions] = useState(false);
  const [overrides, setOverrides] = useState(initialOverrides);
  const [position, setPosition] = useState(0);
  const [word, setWord] = useState<number>();
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [termQuery, setTermQuery] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const reader = useRef(new SpeechReader());
  const worker = useRef<Worker | null>(null);
  const voices = useVoices();
  const natural = voices.find(v => /microsoft/i.test(v.name) && /natural/i.test(v.name)) || voices.find(v => /natural/i.test(v.name));
  const voice = voices.find(v => v.name === voiceName) || natural || voices[0];
  const doc = docs.find(d => d.path === selected);
  const selectedFile = entries.find(e => e.path === selected)?.file;
  const glossary = useMemo(() => buildGlossary(docs, definitions), [docs, definitions]);
  const search = useMemo(() => docs.length ? createSearch(docs) : undefined, [docs]);
  const results = useMemo(() => query.trim() && search ? search.search(query).slice(0, 40) : [], [query, search]);
  const settings: SpeechSettings = { voice, rate, pitch, skipReferences, skipNotes, skipCaptions, overrides, definitions };

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); }, [theme]);
  useEffect(() => localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides)), [overrides]);
  useEffect(() => { reader.current.onPosition = (i, w) => { setPosition(i); setWord(w); setSelected(current => { if (current) localStorage.setItem(positionKey(current), String(i)); return current; }); }; reader.current.onState = () => { setSpeaking(reader.current.speaking); setPaused(reader.current.paused); }; return () => reader.current.stop(); }, []);
  useEffect(() => reader.current.update(settings)); // Current settings apply to next sentence.
  useEffect(() => { if (doc) reader.current.load(doc, settings, Number(localStorage.getItem(positionKey(doc.path)) || 0)); }, [doc?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEntries = useCallback((files: FileEntry[]) => {
    reader.current.stop(); worker.current?.terminate(); setEntries(files); setFolderLoad(value => value + 1); setDocs([]); setSelected(undefined); setError('');
    const supported = files.filter(e => e.kind);
    if (!supported.length) { setProgress('Nenhum formato compatível encontrado.'); return; }
    setProgress(`Processando 0/${supported.length} arquivos`);
    const instance = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); worker.current = instance;
    instance.onmessage = event => {
      const message = event.data;
      if (message.type === 'progress') setProgress(`Processando ${message.done}/${message.total} arquivos`);
      if (message.type === 'done') { setDocs(message.docs); setDefinitions(message.definitions); setSelected(message.docs.find((d: DocumentData) => d.kind === 'pdf')?.path || message.docs.find((d: DocumentData) => d.kind !== 'bib')?.path); setProgress(`${message.docs.length} documentos prontos`); instance.terminate(); }
      if (message.type === 'error') { setError(message.message); setProgress('Falha no processamento'); instance.terminate(); }
    };
    instance.postMessage({ entries: files });
  }, []);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName) || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.code === 'Space') { event.preventDefault(); speaking && !paused ? reader.current.pause() : reader.current.resume(); }
      if (event.code === 'ArrowRight') { event.preventDefault(); reader.current.moveSentence(1); }
      if (event.code === 'ArrowLeft') { event.preventDefault(); reader.current.moveSentence(-1); }
      if (event.code === 'ArrowDown') { event.preventDefault(); reader.current.moveParagraph(1); }
      if (event.code === 'ArrowUp') { event.preventDefault(); reader.current.moveParagraph(-1); }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [speaking, paused]);

  const changeOverride = (term: string, value: Pronunciation) => setOverrides(previous => ({ ...previous, [term]: value }));
  const ignored = entries.filter(e => e.ignored);
  const relevantTerms = glossary.filter(t => t.term.toLowerCase().includes(termQuery.toLowerCase())).slice(0, 200);
  const term = glossary.find(t => t.term === selectedTerm);

  return <div className="app" onDragOver={e => e.preventDefault()} onDrop={async e => { e.preventDefault(); try { loadEntries(await droppedFiles(e.dataTransfer)); } catch (err) { setError(String(err)); } }}>
    <header className="topbar"><div className="brand"><span className="brand-mark">L<span>.</span></span><div><strong>lectio</strong><small>LEITURA TÉCNICA</small></div></div><span className="top-subtitle">Seus documentos, em voz alta.</span><div className="top-actions"><span className="local-badge">◇ PROCESSAMENTO LOCAL</span><button className="icon-button" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">{theme === 'dark' ? '☼' : '☾'}</button></div></header>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-head"><span className="eyebrow">BIBLIOTECA</span><span>{entries.filter(e => e.kind).length} ARQUIVOS</span></div>
        <div className="folder-actions"><button className="primary" onClick={async () => { try { loadEntries(await pickDirectory()); } catch (e) { if (e instanceof Error && e.name !== 'AbortError') fileInput.current?.click(); } }}>＋ Abrir pasta</button><input ref={fileInput} type="file" multiple style={{ display: 'none' }} {...{ webkitdirectory: '' }} onChange={e => { loadEntries([...e.target.files || []].map(file => fileEntry(file, file.webkitRelativePath || file.name))); e.target.value = ''; }} /></div>
        {entries.length ? <FileTree key={folderLoad} entries={entries} selected={selected} onSelect={setSelected} /> : <div className="drop-instruction"><span>↳</span>Solte uma pasta aqui ou abra pelo botão acima.<small>PDF · TEX · BIB · MD · TXT</small></div>}
        {ignored.length > 0 && <details className="ignored"><summary>{ignored.length} arquivo(s) ignorado(s)</summary><ul>{ignored.slice(0, 100).map(e => <li key={e.path}>{e.path}</li>)}</ul></details>}
        <div className="sidebar-footer">Os arquivos ficam neste dispositivo. Nenhum documento é enviado pelo Lectio.</div>
      </aside>
      <main className="main"><div className="document-bar"><div><span className="eyebrow">DOCUMENTO</span><h1>{doc?.name || 'Escolha uma pasta para começar'}</h1><p>{doc?.sourcePath ? `Voz a partir de ${doc.sourcePath}; PDF para visualização.` : doc ? `${doc.sentences.length} frases · ${doc.kind.toUpperCase()}` : 'Leitura de documentos técnicos em português'}</p></div><span className="status">{progress || 'PRONTO'}</span></div>
        {error && <div className="error" role="alert">{error}</div>}
        {doc ? <div className="document-content"><div className="document-view"><div className="section-title">VISUALIZAÇÃO <span>{doc.kind.toUpperCase()}</span></div>{doc.kind === 'pdf' && selectedFile ? <PdfView file={selectedFile} pageNumber={doc.sentences[position]?.page} onSeekText={(text, page) => { const found = doc.sentences.findIndex(s => (!s.page || s.page === page) && s.text.includes(text.trim())); reader.current.seek(found >= 0 ? found : Math.max(0, doc.sentences.findIndex(s => s.page === page))); }} /> : <FormattedView doc={doc} onSeek={i => reader.current.seek(i)} />}</div><div className="reading-view"><div className="section-title">TEXTO PARA LEITURA <span>CLIQUE PARA COMEÇAR</span></div><SentenceView doc={doc} index={position} word={word} onSeek={i => reader.current.seek(i)} /></div></div> : <div className="empty-state"><div className="empty-icon">L.</div><h2>Uma biblioteca que fala a sua língua.</h2><p>Abra uma pasta de documentos. O Lectio organiza os arquivos, encontra termos técnicos e lê cada frase em voz alta.</p><div className="empty-steps"><span>01 &nbsp; ABRIR PASTA</span><span>02 &nbsp; EXPLORAR</span><span>03 &nbsp; OUVIR</span></div></div>}
        <div className="transport"><div className="transport-buttons"><button title="Parágrafo anterior (↑)" onClick={() => reader.current.moveParagraph(-1)}>⇤</button><button title="Frase anterior (←)" onClick={() => reader.current.moveSentence(-1)}>←</button><button className="play" title="Reproduzir ou pausar (espaço)" disabled={!doc} onClick={() => speaking && !paused ? reader.current.pause() : reader.current.resume()}>{speaking && !paused ? 'Ⅱ' : '▶'}</button><button title="Próxima frase (→)" onClick={() => reader.current.moveSentence(1)}>→</button><button title="Próximo parágrafo (↓)" onClick={() => reader.current.moveParagraph(1)}>⇥</button></div><div className="transport-info"><span>{doc ? `${Math.min(position + 1, doc.sentences.length)} / ${doc.sentences.length} FRASES` : 'SEM DOCUMENTO'}</span><div className="progress-track"><div style={{ width: doc?.sentences.length ? `${((position + 1) / doc.sentences.length) * 100}%` : '0%' }} /></div></div></div>
      </main>
      <aside className="inspector"><div className="tabs"><button className={tab === 'glossary' ? 'active' : ''} onClick={() => setTab('glossary')}>GLOSSÁRIO</button><button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>BUSCA</button></div>
        {tab === 'glossary' ? <div className="inspector-body"><p className="panel-intro">Siglas e termos encontrados na pasta.</p><input className="search-input" placeholder="Filtrar termos…" value={termQuery} onChange={e => setTermQuery(e.target.value)} /><div className="term-list">{relevantTerms.map(t => <button key={t.term} className={`term-row ${selectedTerm === t.term ? 'active' : ''}`} onClick={() => setSelectedTerm(t.term)}><span>{t.term}</span><span>{t.count}</span></button>)}</div>{term && <div className="term-detail"><h3>{term.term}</h3><p>{term.definition || 'Sem definição detectada'}</p><small>{term.files.length} arquivo(s) · {term.count} ocorrência(s)</small><label>PRONÚNCIA</label><select value={overrides[term.term]?.mode || 'auto'} onChange={e => changeOverride(term.term, { ...overrides[term.term], mode: e.target.value === 'auto' ? undefined : e.target.value as Pronunciation['mode'] })}><option value="auto">Automática</option><option value="spell">Soletrar</option><option value="word">Ler como palavra</option><option value="expand">Expandir na primeira vez</option></select><input placeholder="Ou escreva a pronúncia exata" value={overrides[term.term]?.value || ''} onChange={e => changeOverride(term.term, { ...overrides[term.term], value: e.target.value })} /><div className="contexts">{term.contexts.map((context, i) => <p key={i}>{context}</p>)}</div><small>{term.files.join(' · ')}</small></div>}</div> : <div className="inspector-body"><p className="panel-intro">Busca em todos os documentos, com acentos normalizados.</p><input className="search-input" placeholder="Buscar na pasta…" value={query} onChange={e => setQuery(e.target.value)} /><div className="results">{results.map(result => <button key={result.id} onClick={() => { setSelected(result.id); setQuery(''); }}>{result.path}<span>ABRIR ↗</span></button>)}</div></div>}
        <div className="settings"><div className="section-title">VOZ <span>PT-BR</span></div><select value={voice?.name || ''} onChange={e => setVoiceName(e.target.value)}>{voices.length ? voices.map(v => <option key={v.name} value={v.name}>{v.name} {v.localService ? '· local' : '· online'}</option>) : <option value="">Aguardando vozes do navegador</option>}</select><div className="range-row"><label>VELOCIDADE <b>{rate.toFixed(1)}×</b></label><input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(+e.target.value)} /></div><div className="range-row"><label>TOM <b>{pitch.toFixed(1)}</b></label><input type="range" min="0.5" max="2" step="0.1" value={pitch} onChange={e => setPitch(+e.target.value)} /></div><p className="voice-notice">{voice?.localService ? 'Esta voz é local.' : 'Vozes online podem enviar o texto ao provedor (Microsoft/Google).'} A síntese usa o navegador.{voices.length > 0 && !natural && ' Para ouvir vozes mais naturais, experimente abrir o Lectio no Microsoft Edge ou instalar mais vozes pt-BR no sistema.'}</p><details className="reading-options"><summary>Opções de leitura</summary><label><input type="checkbox" checked={skipReferences} onChange={e => setSkipReferences(e.target.checked)} /> Pular referências</label><label><input type="checkbox" checked={skipNotes} onChange={e => setSkipNotes(e.target.checked)} /> Pular notas</label><label><input type="checkbox" checked={skipCaptions} onChange={e => setSkipCaptions(e.target.checked)} /> Pular legendas</label></details></div>
      </aside>
    </div>
  </div>;
}
